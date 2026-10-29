ALTER TABLE public.loan_applications
  DROP COLUMN IF EXISTS location_latitude,
  DROP COLUMN IF EXISTS location_longitude,
  DROP COLUMN IF EXISTS location_geocoding_consent;
