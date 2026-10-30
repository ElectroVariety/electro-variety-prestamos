ALTER TABLE public.loan_applications
  ADD COLUMN has_referrer boolean NOT NULL DEFAULT false,
  ADD COLUMN referrer_full_name text,
  ADD COLUMN referrer_phone text,
  ADD CONSTRAINT loan_applications_referrer_details_check
    CHECK (
      (
        has_referrer
        AND NULLIF(BTRIM(referrer_full_name), '') IS NOT NULL
        AND NULLIF(BTRIM(referrer_phone), '') IS NOT NULL
      )
      OR (
        NOT has_referrer
        AND referrer_full_name IS NULL
        AND referrer_phone IS NULL
      )
    );

COMMENT ON COLUMN public.loan_applications.has_referrer IS
  'Indica si la persona solicitante llegó recomendada por alguien.';
COMMENT ON COLUMN public.loan_applications.referrer_full_name IS
  'Nombre y apellido de la persona que recomendó la solicitud, cuando corresponda.';
COMMENT ON COLUMN public.loan_applications.referrer_phone IS
  'Teléfono de la persona que recomendó la solicitud, cuando corresponda.';
