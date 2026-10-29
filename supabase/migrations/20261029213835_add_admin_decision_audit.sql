ALTER TABLE public.loan_applications
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.loan_applications.decided_at IS
  'Fecha y hora de la decisión final tomada por administración.';

COMMENT ON COLUMN public.loan_applications.decided_by IS
  'UUID de la cuenta administradora que tomó la decisión final.';
