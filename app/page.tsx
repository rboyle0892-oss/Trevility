'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Organisation = {
  organisation_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organisations: { id: string; name: string; slug: string } | null;
};

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [memberships, setMemberships] = useState<Organisation[]>([]);
  const [loadingOrganisations, setLoadingOrganisations] = useState(false);
  const [organisationName, setOrganisationName] = useState('');
  const [organisationSlug, setOrganisationSlug] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMemberships([]);
      return;
    }

    void loadOrganisations();
  }, [session]);

  const slugPreview = useMemo(() => {
    const source = organisationSlug || organisationName;
    return source
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [organisationName, organisationSlug]);

  async function loadOrganisations() {
    setLoadingOrganisations(true);
    const { data, error } = await supabase
      .from('organisation_members')
      .select('organisation_id, role, organisations(id, name, slug)')
      .order('created_at', { ascending: true });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMemberships((data ?? []) as Organisation[]);
    }
    setLoadingOrganisations(false);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const credentials = { email: email.trim(), password };
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (result.error) {
      setMessage({ type: 'error', text: result.error.message });
    } else if (mode === 'signup' && !result.data.session) {
      setMessage({
        type: 'success',
        text: 'Account created. Check your email to confirm the address, then sign in.',
      });
    } else {
      setMessage({ type: 'success', text: mode === 'login' ? 'Signed in.' : 'Account created.' });
    }

    setBusy(false);
  }

  async function createOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const cleanSlug = slugPreview;
    if (organisationName.trim().length < 2 || !cleanSlug) {
      setMessage({ type: 'error', text: 'Enter an organisation name and valid slug.' });
      setBusy(false);
      return;
    }

    const { error } = await supabase.rpc('create_organisation', {
      organisation_name: organisationName.trim(),
      organisation_slug: cleanSlug,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setOrganisationName('');
      setOrganisationSlug('');
      setMessage({ type: 'success', text: 'Organisation created successfully.' });
      await loadOrganisations();
    }

    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    setMessage(null);
  }

  if (loadingSession) {
    return (
      <main className="shell">
        <div className="card">Checking your session…</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <header className="brand">
          <span className="brand-mark">T</span>
          <span>Trevecta Control</span>
        </header>

        <section className="hero">
          <div>
            <div className="kicker">IT spend and renewal control</div>
            <h1>Turn fragmented commercial data into decisions.</h1>
            <p className="lead">
              Trevecta identifies control gaps across budgets, purchase orders and contracts,
              then gives every exception an owner, deadline and audit trail.
            </p>
          </div>

          <div className="card">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>This form is connected directly to Supabase authentication.</p>

            <div className="tabs" aria-label="Authentication mode">
              <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">
                Sign in
              </button>
              <button className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')} type="button">
                Sign up
              </button>
            </div>

            <form className="form" onSubmit={handleAuth}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                />
              </label>

              <button className="button-primary" disabled={busy} type="submit">
                {busy ? 'Working…' : mode === 'login' ? 'Sign in securely' : 'Create account'}
              </button>

              <div className={`message ${message?.type ?? ''}`} role="status">
                {message?.text ?? ''}
              </div>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <div>Trevecta Control</div>
            <div className="small">Signed in as {session.user.email}</div>
          </div>
        </div>
        <button className="button-secondary" disabled={busy} onClick={signOut} type="button">
          Sign out
        </button>
      </div>

      <section>
        <div className="kicker">Control overview</div>
        <h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>Your governance workspace.</h1>
        <p className="lead">Authentication and tenant onboarding are now connected to the live Supabase foundation.</p>
      </section>

      <section className="grid">
        <div className="card metric"><span className="small">Organisations</span><strong>{memberships.length}</strong></div>
        <div className="card metric"><span className="small">Open exceptions</span><strong>0</strong></div>
        <div className="card metric"><span className="small">Overdue actions</span><strong>0</strong></div>
      </section>

      <section className="empty">
        <div className="card">
          <h2>Your organisations</h2>
          <p>Only organisations permitted by Supabase row-level security are returned.</p>
          {loadingOrganisations ? (
            <p>Loading…</p>
          ) : memberships.length === 0 ? (
            <p>No organisation exists yet. Create the first one to become its owner.</p>
          ) : (
            <div className="organisation-list">
              {memberships.map((membership) => (
                <div className="organisation-row" key={membership.organisation_id}>
                  <strong>{membership.organisations?.name ?? 'Organisation'}</strong>
                  <div className="small">/{membership.organisations?.slug} · {membership.role}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Create an organisation</h2>
          <p>This calls the secured database function and automatically assigns you as owner.</p>
          <form className="form" onSubmit={createOrganisation}>
            <label>
              Organisation name
              <input required minLength={2} value={organisationName} onChange={(event) => setOrganisationName(event.target.value)} placeholder="Example Legal Group" />
            </label>
            <label>
              URL slug
              <input value={organisationSlug} onChange={(event) => setOrganisationSlug(event.target.value)} placeholder="example-legal-group" />
            </label>
            <div className="small">Slug preview: {slugPreview || '—'}</div>
            <button className="button-primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create organisation'}</button>
            <div className={`message ${message?.type ?? ''}`} role="status">{message?.text ?? ''}</div>
          </form>
        </div>
      </section>
    </main>
  );
}
