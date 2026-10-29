ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS location_latitude double precision,
  ADD COLUMN IF NOT EXISTS location_longitude double precision;

ALTER TABLE public.loan_applications
  ADD CONSTRAINT loan_applications_location_coordinates_pair_check
  CHECK (
    (location_latitude IS NULL AND location_longitude IS NULL)
    OR
    (
      location_latitude BETWEEN -90 AND 90
      AND location_longitude BETWEEN -180 AND 180
    )
  );
