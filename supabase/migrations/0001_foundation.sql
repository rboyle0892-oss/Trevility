-- Trevecta MVP foundation
-- Secure multi-tenant organisation boundary, profiles, imports, exceptions and actions.

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.organisation_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.import_status as enum ('uploaded', 'validating', 'ready', 'failed', 'completed');
create type public.exception_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.exception_severity as enum ('low', 'medium', 'high', 'critical');
create type public.action_status as enum ('open', 'in_progress', 'blocked', 'completed', 'cancelled');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organisation_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index organisation_members_user_idx on public.organisation_members(user_id, organisation_id);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  dataset_type text not null check (dataset_type in ('budget_lines','purchase_orders','contracts','owners')),
  file_name text not null,
  storage_path text,
  status public.import_status not null default 'uploaded',
  row_count integer not null default 0 check (row_count >= 0),
  valid_row_count integer not null default 0 check (valid_row_count >= 0),
  invalid_row_count integer not null default 0 check (invalid_row_count >= 0),
  error_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index imports_org_created_idx on public.imports(organisation_id, created_at desc);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  import_id uuid references public.imports(id) on delete set null,
  exception_type text not null,
  title text not null,
  description text,
  severity public.exception_severity not null default 'medium',
  status public.exception_status not null default 'open',
  financial_amount numeric(18,2),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text,
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index exceptions_org_status_idx on public.exceptions(organisation_id, status, severity);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  exception_id uuid references public.exceptions(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  status public.action_status not null default 'open',
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index actions_org_status_idx on public.actions(organisation_id, status, due_date);

-- These helpers live outside the exposed schema. They are narrowly scoped,
-- verify the current authenticated user, and avoid recursive RLS evaluation.
create or replace function private.is_organisation_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_organisation_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_organisation_role(target_organisation_id uuid, allowed_roles public.organisation_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_organisation_id
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.create_organisation(organisation_name text, organisation_slug text)
returns public.organisations
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org public.organisations;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organisations(name, slug, created_by)
  values (trim(organisation_name), lower(trim(organisation_slug)), (select auth.uid()))
  returning * into new_org;

  insert into public.organisation_members(organisation_id, user_id, role)
  values (new_org.id, (select auth.uid()), 'owner');

  return new_org;
end;
$$;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.imports enable row level security;
alter table public.exceptions enable row level security;
alter table public.actions enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy organisations_select_member on public.organisations for select to authenticated using ((select private.is_organisation_member(id)));
create policy organisations_update_admin on public.organisations for update to authenticated
using ((select private.has_organisation_role(id, array['owner','admin']::public.organisation_role[])))
with check ((select private.has_organisation_role(id, array['owner','admin']::public.organisation_role[])));

create policy members_select_member on public.organisation_members for select to authenticated using ((select private.is_organisation_member(organisation_id)));
create policy members_insert_owner on public.organisation_members for insert to authenticated with check ((select private.has_organisation_role(organisation_id, array['owner']::public.organisation_role[])));
create policy members_update_owner on public.organisation_members for update to authenticated
using ((select private.has_organisation_role(organisation_id, array['owner']::public.organisation_role[])))
with check ((select private.has_organisation_role(organisation_id, array['owner']::public.organisation_role[])));
create policy members_delete_owner on public.organisation_members for delete to authenticated using ((select private.has_organisation_role(organisation_id, array['owner']::public.organisation_role[])));

create policy imports_select_member on public.imports for select to authenticated using ((select private.is_organisation_member(organisation_id)));
create policy imports_insert_member on public.imports for insert to authenticated
with check ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])) and created_by = (select auth.uid()));
create policy imports_update_admin on public.imports for update to authenticated
using ((select private.has_organisation_role(organisation_id, array['owner','admin']::public.organisation_role[])))
with check ((select private.has_organisation_role(organisation_id, array['owner','admin']::public.organisation_role[])));

create policy exceptions_select_member on public.exceptions for select to authenticated using ((select private.is_organisation_member(organisation_id)));
create policy exceptions_insert_admin on public.exceptions for insert to authenticated with check ((select private.has_organisation_role(organisation_id, array['owner','admin']::public.organisation_role[])));
create policy exceptions_update_member on public.exceptions for update to authenticated
using ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])))
with check ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])));

create policy actions_select_member on public.actions for select to authenticated using ((select private.is_organisation_member(organisation_id)));
create policy actions_insert_member on public.actions for insert to authenticated
with check ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])) and created_by = (select auth.uid()));
create policy actions_update_member on public.actions for update to authenticated
using ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])))
with check ((select private.has_organisation_role(organisation_id, array['owner','admin','member']::public.organisation_role[])));

revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_organisation(text, text) from public, anon;
grant execute on function public.create_organisation(text, text) to authenticated;
