# FY27 budget table security remediation

## Confirmed exposure

`public.fy27_budget_lines` is exposed through the public API schema with row-level security disabled. Both `anon` and `authenticated` currently hold broad table privileges including `SELECT`, `INSERT`, `UPDATE`, `DELETE` and `TRUNCATE`.

This means the table must be treated as potentially readable and mutable without application-level tenant checks until proven otherwise.

## Why this is not being changed blindly

The table appears to support a legacy workflow outside the new commercial-register slice. Enabling RLS or revoking grants without first identifying the caller could break that workflow. The production change therefore needs a staged rollout with an explicit rollback plan.

## Required remediation sequence

1. Identify every application, automation, direct API call and service account that reads or writes `fy27_budget_lines`.
2. Confirm whether anonymous access is intentional. The expected answer for commercial budget data should be no.
3. Immediately revoke `TRUNCATE`, `DELETE`, `UPDATE` and `INSERT` from `anon` in the reviewed migration unless a documented public-write dependency exists.
4. Revoke `SELECT` from `anon` unless a documented public-read dependency exists.
5. Add an `organisation_id` or equivalent tenant key if the table does not already contain a reliable tenant boundary.
6. Enable RLS and add least-privilege policies for the actual application roles.
7. Move privileged server-side writes behind a reviewed service-role or security-definer function with explicit organisation and role checks.
8. Add automated tests proving anonymous users cannot read or mutate rows and that organisation A cannot access organisation B.
9. Verify the legacy workflow in preview or a Supabase branch before production rollout.
10. Re-run Supabase security advisors and inspect PostgREST and database logs after release.

## Suggested containment migration

The first migration should be intentionally narrow and reversible:

```sql
begin;

revoke truncate, delete, update, insert, references, trigger
on table public.fy27_budget_lines
from anon;

-- Revoke anonymous reads only after the legacy read path is confirmed.
-- revoke select on table public.fy27_budget_lines from anon;

commit;
```

A second reviewed migration should enable RLS and add tenant-aware policies only after the table's ownership model is confirmed.

## Release checks

- Existing import and reporting jobs still complete.
- Anonymous REST and GraphQL requests cannot mutate the table.
- Anonymous reads are removed unless formally justified.
- Authenticated users can only access rows for organisations they belong to.
- No service uses a publishable key as a substitute for privileged server credentials.
- Security advisor no longer reports `rls_disabled_in_public` or anonymous GraphQL exposure for this table.
