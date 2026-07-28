grant usage on schema private to authenticated, service_role;
grant execute on function private.is_organisation_member(uuid) to authenticated, service_role;
grant execute on function private.has_organisation_role(uuid, public.organisation_role[]) to authenticated, service_role;
