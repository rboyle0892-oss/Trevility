'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Organisation = {
  organisation_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organisations: { id: string; name: string; slug: string } | null;
};

type CommercialRecord = {
  id: string;
  supplier_name: string;
  product_service: string | null;
  sme_name: string | null;
  sme_email: string | null;
  end_date: string | null;
  annual_value: number | null;
  currency: string;
};

const requiredHeaders = ['supplier_name'];
const supportedHeaders = ['external_id','supplier_name','product_service','contract_owner_name','contract_owner_email','sme_name','sme_email','start_date','end_date','annual_value','currency','status'];

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.');

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required column: ${missing.join(', ')}`);
  const unsupported = headers.filter((header) => header && !supportedHeaders.includes(header));
  if (unsupported.length) throw new Error(`Unsupported columns: ${unsupported.join(', ')}`);

  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export default function OrganisationWorkspacePage() {
  const params = useParams<{ slug: string }>();
  const [membership, setMembership] = useState<Organisation | null>(null);
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRecords(organisationId: string) {
    const response = await fetch(`/api/commercial-records?organisationId=${encodeURIComponent(organisationId)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to load commercial records.');
    setRecords(data.records ?? []);
  }

  useEffect(() => {
    async function load() {
      try {
        const authResponse = await fetch('/api/auth', { cache: 'no-store' });
        const auth = await authResponse.json();
        if (!auth.user) { window.location.href = '/'; return; }
        const response = await fetch('/api/organisations', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Unable to load organisation.');
        const selected = (data.organisations as Organisation[]).find((item) => item.organisations?.slug === params.slug);
        if (!selected) throw new Error('Organisation not found or access is not permitted.');
        setMembership(selected);
        await loadRecords(selected.organisation_id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load organisation.');
      } finally { setLoading(false); }
    }
    void load();
  }, [params.slug]);

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !membership) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const parsed = parseCsv(await file.text());
      const response = await fetch('/api/commercial-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organisationId: membership.organisation_id, fileName: file.name, records: parsed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Import failed.');
      setMessage(`${data.imported} commercial records imported. ${data.readinessCreated || 0} readiness request(s) created for contracts already within 100 days of end date.`);
      await loadRecords(membership.organisation_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.');
    } finally { setBusy(false); event.target.value = ''; }
  }

  if (loading) return <main className="shell"><div className="card">Opening secure workspace…</div></main>;
  if (error && !membership?.organisations) return <main className="shell"><div className="card"><h2>Workspace unavailable</h2><p>{error}</p><a className="button-secondary" href="/">Back to organisations</a></div></main>;
  if (!membership?.organisations) return null;
  const organisation = membership.organisations;

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>{organisation.name}</div><div className="small">Trevecta Control · {membership.role}</div></div></div>
        <a className="button-secondary" href="/">Switch organisation</a>
      </div>

      <section><div className="kicker">Organisation workspace</div><h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{organisation.name}</h1><p className="lead">Import commercial records now; readiness requests are created when a contract reaches 100 days before its end date.</p></section>

      <section className="grid">
        <div className="card metric"><span className="small">Imported records</span><strong>{records.length}</strong></div>
        <div className="card metric"><span className="small">Ending within 100 days</span><strong>{records.filter((record) => record.end_date && new Date(record.end_date).getTime() - Date.now() <= 100 * 86400000 && new Date(record.end_date).getTime() >= Date.now()).length}</strong></div>
        <div className="card metric"><span className="small">Missing SME email</span><strong>{records.filter((record) => !record.sme_email).length}</strong></div>
      </section>

      <section className="empty">
        <div className="card">
          <div className="kicker">1 · Prepare</div>
          <h2>Download the CSV template</h2>
          <p>Use the template to keep column names and date formats consistent. It contains one example row that can be replaced or deleted.</p>
          <a className="button-secondary" download="trevecta-commercial-import-template.csv" href="/commercial-import-template.csv">Download CSV template</a>
          <p className="small" style={{ marginTop: 16 }}>Required: <code>supplier_name</code>. For readiness requests also include <code>end_date</code>, <code>sme_name</code> and <code>sme_email</code>. Dates must use YYYY-MM-DD.</p>
        </div>

        <div className="card">
          <div className="kicker">2 · Upload</div>
          <h2>Upload completed CSV</h2>
          <p>Select the completed template. Trevecta validates the file before saving any commercial records.</p>
          <label className="button-primary" style={{ display: 'inline-block', textAlign: 'center', cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Importing…' : 'Choose CSV file'}
            <input accept=".csv,text/csv" disabled={busy} onChange={importCsv} style={{ display: 'none' }} type="file" />
          </label>
          {message && <div className="message success" role="status">{message}</div>}
          {error && <div className="message error" role="alert">{error}</div>}
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Imported contracts</div>
        <h2>Commercial register</h2>
        {records.length === 0 ? <p>No commercial records imported yet.</p> : (
          <div className="organisation-list">
            {records.slice(0, 20).map((record) => (
              <div className="organisation-row" key={record.id}>
                <div><strong>{record.supplier_name}</strong><div className="small">{record.product_service || 'No product/service'} · SME: {record.sme_email || 'missing'}</div></div>
                <div className="small" style={{ textAlign: 'right' }}>{record.end_date || 'No end date'}<br />{record.annual_value == null ? '' : `${record.currency} ${Number(record.annual_value).toLocaleString()}`}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
