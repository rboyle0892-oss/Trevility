-- Applied to Supabase project ensijapqbeyhkvtountf.
-- Creates commercial_records and readiness_requests with organisation RLS.
-- Readiness requests are generated when a contract is within 100 days of end_date.

create type public.commercial_record_type as enum ('contract','purchase_order','budget_line');
create type public.readiness_status as enum ('pending','sent','opened','submitted','overdue','cancelled');

create table public.commercial_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  record_type public.commercial_record_type not null default 'contract',
  external_id text,
  supplier_name text not null,
  product_service text,
  contract_owner_name text,
  contract_owner_email text,
  sme_name text,
  sme_email text,
  start_date date,
  end_date date,
  annual_value numeric(18,2),
  currency text not null default 'GBP',
  status text,
  source_file_name text,
  source_row_number integer,
  raw_data jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.readiness_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  commercial_record_id uuid not null references public.commercial_records(id) on delete cascade,
  recipient_name text,
  recipient_email text not null,
  due_date date,
  trigger_date date not null,
  status public.readiness_status not null default 'pending',
  access_token_hash text,
  access_token_expires_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (commercial_record_id, recipient_email)
);

-- Full indexes, grants, RLS policies and create_readiness_requests_for_due_records
-- are applied in the live migration history.
