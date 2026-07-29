import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SUPABASE_URL = 'https://ensijapqbeyhkvtountf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u-a0I1UzP4GALLfSsH3ZuQ_faUSMbs5';
const ACCESS_COOKIE = 'trevecta_access_token';

type ImportPayload = {
  organisation_id: string;
  record_type: 'contract';
  external_id: unknown;
  supplier_name: unknown;
  product_service: unknown;
  contract_owner_name: unknown;
  contract_owner_email: unknown;
  sme_name: unknown;
  sme_email: unknown;
  start_date: unknown;
  end_date: unknown;
  annual_value: number | null;
  currency: unknown;
  status: unknown;
  source_file_name: unknown;
  source_row_number: number;
  raw_data: Record<string, unknown>;
};

function isValidIsoDate(value: unknown) {
  if (value == null || value === '') return true;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidEmail(value: unknown) {
  if (value == null || value === '') return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function normaliseExternalId(value: unknown) {
  return value == null ? '' : String(value).trim().toLowerCase();
}

function hasInvalidDateRange(startDate: unknown, endDate: unknown) {
  if (!startDate || !endDate) return false;
  return String(startDate).trim() > String(endDate).trim();
}

async function getAuth() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  return { token, userId: user.id as string };
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const auth = await getAuth();
  if (!auth) return null;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${auth.token}`,
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
  const includeArchived = searchParams.get('includeArchived') === 'true';
  if (!organisationId) return NextResponse.json({ error: 'Organisation is required.' }, { status: 400 });

  const archiveFilter = includeArchived ? '' : '&archived_at=is.null';
  const response = await authedFetch(`/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}${archiveFilter}&select=*&order=end_date.asc.nullslast,created_at.desc`);
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  return NextResponse.json(response.ok ? { records: data } : { error: data.message ?? 'Unable to load records.' }, { status: response.status });
}

export async function PATCH(request: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const body = await request.json();
  const id = body.id as string | undefined;
  const organisationId = body.organisationId as string | undefined;
  const action = body.action as 'archive' | 'restore' | undefined;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!id || !organisationId || !action) return NextResponse.json({ error: 'Record, organisation and action are required.' }, { status: 400 });
  if (action === 'archive' && !reason) return NextResponse.json({ error: 'An archive reason is required.' }, { status: 400 });

  const payload = action === 'archive'
    ? { archived_at: new Date().toISOString(), archived_by: auth.userId, archive_reason: reason }
    : { archived_at: null, archived_by: null, archive_reason: null };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/commercial_records?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${encodeURIComponent(organisationId)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data.message ?? `Unable to ${action} record.` }, { status: response.status });
  if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'Record not found or access is not permitted.' }, { status: 404 });
  return NextResponse.json({ record: data[0] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const organisationId = body.organisationId as string | undefined;
  const records = Array.isArray(body.records) ? body.records : [];

  if (!organisationId || records.length === 0) return NextResponse.json({ error: 'Organisation and at least one record are required.' }, { status: 400 });
  if (records.length > 500) return NextResponse.json({ error: 'This MVP import supports up to 500 rows at a time.' }, { status: 400 });

  const payload: ImportPayload[] = records.map((record: Record<string, unknown>, index: number) => ({
    organisation_id: organisationId,
    record_type: 'contract',
    external_id: typeof record.external_id === 'string' ? record.external_id.trim() || null : record.external_id || null,
    supplier_name: typeof record.supplier_name === 'string' ? record.supplier_name.trim() : record.supplier_name,
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

  const invalid = payload.find((record: ImportPayload) =>
    !record.supplier_name ||
    !String(record.supplier_name).trim() ||
    !isValidIsoDate(record.start_date) ||
    !isValidIsoDate(record.end_date) ||
    hasInvalidDateRange(record.start_date, record.end_date) ||
    !isValidEmail(record.sme_email) ||
    !isValidEmail(record.contract_owner_email) ||
    (record.annual_value != null && (!Number.isFinite(record.annual_value) || record.annual_value < 0))
  );
  if (invalid) {
    return NextResponse.json({
      error: `Row ${invalid.source_row_number} is invalid. Supplier is required; dates must be real YYYY-MM-DD dates with the start date not later than the end date; emails must be valid; annual value cannot be negative.`,
    }, { status: 400 });
  }

  const incomingExternalIds = new Map<string, number>();
  for (const record of payload) {
    const externalId = normaliseExternalId(record.external_id);
    if (!externalId) continue;
    const previousRow = incomingExternalIds.get(externalId);
    if (previousRow) {
      return NextResponse.json({
        error: `Rows ${previousRow} and ${record.source_row_number} use the same external_id. Remove or correct the duplicate before importing.`,
      }, { status: 409 });
    }
    incomingExternalIds.set(externalId, record.source_row_number);
  }

  if (incomingExternalIds.size > 0) {
    const existingResponse = await authedFetch(`/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}&archived_at=is.null&external_id=not.is.null&select=external_id`);
    if (!existingResponse) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    const existingData = await existingResponse.json();
    if (!existingResponse.ok) return NextResponse.json({ error: existingData.message ?? 'Unable to check for duplicate records.' }, { status: existingResponse.status });

    const existingExternalIds = new Set(
      (Array.isArray(existingData) ? existingData : [])
        .map((record: { external_id?: unknown }) => normaliseExternalId(record.external_id))
        .filter(Boolean)
    );
    const duplicate = [...incomingExternalIds.entries()].find(([externalId]) => existingExternalIds.has(externalId));
    if (duplicate) {
      return NextResponse.json({
        error: `Row ${duplicate[1]} matches an active record with external_id "${String(payload[duplicate[1] - 2].external_id)}". Archive, update or remove the existing record before importing a replacement.`,
      }, { status: 409 });
    }
  }

  const response = await authedFetch('/rest/v1/commercial_records', { method: 'POST', body: JSON.stringify(payload) });
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data.message ?? 'Import failed.' }, { status: response.status });

  const readinessResponse = await authedFetch('/rest/v1/rpc/create_readiness_requests_for_due_records', { method: 'POST', body: JSON.stringify({ target_organisation_id: organisationId }) });
  const readinessCreated = readinessResponse?.ok ? await readinessResponse.json() : 0;
  return NextResponse.json({ imported: data.length, readinessCreated, records: data });
}
