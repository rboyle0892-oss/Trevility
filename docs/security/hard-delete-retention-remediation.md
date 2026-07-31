# Hard-delete retention remediation

## Finding

The application presents commercial records and readiness requests as retained lifecycle evidence, using soft archive/restore for commercial records. However, current Supabase RLS policies still permit organisation owners and admins to issue direct `DELETE` operations against both `commercial_records` and `readiness_requests`.

This creates a control mismatch:

- the UI promises recoverable archive and retained evidence;
- direct database/API access can permanently remove the same evidence;
- deleted readiness history can make a contract appear never requested or never submitted;
- deleted commercial records can remove source provenance, archive reasons and linked decision context;
- there is no immutable audit event proving who deleted what or why.

## Required change

Treat permanent deletion as an exceptional, separately governed retention operation rather than ordinary CRUD.

1. Remove normal owner/admin `DELETE` access from `commercial_records` and `readiness_requests`.
2. Keep application lifecycle handling as archive, cancel and restore.
3. Add cancellation fields to readiness requests where required rather than deleting them.
4. Add immutable audit events for archive, restore, cancel, correction and any approved purge.
5. If regulatory purge is required, expose it only through a reviewed server-side operation with:
   - explicit elevated authorisation;
   - reason and approval reference;
   - dependency checks;
   - confirmation showing affected linked data;
   - an audit event written before removal;
   - documented retention policy.
6. Add automated tests proving ordinary members, admins and owners cannot permanently delete lifecycle evidence through the public API.

## Rollout

Do not change production policies blindly. First inventory any scripts or jobs that rely on hard deletion, add the replacement archive/cancel path, test in preview, then apply a reviewed migration and re-run tenancy and role tests.
