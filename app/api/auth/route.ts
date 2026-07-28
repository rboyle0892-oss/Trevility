import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SUPABASE_URL = 'https://ensijapqbeyhkvtountf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u-a0I1UzP4GALLfSsH3ZuQ_faUSMbs5';
const ACCESS_COOKIE = 'trevecta_access_token';
const REFRESH_COOKIE = 'trevecta_refresh_token';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function GET() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const response = await supabaseFetch('/auth/v1/user', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const output = NextResponse.json({ user: null });
    output.cookies.delete(ACCESS_COOKIE);
    output.cookies.delete(REFRESH_COOKIE);
    return output;
  }

  return NextResponse.json({ user: await response.json() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action as 'login' | 'signup' | 'logout';

  if (action === 'logout') {
    const output = NextResponse.json({ ok: true });
    output.cookies.delete(ACCESS_COOKIE);
    output.cookies.delete(REFRESH_COOKIE);
    return output;
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const path = action === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
  const response = await supabaseFetch(path, {
    method: 'POST',
    body: JSON.stringify({ email: body.email, password: body.password }),
  });
  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.msg ?? data.error_description ?? data.message ?? 'Authentication failed.' },
      { status: response.status },
    );
  }

  const output = NextResponse.json({
    user: data.user ?? null,
    requiresConfirmation: action === 'signup' && !data.access_token,
  });

  if (data.access_token) output.cookies.set(ACCESS_COOKIE, data.access_token, cookieOptions(data.expires_in ?? 3600));
  if (data.refresh_token) output.cookies.set(REFRESH_COOKIE, data.refresh_token, cookieOptions(60 * 60 * 24 * 30));

  return output;
}
