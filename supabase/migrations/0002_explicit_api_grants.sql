-- Remove anonymous API access to Trevecta customer tables.
-- Authenticated access remains constrained by row-level security policies.

revoke all on table
  public.profiles,
  public.organisations,
  public.organisation_members,
  public.imports,
  public.exceptions,
  public.actions
from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.organisations to authenticated;
grant select, insert, update, delete on table public.organisation_members to authenticated;
grant select, insert, update on table public.imports to authenticated;
grant select, insert, update on table public.exceptions to authenticated;
grant select, insert, update on table public.actions to authenticated;
