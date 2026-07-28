# Lovable First Prompt

Build only the first functional vertical slice of Trevecta. Do not create a cosmetic mock-up and do not alter the established Supabase schema.

## Existing backend contract

Use the existing Supabase project and the tables/functions defined by `supabase/migrations/0001_foundation.sql`:

- `profiles`
- `organisations`
- `organisation_members`
- `imports`
- `exceptions`
- `actions`
- RPC function `create_organisation(organisation_name, organisation_slug)`

## Required pages

- `/login`
- `/signup`
- `/forgot-password`
- `/dashboard`
- `/organisations/new`
- `/imports`

## Required behaviour

1. Implement real Supabase email/password authentication.
2. Valid login creates a session and redirects to `/dashboard`.
3. Invalid login displays a clear error.
4. Protected routes redirect unauthenticated users to `/login`.
5. Refreshing `/dashboard` preserves an active session.
6. Logout clears the session and returns to `/login`.
7. A signed-in user with no organisation is directed to `/organisations/new`.
8. Organisation creation must call the existing `create_organisation` RPC, not direct inserts.
9. The dashboard must show the active organisation name and real counts from `imports`, `exceptions`, and `actions`; zero-value empty states are acceptable.
10. The Imports page may be a shell for now, but its upload control must be explicitly marked as not yet enabled rather than pretending to work.

## Engineering constraints

- TypeScript, Tailwind and shadcn/ui.
- Never place a service-role key in frontend code.
- Use only the public Supabase URL and publishable key through environment variables.
- Do not rename, drop, recreate or modify database tables, functions, enums or RLS policies.
- Do not use editable user metadata for roles or organisation authorization.
- Keep auth/session logic in a reusable provider or hook.
- Include loading and error states.
- Before editing, state the files you intend to create or change.
- After editing, report exactly which acceptance criteria were implemented and any that remain unverified.

## Visual direction

Professional, calm B2B control product. Clean light interface, strong typography, restrained cards and tables. Avoid generic neon AI styling, oversized gradients and fake analytics.
