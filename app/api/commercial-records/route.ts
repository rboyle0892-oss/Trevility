import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SUPABASE_URL = 'https://ensijapqbeyhkvtountf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u-a0I1UzP4GALLfSsH3ZuQ_faUSMbs5';
const ACCESS_COOKIE = 'trevecta_access_token';

const editableFields = ['external_id','supplier_name','product_service','contract_owner_name','contract_owner_email','sme_name','sme_email','start_date','end_date','annual_value','currency','status'] as const;
type EditableField = typeof editableFields[number];

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

function cleanOptionalText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function validateRecord(record: Record<string, unknown>) {
  if (!record.supplier_name || !String(record.supplier_name).trim()) return 'Supplier is required.';
  if (!isValidIsoDate(record.start_date) || !isValidIsoDate(record.end_date)) return 'Dates must be real YYYY-MM-DD dates.';
  if (hasInvalidDateRange(record.start_date, record.end_date)) return 'Start date cannot be later than end date.';
  if (!isValidEmail(record.sme_email) || !isValidEmail(record.contract_owner_email)) return 'Owner and SME emails must be valid.';
  if (record.annual_value != null && record.annual_value !== '' && (!Number.isFinite(Number(record.annual_value)) || Number(record.annual_value) < 0)) return 'Annual value cannot be negative.';
  return null;
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
  const recordId = searchParams.get('recordId');
  const includeArchived = searchParams.get('includeArchived') === 'true';
  if (!organisationId) return NextResponse.json({ error: 'Organisation is required.' }, { status: 400 });

  const archiveFilter = includeArchived ? '' : '&archived_at=is.null';
  const recordFilter = recordId ? `&id=eq.${encodeURIComponent(recordId)}` : '';
  const response = await authedFetch(`/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}${recordFilter}${archiveFilter}&select=*&order=end_date.asc.nullslast,created_at.desc`);
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data.message ?? 'Unable to load records.' }, { status: response.status });
  if (recordId) {
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'Commercial record not found or access is not permitted.' }, { status: 404 });
    const readinessResponse = await authedFetch(`/rest/v1/readiness_requests?organisation_id=eq.${encodeURIComponent(organisationId)}&commercial_record_id=eq.${encodeURIComponent(recordId)}&select=*&order=created_at.desc`);
    const readinessData = readinessResponse?.ok ? await readinessResponse.json() : [];
    return NextResponse.json({ record: data[0], readinessRequests: Array.isArray(readinessData) ? readinessData : [] });
  }
  return NextResponse.json({ records: data });
}

export async function PATCH(request: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const body = await request.json();
  const id = body.id as string | undefined;
  const organisationId = body.organisationId as string | undefined;
  const action = body.action as 'archive' | 'restore' | 'update' | 'retry_readiness' | undefined;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!organisationId || !action) return NextResponse.json({ error: 'Organisation and action are required.' }, { status: 400 });

  if (action === 'retry_readiness') {
    const retryResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_readiness_requests_for_due_records`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_organisation_id: organisationId }),
      cache: 'no-store',
    });
    const retryData = await retryResponse.json();
    if (!retryResponse.ok) return NextResponse.json({ error: retryData.message ?? 'Unable to retry readiness generation.' }, { status: retryResponse.status });
    return NextResponse.json({ readinessCreated: retryData });
  }

  if (!id) return NextResponse.json({ error: 'Record is required.' }, { status: 400 });
  let payload: Record<string, unknown>;

  if (action === 'archive') {
    if (!reason) return NextResponse.json({ error: 'An archive reason is required.' }, { status: 400 });
    payload = { archived_at: new Date().toISOString(), archived_by: auth.userId, archive_reason: reason };
  } else if (action === 'restore') {
    payload = { archived_at: null, archived_by: null, archive_reason: null };
  } else {
    const fields = (body.fields ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const field of editableFields) {
      if (!(field in fields)) continue;
      update[field] = field === 'annual_value'
        ? (fields[field] === '' || fields[field] == null ? null : Number(fields[field]))
        : cleanOptionalText(fields[field]);
    }
    const validationError = validateRecord(update);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const externalId = normaliseExternalId(update.external_id);
    if (externalId) {
      const duplicateResponse = await fetch(`${SUPABASE_URL}/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}&archived_at=is.null&id=neq.${encodeURIComponent(id)}&external_id=ilike.${encodeURIComponent(String(update.external_id))}&select=id`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const duplicateData = await duplicateResponse.json();
      if (!duplicateResponse.ok) return NextResponse.json({ error: duplicateData.message ?? 'Unable to check the record reference.' }, { status: duplicateResponse.status });
      if (Array.isArray(duplicateData) && duplicateData.length) return NextResponse.json({ error: 'Another active record already uses this reference.' }, { status: 409 });
    }
    payload = update;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/commercial_records?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${encodeURIComponent(organisationId)}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
    external_id: cleanOptionalText(record.external_id),
    supplier_name: cleanOptionalText(record.supplier_name),
    product_service: cleanOptionalText(record.product_service),
    contract_owner_name: cleanOptionalText(record.contract_owner_name),
    contract_owner_email: cleanOptionalText(record.contract_owner_email),
    sme_name: cleanOptionalText(record.sme_name),
    sme_email: cleanOptionalText(record.sme_email),
    start_date: cleanOptionalText(record.start_date),
    end_date: cleanOptionalText(record.end_date),
    annual_value: record.annual_value === '' || record.annual_value == null ? null : Number(record.annual_value),
    currency: cleanOptionalText(record.currency) || 'GBP',
    status: cleanOptionalText(record.status),
    source_file_name: body.fileName || null,
    source_row_number: index + 2,
    raw_data: record,
  }));

  const invalidIndex = payload.findIndex((record) => validateRecord(record as unknown as Record<string, unknown>) != null);
  if (invalidIndex !== -1) return NextResponse.json({ error: `Row ${payload[invalidIndex].source_row_number} is invalid. ${validateRecord(payload[invalidIndex] as unknown as Record<string, unknown>)}` }, { status: 400 });

  const incomingExternalIds = new Map<string, number>();
  for (const record of payload) {
    const externalId = normaliseExternalId(record.external_id);
    if (!externalId) continue;
    const previousRow = incomingExternalIds.get(externalId);
    if (previousRow) return NextResponse.json({ error: `Rows ${previousRow} and ${record.source_row_number} use the same external_id. Remove or correct the duplicate before importing.` }, { status: 409 });
    incomingExternalIds.set(externalId, record.source_row_number);
  }

  if (incomingExternalIds.size > 0) {
    const existingResponse = await authedFetch(`/rest/v1/commercial_records?organisation_id=eq.${encodeURIComponent(organisationId)}&archived_at=is.null&external_id=not.is.null&select=external_id`);
    if (!existingResponse) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    const existingData = await existingResponse.json();
    if (!existingResponse.ok) return NextResponse.json({ error: existingData.message ?? 'Unable to check for duplicate records.' }, { status: existingResponse.status });
    const existingExternalIds = new Set((Array.isArray(existingData) ? existingData : []).map((record: { external_id?: unknown }) => normaliseExternalId(record.external_id)).filter(Boolean));
    const duplicate = [...incomingExternalIds.entries()].find(([externalId]) => existingExternalIds.has(externalId));
    if (duplicate) return NextResponse.json({ error: `Row ${duplicate[1]} matches an active record with external_id "${String(payload[duplicate[1] - 2].external_id)}". Open the existing record to edit or archive it before importing a replacement.` }, { status: 409 });
  }

  const response = await authedFetch('/rest/v1/commercial_records', { method: 'POST', body: JSON.stringify(payload) });
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data.message ?? 'Import failed.' }, { status: response.status });

  const readinessResponse = await authedFetch('/rest/v1/rpc/create_readiness_requests_for_due_records', { method: 'POST', body: JSON.stringify({ target_organisation_id: organisationId }) });
  if (!readinessResponse?.ok) {
    let detail = 'Readiness generation did not complete. The commercial records were saved successfully.';
    try {
      const readinessError = await readinessResponse?.json();
      if (readinessError?.message) detail = `Readiness generation did not complete: ${readinessError.message}`;
    } catch { /* preserve safe generic detail */ }
    return NextResponse.json({ imported: data.length, records: data, readinessCreated: null, readinessStatus: 'failed', readinessWarning: detail });
  }

  const readinessCreated = await readinessResponse.json();
  return NextResponse.json({ imported: data.length, readinessCreated, readinessStatus: 'succeeded', records: data });
}
