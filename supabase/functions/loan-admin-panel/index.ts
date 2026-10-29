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

  if (body.action === "decide") {
    const id = typeof body.application_id === "string" ? body.application_id : "";
    const status = body.status;
    if (!id || (status !== "approved" && status !== "rejected")) return respond({ error: "La decisión indicada no es válida." }, 400, origin);
    const { data, error } = await admin.from("loan_applications").update({ status }).eq("id", id).in("status", ["pending", "under_review"]).select("id").maybeSingle();
    if (error) {
      console.error("No se pudo actualizar la solicitud:", error.message);
      return respond({ error: "No se pudo actualizar la solicitud." }, 500, origin);
    }
    if (!data) return respond({ error: "La solicitud ya fue revisada o no existe. Actualizá el listado." }, 409, origin);
    return respond({ success: true }, 200, origin);
  }

  if (body.action !== "list") return respond({ error: "La operación solicitada no es válida." }, 400, origin);
  const status = body.status;
  if (status !== "pending" && status !== "under_review" && status !== "approved" && status !== "rejected" && status !== "all") return respond({ error: "El filtro indicado no es válido." }, 400, origin);

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
