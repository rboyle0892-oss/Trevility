# Trevecta MVP Scope

## Product promise

Upload existing IT budget, purchase-order and contract data; identify material control exceptions; assign corrective actions; and produce a leadership-ready view.

## First vertical slice

The first release proves that the application is real rather than a static mock-up:

1. User can sign up and sign in with Supabase Auth.
2. Unauthenticated users cannot open protected routes.
3. User can create an organisation.
4. Organisation membership controls all customer data access.
5. User can sign out and the session is removed.
6. User can open an Imports page and see the intended CSV workflow shell.

## Initial roles

- `owner`: can manage organisation membership and all records.
- `admin`: can manage organisation records and actions.
- `member`: can view and update assigned operational records.
- `viewer`: read-only access.

## Initial screens

- `/login`
- `/signup`
- `/forgot-password`
- `/dashboard`
- `/organisations/new`
- `/imports`
- `/exceptions`
- `/actions`
- `/settings`

## Authentication acceptance criteria

- Login controls call Supabase Auth; no dead buttons.
- Valid credentials create a session and redirect to `/dashboard`.
- Invalid credentials produce a visible error.
- Refreshing a protected page preserves a valid session.
- Unauthenticated access to protected routes redirects to `/login`.
- Logout clears the session and blocks protected routes.

## Data ownership rules

- Every commercial record belongs to exactly one organisation.
- Access is granted only through `organisation_members`.
- Roles are stored in database rows, not editable user metadata.
- Every exposed table has RLS enabled.
- Source import data is retained for traceability.

## Deliberately excluded from the first slice

- ServiceNow, ERP or accounting integrations
- AI contract extraction
- Configurable workflow builders
- Automated savings claims
- Advanced currency conversion
- Full procurement approvals
- Production billing

## Lovable constraints

Lovable must consume the established database contract. It must not rename, drop, recreate or materially alter database objects without an explicit migration reviewed in GitHub.
