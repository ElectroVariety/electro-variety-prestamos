ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS location_geocoding_consent boolean NOT NULL DEFAULT false;
