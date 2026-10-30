ALTER TABLE public.loan_applications
  ADD COLUMN referrer_relationship text,
  ADD CONSTRAINT loan_applications_referrer_relationship_check
    CHECK (
      (
        has_referrer
        AND NULLIF(BTRIM(referrer_relationship), '') IS NOT NULL
      )
      OR (
        NOT has_referrer
        AND referrer_relationship IS NULL
      )
    );

COMMENT ON COLUMN public.loan_applications.referrer_relationship IS
  'Vínculo entre la persona solicitante y quien recomendó la solicitud.';
