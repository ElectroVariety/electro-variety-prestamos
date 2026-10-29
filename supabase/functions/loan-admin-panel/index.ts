import { createClient } from "@supabase/supabase-js";

const BUCKET = "loan-private-documents";
const origins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://electrovariety.github.io",
]);
const baseHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };

function respond(body: Record<string, unknown>, status: number, origin: string) {
  const headers = new Headers(baseHeaders);
  if (origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (request.method === "OPTIONS") {
    const headers = new Headers({ "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "86400", "Vary": "Origin" });
    if (origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return respond({ error: "Método no permitido." }, 405, origin);
  if (!origins.has(origin)) return respond({ error: "Origen no autorizado." }, 403, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("LOAN_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !serviceKey) return respond({ error: "El servicio no está configurado." }, 500, origin);
  if (!token) return respond({ error: "Iniciá sesión para continuar." }, 401, origin);

  const authClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "La sesión no es válida. Iniciá sesión nuevamente." }, 401, origin);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: access, error: accessError } = await admin.from("loan_admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
  if (accessError) {
    console.error("No se pudo comprobar el acceso administrativo:", accessError.message);
    return respond({ error: "No se pudo comprobar tu autorización." }, 500, origin);
  }
  if (!access) return respond({ error: "Tu cuenta no tiene permiso para revisar solicitudes." }, 403, origin);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch { return respond({ error: "La solicitud no tiene un formato válido." }, 400, origin); }

  if (body.action === "geocode") {
    const id = typeof body.application_id === "string" ? body.application_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: "La solicitud indicada no es válida." }, 400, origin);

    const { data: application, error: applicationError } = await admin
      .from("loan_applications")
      .select("address,locality,location_geocoding_consent,location_latitude,location_longitude")
      .eq("id", id)
      .maybeSingle();
    if (applicationError) {
      console.error("No se pudo leer el domicilio para el mapa:", applicationError.message);
      return respond({ error: "No se pudo leer el domicilio de la solicitud." }, 500, origin);
    }
    if (!application) return respond({ error: "La solicitud no existe." }, 404, origin);
    if (application.location_geocoding_consent !== true) {
      return respond({ error: "La persona no autorizó compartir su domicilio con Mapbox." }, 403, origin);
    }
    if (application.location_latitude != null && application.location_longitude != null) {
      return respond({
        success: true,
        latitude: application.location_latitude,
        longitude: application.location_longitude,
        cached: true,
      }, 200, origin);
    }

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    if (!mapboxToken) return respond({ error: "Falta configurar el geocodificador privado en Supabase." }, 503, origin);

    const addressQuery = `${application.address}, ${application.locality}, Argentina`.replaceAll(";", " ").replace(/\s+/g, " ").trim();
    if (addressQuery.length > 256) {
      return respond({ error: "El domicilio es demasiado extenso para ubicarlo. Revisá que contenga calle y altura." }, 422, origin);
    }

    const geocodeUrl = new URL("https://api.mapbox.com/search/geocode/v6/forward");
    geocodeUrl.searchParams.set("q", addressQuery);
    geocodeUrl.searchParams.set("access_token", mapboxToken);
    geocodeUrl.searchParams.set("country", "AR");
    geocodeUrl.searchParams.set("types", "address");
    geocodeUrl.searchParams.set("autocomplete", "false");
    geocodeUrl.searchParams.set("permanent", "true");
    geocodeUrl.searchParams.set("limit", "1");
    geocodeUrl.searchParams.set("language", "es");

    let geocodeResponse: Response;
    try {
      geocodeResponse = await fetch(geocodeUrl, { signal: AbortSignal.timeout(12_000) });
    } catch (error) {
      console.error("No respondió el geocodificador:", error instanceof Error ? error.name : "fetch error");
      return respond({ error: "Mapbox no respondió. Podés volver a intentar más tarde." }, 502, origin);
    }
    if (!geocodeResponse.ok) {
      console.error("El geocodificador devolvió un error HTTP:", geocodeResponse.status);
      return respond({ error: "Mapbox no pudo completar la búsqueda. Revisá la configuración y volvé a intentar." }, 502, origin);
    }

    let geocodeResult: any;
    try {
      geocodeResult = await geocodeResponse.json();
    } catch {
      return respond({ error: "Mapbox devolvió una respuesta inválida." }, 502, origin);
    }
    const feature = Array.isArray(geocodeResult?.features) ? geocodeResult.features[0] : null;
    const properties = feature?.properties;
    const matchCode = properties?.match_code;
    const accuracy = properties?.coordinates?.accuracy;
    const coordinates = feature?.geometry?.coordinates;
    if (
      properties?.feature_type !== "address" ||
      matchCode?.address_number !== "matched" ||
      matchCode?.street !== "matched" ||
      !["rooftop", "point"].includes(accuracy) ||
      !Array.isArray(coordinates) ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1]) ||
      coordinates[0] < -180 || coordinates[0] > 180 ||
      coordinates[1] < -90 || coordinates[1] > 90
    ) {
      return respond({
        error: "Mapbox no encontró una coincidencia precisa para calle y altura. Revisá el domicilio; no se guardó ningún punto.",
      }, 422, origin);
    }

    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    const { data: saved, error: saveError } = await admin
      .from("loan_applications")
      .update({ location_latitude: latitude, location_longitude: longitude })
      .eq("id", id)
      .is("location_latitude", null)
      .is("location_longitude", null)
      .select("location_latitude,location_longitude")
      .maybeSingle();
    if (saveError) {
      console.error("No se pudieron guardar las coordenadas:", saveError.message);
      return respond({ error: "No se pudo guardar la ubicación privada." }, 500, origin);
    }
    if (saved) {
      return respond({ success: true, latitude, longitude, accuracy, cached: false }, 200, origin);
    }

    const { data: cached, error: cachedError } = await admin
      .from("loan_applications")
      .select("location_latitude,location_longitude")
      .eq("id", id)
      .maybeSingle();
    if (cachedError || cached?.location_latitude == null || cached?.location_longitude == null) {
      return respond({ error: "No se pudo confirmar el guardado de la ubicación." }, 500, origin);
    }
    return respond({
      success: true,
      latitude: cached.location_latitude,
      longitude: cached.location_longitude,
      cached: true,
    }, 200, origin);
  }

  if (body.action === "decide") {
    const id = typeof body.application_id === "string" ? body.application_id : "";
    const status = body.status;
    if (!id || (status !== "approved" && status !== "rejected")) return respond({ error: "La decisión indicada no es válida." }, 400, origin);
    const { data, error } = await admin.from("loan_applications").update({ status }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
    if (error) {
      console.error("No se pudo actualizar la solicitud:", error.message);
      return respond({ error: "No se pudo actualizar la solicitud." }, 500, origin);
    }
    if (!data) return respond({ error: "La solicitud ya fue revisada o no existe. Actualizá el listado." }, 409, origin);
    return respond({ success: true }, 200, origin);
  }

  if (body.action !== "list") return respond({ error: "La operación solicitada no es válida." }, 400, origin);
  const status = body.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected" && status !== "all") return respond({ error: "El filtro indicado no es válido." }, 400, origin);

  let query = admin.from("loan_applications").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: applications, error: listError } = await query;
  if (listError) {
    console.error("No se pudieron leer solicitudes:", listError.message);
    return respond({ error: "No se pudieron cargar las solicitudes. Verificá el esquema de loan_applications." }, 500, origin);
  }

  try {
    const results = await Promise.all((applications ?? []).map(async (application) => {
      const [incomeResult, docsResult] = await Promise.all([
        admin.from("loan_income_sources").select("*").eq("application_id", application.id),
        admin.from("loan_documents").select("id,document_type,storage_path,original_filename,file_size_bytes").eq("application_id", application.id),
      ]);
      if (incomeResult.error || docsResult.error) throw new Error("No se pudieron cargar los ingresos o los documentos asociados.");
      const documents = await Promise.all((docsResult.data ?? []).map(async (document) => {
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(document.storage_path, 300);
        if (error || !data) throw new Error("No se pudo preparar el acceso temporal a un documento.");
        return { id: document.id, document_type: document.document_type, original_filename: document.original_filename, file_size_bytes: document.file_size_bytes, signed_url: data.signedUrl };
      }));
      return { ...application, incomes: incomeResult.data ?? [], documents };
    }));
    return respond({ success: true, applications: results }, 200, origin);
  }
  catch (error) {
    console.error("No se pudieron preparar las solicitudes:", error instanceof Error ? error.message : error);
    return respond({ error: "No se pudieron cargar los detalles y documentos." }, 500, origin);
  }
});
