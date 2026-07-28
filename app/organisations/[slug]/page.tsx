'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Organisation = {
  organisation_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organisations: { id: string; name: string; slug: string } | null;
};

export default function OrganisationWorkspacePage() {
  const params = useParams<{ slug: string }>();
  const [membership, setMembership] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const authResponse = await fetch('/api/auth', { cache: 'no-store' });
        const auth = await authResponse.json();
        if (!auth.user) {
          window.location.href = '/';
          return;
        }

        const response = await fetch('/api/organisations', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Unable to load organisation.');

        const selected = (data.organisations as Organisation[]).find(
          (item) => item.organisations?.slug === params.slug,
        );
        if (!selected) throw new Error('Organisation not found or access is not permitted.');
        setMembership(selected);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load organisation.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.slug]);

  if (loading) return <main className="shell"><div className="card">Opening secure workspace…</div></main>;
  if (error || !membership?.organisations) return <main className="shell"><div className="card"><h2>Workspace unavailable</h2><p>{error}</p><a className="button-secondary" href="/">Back to organisations</a></div></main>;

  const organisation = membership.organisations;

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>{organisation.name}</div><div className="small">Trevecta Control · {membership.role}</div></div></div>
        <a className="button-secondary" href="/">Switch organisation</a>
      </div>

      <section>
        <div className="kicker">Organisation workspace</div>
        <h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{organisation.name}</h1>
        <p className="lead">This is the secure control workspace for budgets, purchase orders, contracts and exceptions.</p>
      </section>

      <section className="grid">
        <div className="card metric"><span className="small">Imported records</span><strong>0</strong></div>
        <div className="card metric"><span className="small">Open exceptions</span><strong>0</strong></div>
        <div className="card metric"><span className="small">Overdue actions</span><strong>0</strong></div>
      </section>

      <section className="empty">
        <div className="card">
          <div className="kicker">1 · Start here</div>
          <h2>Import commercial data</h2>
          <p>Upload budget, purchase-order and contract CSV files. Column mapping and validation are the next functional build slice.</p>
          <button className="button-primary" disabled type="button">Import data — coming next</button>
        </div>
        <div className="card">
          <div className="kicker">Control modules</div>
          <h2>Workspace structure</h2>
          <div className="organisation-list">
            <div className="organisation-row"><div><strong>Imports</strong><div className="small">Source files, validation and mapping</div></div><span>0</span></div>
            <div className="organisation-row"><div><strong>Exceptions</strong><div className="small">Control gaps requiring review</div></div><span>0</span></div>
            <div className="organisation-row"><div><strong>Actions</strong><div className="small">Owners, deadlines and resolution</div></div><span>0</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
