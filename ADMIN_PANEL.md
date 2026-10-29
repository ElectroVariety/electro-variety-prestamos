# Panel de administración

El panel se publica en https://electrovariety.github.io/prestamos-variety/#/admin. Inicia sesión con Supabase Auth; solo las cuentas registradas en public.loan_admin_users pueden consultar solicitudes o decidirlas.

## Acceso de administradores

Crear las cuentas desde Authentication → Users. Para autorizar una cuenta existente, usar su UUID de Auth:

```sql
insert into public.loan_admin_users (user_id)
values ('UUID-DE-LA-CUENTA-AUTORIZADA')
on conflict (user_id) do nothing;
```

La tabla tiene RLS habilitado y no concede acceso a anon ni authenticated. La Edge Function valida el JWT y la lista antes de consultar datos. La clave de servicio se mantiene en Edge Functions; nunca se publica en el frontend.

Los documentos permanecen en el bucket privado loan-private-documents. El panel genera enlaces firmados con vencimiento de cinco minutos.

## Despliegue

El workflow de GitHub Pages compila y publica automáticamente cada actualización de main. Para cambios en la Edge Function, desplegar loan-admin-panel desde Supabase con verify_jwt habilitado. La migración 20261029000100_admin_access.sql crea la lista de administradores.
