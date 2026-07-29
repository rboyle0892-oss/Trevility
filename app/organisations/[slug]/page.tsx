'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Organisation = {
  organisation_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organisations: { id: string; name: string; slug: string } | null;
};

type CommercialRecord = {
  id: string;
  external_id: string | null;
  supplier_name: string;
  product_service: string | null;
  contract_owner_name: string | null;
  contract_owner_email: string | null;
  sme_name: string | null;
  sme_email: string | null;
  start_date: string | null;
  end_date: string | null;
  annual_value: number | null;
  currency: string;
  status: string | null;
  created_at: string;
};

type RegisterFilter = 'all' | 'ending_100' | 'expired' | 'missing_owner' | 'missing_sme' | 'missing_end_date';

type ActionItem = {
  record: CommercialRecord;
  priority: 'High' | 'Medium';
  reason: string;
  nextAction: string;
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
  if (quoted) throw new Error('The CSV contains an unclosed quoted value. Correct the affected row and try again.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.');

  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase());
  const blankHeaderIndex = headers.findIndex((header) => !header);
  if (blankHeaderIndex !== -1) throw new Error(`Column ${blankHeaderIndex + 1} has no header. Add a supported column name or remove the empty column.`);
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`Duplicate columns are not allowed: ${[...new Set(duplicateHeaders)].join(', ')}`);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required column: ${missing.join(', ')}`);
  const unsupported = headers.filter((header) => !supportedHeaders.includes(header));
  if (unsupported.length) throw new Error(`Unsupported columns: ${unsupported.join(', ')}`);

  const malformedRowIndex = rows.slice(1).findIndex((values) => values.length !== headers.length);
  if (malformedRowIndex !== -1) {
    const csvRowNumber = malformedRowIndex + 2;
    const actualColumns = rows[malformedRowIndex + 1].length;
    throw new Error(`Row ${csvRowNumber} has ${actualColumns} columns but the header has ${headers.length}. Check for missing commas, extra commas or unmatched quotes.`);
  }

  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function daysUntilEnd(record: CommercialRecord) {
  if (!record.end_date) return null;
  return Math.ceil((new Date(`${record.end_date}T00:00:00Z`).getTime() - Date.now()) / 86400000);
}

function isEndingWithin100Days(record: CommercialRecord) {
  const days = daysUntilEnd(record);
  return days != null && days >= 0 && days <= 100;
}

function isExpired(record: CommercialRecord) {
  const days = daysUntilEnd(record);
  return days != null && days < 0;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency || 'GBP'} ${value.toLocaleString('en-GB')}`;
  }
}

function buildActions(records: CommercialRecord[]): ActionItem[] {
  const actions: ActionItem[] = [];
  for (const record of records) {
    const days = daysUntilEnd(record);
    if (!record.end_date) actions.push({ record, priority: 'High', reason: 'No contract end date', nextAction: 'Confirm the renewal or expiry date' });
    if (!record.contract_owner_email) actions.push({ record, priority: 'High', reason: 'No accountable owner', nextAction: 'Assign the contract or pillar owner' });
    if (!record.sme_email) actions.push({ record, priority: 'High', reason: 'No SME email', nextAction: 'Add the SME who will complete readiness' });
    if (days != null && days < 0) actions.push({ record, priority: 'High', reason: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, nextAction: 'Confirm renewal, closure or replacement' });
    else if (days != null && days <= 100) actions.push({ record, priority: days <= 30 ? 'High' : 'Medium', reason: `${days} day${days === 1 ? '' : 's'} to expiry`, nextAction: 'Check whether a readiness request exists and requires action' });
  }
  return actions.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'High' ? -1 : 1));
}

export default function OrganisationWorkspacePage() {
  const params = useParams<{ slug: string }>();
  const [membership, setMembership] = useState<Organisation | null>(null);
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RegisterFilter>('all');
  const [showAllActions, setShowAllActions] = useState(false);

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
    if (!file || !membership || membership.role === 'viewer') return;
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
      const importedRecords = (data.records ?? []) as CommercialRecord[];
      if (importedRecords.length === 1) {
        window.location.href = `/organisations/${params.slug}/commercial/${importedRecords[0].id}`;
        return;
      }
      setMessage(`${data.imported} commercial records imported. ${data.readinessCreated || 0} readiness request(s) created. Review the BAU action queue below.`);
      await loadRecords(membership.organisation_id);
      setFilter('all');
      setSearch('');
      setShowAllActions(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.');
    } finally { setBusy(false); event.target.value = ''; }
  }

  const endingWithin100Days = records.filter(isEndingWithin100Days).length;
  const missingSme = records.filter((record) => !record.sme_email).length;
  const missingOwner = records.filter((record) => !record.contract_owner_email).length;
  const missingEndDate = records.filter((record) => !record.end_date).length;
  const exposureByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const record of records) {
      if (record.annual_value == null) continue;
      const currency = (record.currency || 'GBP').trim().toUpperCase();
      totals.set(currency, (totals.get(currency) ?? 0) + Number(record.annual_value));
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [records]);
  const actions = useMemo(() => buildActions(records), [records]);
  const displayedActions = showAllActions ? actions : actions.slice(0, 10);
  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === 'ending_100' && !isEndingWithin100Days(record)) return false;
      if (filter === 'expired' && !isExpired(record)) return false;
      if (filter === 'missing_owner' && record.contract_owner_email) return false;
      if (filter === 'missing_sme' && record.sme_email) return false;
      if (filter === 'missing_end_date' && record.end_date) return false;
      if (!term) return true;
      return [record.external_id, record.supplier_name, record.product_service, record.contract_owner_name, record.contract_owner_email, record.sme_name, record.sme_email]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [filter, records, search]);

  if (loading) return <main className="shell"><div className="card">Opening secure workspace…</div></main>;
  if (error && !membership?.organisations) return <main className="shell"><div className="card"><h2>Workspace unavailable</h2><p>{error}</p><a className="button-secondary" href="/">Back to organisations</a></div></main>;
  if (!membership?.organisations) return null;
  const organisation = membership.organisations;
  const canManageCommercialData = membership.role !== 'viewer';

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>{organisation.name}</div><div className="small">Trevecta Control · {membership.role}</div></div></div>
        <a className="button-secondary" href="/">Switch organisation</a>
      </div>

      <section><div className="kicker">BAU commercial control</div><h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{organisation.name}</h1><p className="lead">See what is due, what is missing, who owns it and what should happen next.</p></section>

      <section className="grid">
        <button className="card metric" onClick={() => setFilter('all')} style={{ textAlign: 'left', cursor: 'pointer' }} type="button"><span className="small">Active commercial records</span><strong>{records.length}</strong><span className="small">Open register →</span></button>
        <div className="card metric">
          <span className="small">Annual commercial exposure</span>
          {exposureByCurrency.length === 0 ? <strong style={{ fontSize: 30 }}>No values</strong> : exposureByCurrency.map(([currency, value]) => <strong key={currency} style={{ fontSize: exposureByCurrency.length === 1 ? 30 : 23 }}>{formatMoney(value, currency)}</strong>)}
          <span className="small">Source currencies shown separately · no FX conversion</span>
        </div>
        <button className="card metric" onClick={() => setFilter('ending_100')} style={{ textAlign: 'left', cursor: 'pointer' }} type="button"><span className="small">Within 100-day window</span><strong>{endingWithin100Days}</strong><span className="small">Review readiness →</span></button>
        <button className="card metric" onClick={() => setFilter('missing_owner')} style={{ textAlign: 'left', cursor: 'pointer' }} type="button"><span className="small">Missing accountable owner</span><strong>{missingOwner}</strong><span className="small">Assign ownership →</span></button>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Today&apos;s work</div>
        <h2>BAU action queue</h2>
        <p>Derived from the active commercial register&apos;s expiry, ownership and SME fields. Readiness delivery, response and escalation states are not yet connected.</p>
        {records.length === 0 ? <div className="message" role="status">No commercial records are loaded, so Trevecta cannot assess current BAU risk.</div> : actions.length === 0 ? <div className="message success" role="status">No immediate data-quality or renewal actions were derived from the active register.</div> : (
          <div className="organisation-list">
            {displayedActions.map((action, index) => (
              <a className="organisation-row" href={`/organisations/${params.slug}/commercial/${action.record.id}`} key={`${action.record.id}-${action.reason}-${index}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div><strong>{action.priority}: {action.reason}</strong><div className="small">{action.record.supplier_name} · {action.record.product_service || 'No product/service'}</div></div>
                <div className="small" style={{ textAlign: 'right' }}>{action.nextAction}<br />Owner: {action.record.contract_owner_email || 'unassigned'}<br />Open record →</div>
              </a>
            ))}
          </div>
        )}
        {actions.length > 10 && <button className="button-secondary" onClick={() => setShowAllActions((current) => !current)} style={{ marginTop: 14 }} type="button">{showAllActions ? 'Show first 10' : `Show all ${actions.length} actions`}</button>}
      </section>

      <section className="empty">
        <div className="card">
          <div className="kicker">1 · Prepare</div>
          <h2>Download the CSV template</h2>
          <p>Use the blank template to keep contract, owner, SME, value and date fields consistent.</p>
          <a className="button-secondary" download="trevecta-commercial-import-template.csv" href="/commercial-import-template.csv">Download CSV template</a>
          <p className="small" style={{ marginTop: 16 }}>Required: <code>supplier_name</code>. For actionable readiness also include <code>end_date</code>, <code>contract_owner_email</code>, <code>sme_name</code> and <code>sme_email</code>. Dates must use YYYY-MM-DD.</p>
        </div>

        <div className="card">
          {canManageCommercialData ? (
            <>
              <div className="kicker">2 · Upload</div>
              <h2>Upload commercial data</h2>
              <p>Trevecta validates the file, saves active records and evaluates whether they are entering the readiness window.</p>
              <label className="button-primary" style={{ display: 'inline-block', textAlign: 'center', cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Importing…' : 'Choose CSV file'}
                <input accept=".csv,text/csv" disabled={busy} onChange={importCsv} style={{ display: 'none' }} type="file" />
              </label>
              {message && <div className="message success" role="status">{message}</div>}
              {error && <div className="message error" role="alert">{error}</div>}
            </>
          ) : (
            <>
              <div className="kicker">Read-only access</div>
              <h2>Commercial imports are restricted</h2>
              <p>You can review the commercial register and BAU queue, but an owner, admin or member is required to import or change data.</p>
            </>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Source of truth</div>
        <h2>Commercial register</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <input aria-label="Search commercial register" onChange={(event) => setSearch(event.target.value)} placeholder="Search supplier, service, owner, SME or ID" style={{ flex: '1 1 280px', minHeight: 44, padding: '0 14px' }} type="search" value={search} />
          <select aria-label="Filter commercial register" onChange={(event) => setFilter(event.target.value as RegisterFilter)} style={{ minHeight: 44, padding: '0 14px' }} value={filter}>
            <option value="all">All active records</option>
            <option value="ending_100">Within 100-day window</option>
            <option value="expired">Expired contracts</option>
            <option value="missing_owner">Missing accountable owner</option>
            <option value="missing_sme">Missing SME email</option>
            <option value="missing_end_date">Missing end date</option>
          </select>
          {(search || filter !== 'all') && <button className="button-secondary" onClick={() => { setSearch(''); setFilter('all'); }} type="button">Clear filters</button>}
        </div>
        <div className="small" style={{ marginBottom: 14 }}>{visibleRecords.length} matching record{visibleRecords.length === 1 ? '' : 's'} · {missingSme} missing SME · {missingEndDate} missing end date</div>
        {records.length === 0 ? <p>No commercial records imported yet.</p> : visibleRecords.length === 0 ? <div className="message" role="status">No records match the current search or filter.</div> : (
          <div className="organisation-list">
            {visibleRecords.slice(0, 50).map((record) => {
              const days = daysUntilEnd(record);
              return (
                <a className="organisation-row" href={`/organisations/${params.slug}/commercial/${record.id}`} key={record.id} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div><strong>{record.supplier_name}</strong><div className="small">{record.product_service || 'No product/service'} · Owner: {record.contract_owner_email || 'missing'} · SME: {record.sme_email || 'missing'}</div></div>
                  <div className="small" style={{ textAlign: 'right' }}>{record.status || 'No status'} · {record.end_date || 'No end date'}{days != null ? ` (${days >= 0 ? `${days} days` : 'expired'})` : ''}<br />{record.annual_value == null ? 'No annual value' : formatMoney(Number(record.annual_value), record.currency)}<br />Open record →</div>
                </a>
              );
            })}
          </div>
        )}
        {visibleRecords.length > 50 && <p className="small" style={{ marginTop: 14 }}>Showing the first 50 matching records. Pagination is still required for larger registers.</p>}
      </section>
    </main>
  );
}
