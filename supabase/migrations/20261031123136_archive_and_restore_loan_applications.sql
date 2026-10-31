ALTER TABLE public.loan_applications
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.loan_applications.archived_at IS
  'Fecha en que el administrador archivó la solicitud; NULL si está activa.';

COMMENT ON COLUMN public.loan_applications.archived_by IS
  'Cuenta administradora que archivó la solicitud.';
