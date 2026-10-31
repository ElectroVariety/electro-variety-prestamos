ALTER TABLE public.loan_applications
  ADD COLUMN is_electro_variety_client boolean;

COMMENT ON COLUMN public.loan_applications.is_electro_variety_client IS
  'Indica si la persona solicitante es cliente de Electro Variety; NULL para solicitudes anteriores a esta pregunta.';
