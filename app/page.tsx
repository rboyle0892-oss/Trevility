'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = { id: string; email?: string };
type Organisation = {
  organisation_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organisations: { id: string; name: string; slug: string } | null;
};

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
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
    void loadSession();
  }, []);

  useEffect(() => {
    if (user) void loadOrganisations();
    else setMemberships([]);
  }, [user]);

  const slugPreview = useMemo(() => {
    const source = organisationSlug || organisationName;
    return source.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }, [organisationName, organisationSlug]);

  async function loadSession() {
    try {
      const response = await fetch('/api/auth', { cache: 'no-store' });
      const data = await response.json();
      setUser(data.user ?? null);
    } catch {
      setMessage({ type: 'error', text: 'Unable to check your session. Please refresh.' });
    } finally {
      setLoadingSession(false);
    }
  }

  async function loadOrganisations() {
    setLoadingOrganisations(true);
    try {
      const response = await fetch('/api/organisations', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to load organisations.');
      setMemberships(data.organisations ?? []);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load organisations.' });
    } finally {
      setLoadingOrganisations(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Authentication failed.');

      if (data.requiresConfirmation) {
        setMessage({ type: 'success', text: 'Account created. Check your email to confirm the address, then sign in.' });
      } else {
        setUser(data.user ?? null);
        setMessage({ type: 'success', text: mode === 'login' ? 'Signed in.' : 'Account created.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Authentication failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Enter your email address first.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to resend confirmation email.');
      setMessage({ type: 'success', text: 'A new confirmation email has been sent. Use the newest email.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to resend confirmation email.' });
    } finally {
      setBusy(false);
    }
  }

  async function createOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    if (organisationName.trim().length < 2 || !slugPreview) {
      setMessage({ type: 'error', text: 'Enter an organisation name and valid slug.' });
      setBusy(false);
      return;
    }

    try {
      const response = await fetch('/api/organisations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: organisationName.trim(), slug: slugPreview }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to create organisation.');
      setOrganisationName('');
      setOrganisationSlug('');
      setMessage({ type: 'success', text: 'Organisation created successfully.' });
      await loadOrganisations();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to create organisation.' });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setUser(null);
    setBusy(false);
    setMessage(null);
  }

  if (loadingSession) {
    return <main className="shell"><div className="card">Checking your session…</div></main>;
  }

  if (!user) {
    return (
      <main className="shell">
        <header className="brand"><span className="brand-mark">T</span><span>Trevecta Control</span></header>
        <section className="hero">
          <div>
            <div className="kicker">IT spend and renewal control</div>
            <h1>Turn fragmented commercial data into decisions.</h1>
            <p className="lead">Trevecta identifies control gaps across budgets, purchase orders and contracts, then gives every exception an owner, deadline and audit trail.</p>
          </div>
          <div className="card">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>Authentication is securely relayed through the Trevecta application.</p>
            <div className="tabs" aria-label="Authentication mode">
              <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">Sign in</button>
              <button className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')} type="button">Sign up</button>
            </div>
            <form className="form" onSubmit={handleAuth}>
              <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
              <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
              <button className="button-primary" disabled={busy} type="submit">{busy ? 'Working…' : mode === 'login' ? 'Sign in securely' : 'Create account'}</button>
              <button className="button-secondary" disabled={busy} onClick={resendConfirmation} type="button">Resend confirmation email</button>
              <div className={`message ${message?.type ?? ''}`} role="status">{message?.text ?? ''}</div>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>Trevecta Control</div><div className="small">Signed in as {user.email}</div></div></div>
        <button className="button-secondary" disabled={busy} onClick={signOut} type="button">Sign out</button>
      </div>
      <section><div className="kicker">Control overview</div><h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>Your governance workspace.</h1><p className="lead">Authentication and tenant onboarding are connected to the live Supabase foundation through Vercel.</p></section>
      <section className="grid">
        <div className="card metric"><span className="small">Organisations</span><strong>{memberships.length}</strong></div>
        <div className="card metric"><span className="small">Open exceptions</span><strong>0</strong></div>
        <div className="card metric"><span className="small">Overdue actions</span><strong>0</strong></div>
      </section>
      <section className="empty">
        <div className="card">
          <h2>Your organisations</h2><p>Only organisations permitted by row-level security are returned.</p>
          {loadingOrganisations ? <p>Loading…</p> : memberships.length === 0 ? <p>No organisation exists yet. Create the first one to become its owner.</p> : (
            <div className="organisation-list">{memberships.map((membership) => <div className="organisation-row" key={membership.organisation_id}><strong>{membership.organisations?.name ?? 'Organisation'}</strong><div className="small">/{membership.organisations?.slug} · {membership.role}</div></div>)}</div>
          )}
        </div>
        <div className="card">
          <h2>Create an organisation</h2><p>This calls the secured database function and automatically assigns you as owner.</p>
          <form className="form" onSubmit={createOrganisation}>
            <label>Organisation name<input required minLength={2} value={organisationName} onChange={(event) => setOrganisationName(event.target.value)} placeholder="Example Legal Group" /></label>
            <label>URL slug<input value={organisationSlug} onChange={(event) => setOrganisationSlug(event.target.value)} placeholder="example-legal-group" /></label>
            <div className="small">Slug preview: {slugPreview || '—'}</div>
            <button className="button-primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create organisation'}</button>
            <div className={`message ${message?.type ?? ''}`} role="status">{message?.text ?? ''}</div>
          </form>
        </div>
      </section>
    </main>
  );
}
