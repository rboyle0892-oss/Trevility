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
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function GET() {
  const response = await authedFetch('/rest/v1/organisation_members?select=organisation_id,role,organisations(id,name,slug)&order=created_at.asc');
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  return NextResponse.json(response.ok ? { organisations: data } : { error: data.message ?? 'Unable to load organisations.' }, { status: response.status });
}

export async function POST(request: Request) {
  const body = await request.json();
  const response = await authedFetch('/rest/v1/rpc/create_organisation', {
    method: 'POST',
    body: JSON.stringify({ organisation_name: body.name, organisation_slug: body.slug }),
  });
  if (!response) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const data = await response.json();
  return NextResponse.json(response.ok ? { organisation: data } : { error: data.message ?? 'Unable to create organisation.' }, { status: response.status });
}
