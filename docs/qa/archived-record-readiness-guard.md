# Archived commercial records must not generate readiness requests

## Finding

`public.create_readiness_requests_for_due_records(target_organisation_id uuid)` currently selects due contracts without excluding archived commercial records.

The function filters by organisation, record type, end date, SME email and the 100-day trigger, but it does not require `commercial_records.archived_at is null`.

As a result, an archived record can become eligible for a new readiness request when:

- it has an end date and SME email;
- it is inside or beyond the 100-day window; and
- no request already exists for the same commercial record and recipient email.

This contradicts the application lifecycle model. Archived records are removed from active dashboard totals and work queues, so they must not silently create new SME work.

## Current production data

A read-only integrity check on 30 July 2026 found no archived record currently meeting all of those conditions without an existing request. No production data was changed.

## Proposed reviewed migration

Do not apply this blindly to production. Add the active-record predicate and test it in preview:

```sql
create or replace function public.create_readiness_requests_for_due_records(
  target_organisation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if not private.has_organisation_role(
    target_organisation_id,
    array['owner','admin','member']::public.organisation_role[]
  ) then
    raise exception 'Not permitted';
  end if;

  insert into public.readiness_requests (
    organisation_id,
    commercial_record_id,
    recipient_name,
    recipient_email,
    due_date,
    trigger_date
  )
  select
    cr.organisation_id,
    cr.id,
    cr.sme_name,
    cr.sme_email,
    cr.end_date - 30,
    cr.end_date - 100
  from public.commercial_records cr
  where cr.organisation_id = target_organisation_id
    and cr.record_type = 'contract'
    and cr.archived_at is null
    and cr.end_date is not null
    and cr.sme_email is not null
    and cr.end_date - 100 <= current_date
  on conflict (commercial_record_id, recipient_email) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
```

## Acceptance tests

1. A due active contract with an SME email creates one request.
2. A due archived contract with an SME email creates no request.
3. Archiving a contract before reconciliation prevents future request creation.
4. Restoring the contract makes it eligible again, subject to duplicate prevention.
5. Existing requests remain retained as lifecycle evidence when a record is archived.
6. A member of another organisation cannot invoke the function successfully.

## Product implication

Readiness generation must operate only on the active commercial register. Historical evidence can remain linked to archived records, but archived records must not create fresh work or distort operational counts.