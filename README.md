# Trevecta MVP

Trevecta is a secure, multi-tenant IT spend and renewal control application.

## MVP outcome

A customer can sign in, create or join an organisation, upload budget/PO/contract data, review material control exceptions, assign actions, and view a leadership-ready summary.

## Build order

1. Supabase schema, authentication boundary, and RLS
2. Typed application contract and synthetic test data
3. Lovable UI shell connected to the existing Supabase project
4. Functional auth acceptance tests
5. CSV import and exception workflows

## Non-negotiable rules

- No service-role or secret keys in browser code or this repository.
- Every customer-owned row is scoped by `organisation_id`.
- RLS is enabled on every exposed table.
- Imported source values are retained separately from cleaned values.
- A screen or button is not complete unless its end-to-end action works.
- Lovable must not alter the database schema without an explicit migration.

## Current infrastructure

- GitHub repository: this repository
- Supabase project: `Budget framework`
- Frontend: Lovable, after the backend contract is verified

See `docs/mvp-scope.md` and `supabase/migrations/0001_foundation.sql`.
