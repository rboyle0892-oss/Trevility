import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SUPABASE_URL = 'https://ensijapqbeyhkvtountf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u-a0I1UzP4GALLfSsH3ZuQ_faUSMbs5';
const ACCESS_COOKIE = 'trevecta_access_token';

async function authedFetch(path: string, init: RequestInit = {}) {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organisationId = searchParams.get('organisationId');
  if (!organisationId) return NextResponse.json({ error: 'Organisation is required.' }, { status: 400 });

  const response = await authedFetch(`/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}&select=*&order=end_date.asc.nullslast,created_at.desc`);
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  return NextResponse.json(response.ok ? { records: data } : { error: data.message ?? 'Unable to load records.' }, { status: response.status });
}

export async function POST(request: Request) {
  const body = await request.json();
  const organisationId = body.organisationId as string | undefined;
  const records = Array.isArray(body.records) ? body.records : [];

  if (!organisationId || records.length === 0) {
    return NextResponse.json({ error: 'Organisation and at least one record are required.' }, { status: 400 });
  }
  if (records.length > 500) {
    return NextResponse.json({ error: 'This MVP import supports up to 500 rows at a time.' }, { status: 400 });
  }

  const payload = records.map((record: Record<string, unknown>, index: number) => ({
    organisation_id: organisationId,
    record_type: 'contract',
    external_id: record.external_id || null,
    supplier_name: record.supplier_name,
    product_service: record.product_service || null,
    contract_owner_name: record.contract_owner_name || null,
    contract_owner_email: record.contract_owner_email || null,
    sme_name: record.sme_name || null,
    sme_email: record.sme_email || null,
    start_date: record.start_date || null,
    end_date: record.end_date || null,
    annual_value: record.annual_value === '' || record.annual_value == null ? null : Number(record.annual_value),
    currency: record.currency || 'GBP',
    status: record.status || null,
    source_file_name: body.fileName || null,
    source_row_number: index + 2,
    raw_data: record,
  }));

  const invalid = payload.find((record) => !record.supplier_name || (record.end_date && Number.isNaN(Date.parse(String(record.end_date)))) || (record.sme_email && !String(record.sme_email).includes('@')) || (record.annual_value != null && !Number.isFinite(record.annual_value)));
  if (invalid) return NextResponse.json({ error: 'One or more rows contain an invalid supplier, date, SME email or annual value.' }, { status: 400 });

  const response = await authedFetch('/rest/v1/commercial_records', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data.message ?? 'Import failed.' }, { status: response.status });

  const readinessResponse = await authedFetch('/rest/v1/rpc/create_readiness_requests_for_due_records', {
    method: 'POST',
    body: JSON.stringify({ target_organisation_id: organisationId }),
  });
  const readinessCreated = readinessResponse?.ok ? await readinessResponse.json() : 0;

  return NextResponse.json({ imported: data.length, readinessCreated, records: data });
}
