# FY27 budget lines access remediation

## Finding

The production `public.fy27_budget_lines` table contains 30 rows of commercial budget data and currently has row-level security disabled. Both `anon` and `authenticated` hold broad table privileges, including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE`.

The table includes commercially sensitive fields such as vendor, product, owner, purchase-order references, contract references, comments, annual prices, total contract prices, and FY27 budget values.

This is a production security defect. It must not be corrected blindly because the table has no `organisation_id`, so there is no safe tenant predicate to apply without first agreeing whether it is legacy single-tenant data, migration staging data, or a live application dependency.

## Immediate production change proposal

After confirming that no public client intentionally reads or writes this table:

```sql
begin;

revoke all privileges on table public.fy27_budget_lines from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.fy27_budget_lines from authenticated;

alter table public.fy27_budget_lines enable row level security;

-- Do not add an allow-all policy. Add an explicit policy only after the
-- ownership/tenancy model and application access path have been confirmed.

commit;
```

If the application still needs authenticated read access during migration, expose a server-only route using the service role, or add a deliberately narrow policy after an ownership column and membership relationship exist.

## Required verification before applying

1. Search the application and deployment logs for reads or writes to `fy27_budget_lines`.
2. Confirm whether any production client uses the Supabase Data API directly.
3. Export the current grants and row count for rollback evidence.
4. Apply first in a development branch or maintenance window.
5. Verify anonymous REST and GraphQL access returns no rows or permission denied.
6. Verify the authenticated Trevecta workflow still loads any budget views that genuinely depend on the table.
7. Re-run Supabase security advisors.

## Rollback

Rollback should restore only the minimum privileges proven to be required. Do not restore broad `anon` access or mutation privileges.

Example temporary authenticated read rollback:

```sql
grant select on table public.fy27_budget_lines to authenticated;
```

RLS would still require a corresponding explicit policy; this is intentionally not supplied until the row ownership model is agreed.

## Structural follow-up

The long-term fix is to migrate operational budget lines into an organisation-scoped table with:

- `organisation_id` and a tenant-safe foreign key;
- RLS policies based on `organisation_members`;
- immutable import provenance;
- controlled create/update/archive operations through server routes;
- audit events for corrections and lifecycle changes;
- no direct anonymous access.
