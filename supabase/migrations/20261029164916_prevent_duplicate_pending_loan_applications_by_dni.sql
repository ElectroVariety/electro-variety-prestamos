create or replace function public.enforce_one_pending_loan_application_per_dni()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  normalized_dni text;
begin
  normalized_dni := regexp_replace(coalesce(new.dni, ''), '[^0-9]', '', 'g');

  if normalized_dni = '' or new.status not in ('pending', 'under_review') then
    return new;
  end if;

  -- Serialize submissions for this normalized DNI to avoid concurrent duplicates.
  perform pg_advisory_xact_lock(hashtextextended(normalized_dni, 1));

  if exists (
    select 1
    from public.loan_applications existing
    where regexp_replace(coalesce(existing.dni, ''), '[^0-9]', '', 'g') = normalized_dni
      and existing.status in ('pending', 'under_review')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'DNI_PENDING_APPLICATION_EXISTS';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_one_pending_loan_application_per_dni() from public, anon, authenticated;
grant execute on function public.enforce_one_pending_loan_application_per_dni() to service_role;

drop trigger if exists loan_applications_one_pending_per_dni on public.loan_applications;
create trigger loan_applications_one_pending_per_dni
before insert on public.loan_applications
for each row
execute function public.enforce_one_pending_loan_application_per_dni();
