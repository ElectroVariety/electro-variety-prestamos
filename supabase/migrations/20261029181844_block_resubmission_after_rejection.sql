create or replace function public.enforce_one_pending_loan_application_per_dni()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  normalized_dni text;
  existing_status text;
begin
  normalized_dni := regexp_replace(coalesce(new.dni, ''), '[^0-9]', '', 'g');

  if normalized_dni = '' or coalesce(new.status, '') not in ('pending', 'under_review') then
    return new;
  end if;

  -- Serialize submissions for this normalized DNI to avoid concurrent duplicates.
  perform pg_advisory_xact_lock(hashtextextended(normalized_dni, 1));

  select existing.status into existing_status
  from public.loan_applications existing
  where regexp_replace(coalesce(existing.dni, ''), '[^0-9]', '', 'g') = normalized_dni
    and existing.status in ('pending', 'under_review', 'rejected')
  order by case when existing.status = 'rejected' then 0 else 1 end
  limit 1;

  if existing_status = 'rejected' then
    raise exception using
      errcode = 'P0001',
      message = 'DNI_APPLICATION_PREVIOUSLY_REJECTED';
  elsif existing_status in ('pending', 'under_review') then
    raise exception using
      errcode = 'P0001',
      message = 'DNI_PENDING_APPLICATION_EXISTS';
  end if;

  return new;
end;
$$;
