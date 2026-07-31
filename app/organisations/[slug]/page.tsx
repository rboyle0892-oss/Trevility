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

type ImportRow = Record<string, string>;
type DatasetType = 'commercial_records' | 'budget_lines' | 'po_info' | 'readiness_requests' | 'unknown';
type ImportSheet = {
  name: string;
  dataset: DatasetType;
  headers: string[];
  rows: ImportRow[];
  warnings: string[];
  blockingErrors: string[];
};
type PendingImport = { fileName: string; sheets: ImportSheet[]; selectedSheet: number };
type RegisterFilter = 'all' | 'ending_100' | 'expired' | 'missing_owner' | 'missing_sme' | 'missing_end_date';
type ActionItem = { record: CommercialRecord; priority: 'High' | 'Medium'; reason: string; nextAction: string };

const pageSizes = [25, 50, 100];
const commercialFields = ['external_id','supplier_name','product_service','contract_owner_name','contract_owner_email','sme_name','sme_email','start_date','end_date','annual_value','currency','status'];
const aliases: Record<string, string[]> = {
  external_id: ['external_id', 'external id', 'contract id', 'reference'],
  supplier_name: ['supplier_name', 'supplier name', 'supplier', 'vendor', 'payee name'],
  product_service: ['product_service', 'product service', 'product / service', 'product', 'service', 'description'],
  contract_owner_name: ['contract_owner_name', 'contract owner name', 'contract owner', 'owner name'],
  contract_owner_email: ['contract_owner_email', 'contract owner email', 'owner email'],
  sme_name: ['sme_name', 'sme name', 'sme'],
  sme_email: ['sme_email', 'sme email'],
  start_date: ['start_date', 'start date', 'contract start date'],
  end_date: ['end_date', 'end date', 'contract end date', 'renewal date'],
  annual_value: ['annual_value', 'annual value', 'fy27_po_budget_value', 'budget value'],
  currency: ['currency', 'budget currency'],
  status: ['status', 'budget status', 'contract status'],
};

function normaliseHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function canonicalHeader(value: unknown) {
  const normalised = normaliseHeader(value);
  const match = Object.entries(aliases).find(([, values]) => values.includes(normalised));
  return match?.[0] ?? normalised.replace(/\s+/g, '_');
}

function classifyDataset(sheetName: string, headers: string[]): DatasetType {
  const values = new Set(headers.map(normaliseHeader));
  const name = normaliseHeader(sheetName);
  const has = (...candidates: string[]) => candidates.some((candidate) => values.has(normaliseHeader(candidate)));
  if (name.includes('readiness') || (has('requeststatus', 'request status') && has('budgetcode', 'budget code'))) return 'readiness_requests';
  if (name.includes('po info') || (has('po number') && has('payee name', 'total cost', 'total cost (rep)'))) return 'po_info';
  if (name.includes('budget') || (has('budgetcode', 'budget code', 'b code') && has('budget status', 'fy27_po_budget_value', 'updated po', 'latest po'))) return 'budget_lines';
  if (has('supplier_name', 'supplier name', 'supplier', 'vendor') && has('end_date', 'end date', 'contract end date', 'product_service', 'product / service')) return 'commercial_records';
  return 'unknown';
}

function rowsFromMatrix(matrix: unknown[][], sheetName: string): ImportSheet {
  if (matrix.length < 2) return { name: sheetName, dataset: 'unknown', headers: [], rows: [], warnings: [], blockingErrors: ['The sheet needs a header row and at least one data row.'] };
  const rawHeaders = matrix[0].map((value) => String(value ?? '').trim());
  const blank = rawHeaders.findIndex((header) => !header);
  const canonicalHeaders = rawHeaders.map(canonicalHeader);
  const duplicates = canonicalHeaders.filter((header, index) => canonicalHeaders.indexOf(header) !== index);
  const blockingErrors: string[] = [];
  if (blank !== -1) blockingErrors.push(`Column ${blank + 1} has no header.`);
  if (duplicates.length) blockingErrors.push(`Duplicate mapped columns: ${[...new Set(duplicates)].join(', ')}.`);
  const rows = matrix.slice(1)
    .filter((values) => values.some((value) => String(value ?? '').trim()))
    .map((values) => Object.fromEntries(canonicalHeaders.map((header, index) => [header, String(values[index] ?? '').trim()])));
  const dataset = classifyDataset(sheetName, rawHeaders);
  const warnings: string[] = [];
  if (dataset === 'commercial_records') {
    if (!canonicalHeaders.includes('supplier_name')) blockingErrors.push('Commercial records require a supplier column.');
    const unsupported = canonicalHeaders.filter((header) => !commercialFields.includes(header));
    if (unsupported.length) blockingErrors.push(`Unsupported commercial columns: ${unsupported.join(', ')}.`);
    const missingEnd = rows.filter((row) => !row.end_date).length;
    const missingOwner = rows.filter((row) => !row.contract_owner_email).length;
    const missingSme = rows.filter((row) => !row.sme_email).length;
    if (missingEnd) warnings.push(`${missingEnd} row(s) have no end date.`);
    if (missingOwner) warnings.push(`${missingOwner} row(s) have no accountable owner email.`);
    if (missingSme) warnings.push(`${missingSme} row(s) have no SME email.`);
  }
  if (dataset === 'unknown') warnings.push('Dataset type could not be identified. Nothing can be imported until the sheet is mapped.');
  return { name: sheetName, dataset, headers: canonicalHeaders, rows, warnings, blockingErrors };
}

function parseCsv(text: string, fileName: string): ImportSheet {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); matrix.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(cell); if (row.some((value) => value.trim())) matrix.push(row);
  return rowsFromMatrix(matrix, fileName.replace(/\.csv$/i, ''));
}

function datasetLabel(dataset: DatasetType) {
  return ({ commercial_records: 'Commercial records', budget_lines: 'Budget Lines', po_info: 'PO Info', readiness_requests: 'Readiness Requests', unknown: 'Unrecognised' })[dataset];
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
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 }).format(value); }
  catch { return `${currency || 'GBP'} ${value.toLocaleString('en-GB')}`; }
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
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RegisterFilter>('all');
  const [showAllActions, setShowAllActions] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load organisation.'); }
      finally { setLoading(false); }
    }
    void load();
  }, [params.slug]);

  useEffect(() => { setPage(1); }, [search, filter, pageSize]);

  async function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !membership || membership.role === 'viewer') return;
    setError(null); setMessage(null); setWarning(null);
    try {
      let sheets: ImportSheet[];
      if (/\.csv$/i.test(file.name)) {
        sheets = [parseCsv(await file.text(), file.name)];
      } else {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        sheets = workbook.SheetNames.map((name) => {
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false });
          return rowsFromMatrix(matrix, name);
        });
      }
      if (!sheets.length) throw new Error('No readable sheets were found.');
      const firstRecognised = sheets.findIndex((sheet) => sheet.dataset !== 'unknown');
      setPendingImport({ fileName: file.name, sheets, selectedSheet: firstRecognised >= 0 ? firstRecognised : 0 });
    } catch (caught) {
      setPendingImport(null);
      setError(caught instanceof Error ? caught.message : 'Unable to review this file.');
    }
  }

  async function confirmImport() {
    if (!pendingImport || !membership || membership.role === 'viewer') return;
    const sheet = pendingImport.sheets[pendingImport.selectedSheet];
    if (sheet.dataset !== 'commercial_records' || sheet.blockingErrors.length) return;
    if (sheet.rows.length > 500) { setError('This MVP import supports up to 500 commercial rows at a time.'); return; }
    setBusy(true); setError(null); setMessage(null); setWarning(null);
    try {
      const response = await fetch('/api/commercial-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organisationId: membership.organisation_id, fileName: pendingImport.fileName, records: sheet.rows }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Import failed.');
      await loadRecords(membership.organisation_id);
      setFilter('all'); setSearch(''); setShowAllActions(false); setPage(1); setPendingImport(null);
      if (data.readinessWarning) setWarning(data.readinessWarning);
      else setMessage(`${data.imported} commercial records imported. ${data.readinessCreated ?? 0} readiness request(s) created.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Import failed.'); }
    finally { setBusy(false); }
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
      return [record.external_id, record.supplier_name, record.product_service, record.contract_owner_name, record.contract_owner_email, record.sme_name, record.sme_email].some((value) => value?.toLowerCase().includes(term));
    });
  }, [filter, records, search]);
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pagedRecords = visibleRecords.slice(pageStart, pageStart + pageSize);
  const selectedSheet = pendingImport?.sheets[pendingImport.selectedSheet];

  if (loading) return <main className="shell"><div className="card">Opening secure workspace…</div></main>;
  if (error && !membership?.organisations) return <main className="shell"><div className="card"><h2>Workspace unavailable</h2><p>{error}</p><a className="button-secondary" href="/">Back to organisations</a></div></main>;
  if (!membership?.organisations) return null;
  const organisation = membership.organisations;
  const canManageCommercialData = membership.role !== 'viewer';

  return (
    <main className="shell dashboard">
      <div className="topbar"><div className="brand"><span className="brand-mark">T</span><div><div>{organisation.name}</div><div className="small">Trevecta Control · {membership.role}</div></div></div><a className="button-secondary" href="/">Switch organisation</a></div>
      <section><div className="kicker">BAU commercial control</div><h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{organisation.name}</h1><p className="lead">See what is due, what is missing, who owns it and what should happen next.</p></section>
      <section className="grid">
        <button className="card metric" onClick={() => setFilter('all')} type="button"><span className="small">Active commercial records</span><strong>{records.length}</strong><span className="small">Open register →</span></button>
        <div className="card metric"><span className="small">Annual commercial exposure</span>{exposureByCurrency.length === 0 ? <strong style={{ fontSize: 30 }}>No values</strong> : exposureByCurrency.map(([currency, value]) => <strong key={currency} style={{ fontSize: exposureByCurrency.length === 1 ? 30 : 23 }}>{formatMoney(value, currency)}</strong>)}<span className="small">Source currencies shown separately · no FX conversion</span></div>
        <button className="card metric" onClick={() => setFilter('ending_100')} type="button"><span className="small">Within 100-day window</span><strong>{endingWithin100Days}</strong><span className="small">Review readiness →</span></button>
        <button className="card metric" onClick={() => setFilter('missing_owner')} type="button"><span className="small">Missing accountable owner</span><strong>{missingOwner}</strong><span className="small">Assign ownership →</span></button>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Today&apos;s work</div><h2>BAU action queue</h2><p>Derived from the active commercial register&apos;s expiry, ownership and SME fields.</p>
        {records.length === 0 ? <div className="message" role="status">No commercial records are loaded, so Trevecta cannot assess current BAU risk.</div> : actions.length === 0 ? <div className="message success" role="status">No immediate data-quality or renewal actions were derived from the active register.</div> : <div className="organisation-list">{displayedActions.map((action, index) => <a className="organisation-row" href={`/organisations/${params.slug}/commercial/${action.record.id}`} key={`${action.record.id}-${action.reason}-${index}`}><div><strong>{action.priority}: {action.reason}</strong><div className="small">{action.record.supplier_name} · {action.record.product_service || 'No product/service'}</div></div><div className="small" style={{ textAlign: 'right' }}>{action.nextAction}<br />Owner: {action.record.contract_owner_email || 'unassigned'}<br />Open record →</div></a>)}</div>}
        {actions.length > 10 && <button className="button-secondary" onClick={() => setShowAllActions((current) => !current)} style={{ marginTop: 14 }} type="button">{showAllActions ? 'Show first 10' : `Show all ${actions.length} actions`}</button>}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Import Centre</div><h2>Upload workbook or CSV</h2><p>Review detected datasets, sheets, mappings and data-quality issues before anything is saved.</p>
        {canManageCommercialData ? <>
          <label className="button-primary" style={{ display: 'inline-block', cursor: busy ? 'wait' : 'pointer' }}>{pendingImport ? 'Choose a different file' : 'Choose XLSX or CSV'}<input accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" disabled={busy} onChange={selectImportFile} style={{ display: 'none' }} type="file" /></label>
          {pendingImport && selectedSheet && <div className="message" role="status" style={{ marginTop: 16 }}>
            <strong>{pendingImport.fileName}</strong><div className="small">{pendingImport.sheets.length} sheet{pendingImport.sheets.length === 1 ? '' : 's'} detected. Nothing has been saved.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{pendingImport.sheets.map((sheet, index) => <button className={index === pendingImport.selectedSheet ? 'button-primary' : 'button-secondary'} key={`${sheet.name}-${index}`} onClick={() => setPendingImport({ ...pendingImport, selectedSheet: index })} type="button">{sheet.name} · {datasetLabel(sheet.dataset)} · {sheet.rows.length}</button>)}</div>
            <div className="card" style={{ marginTop: 14 }}><div className="kicker">Detected dataset</div><h3>{datasetLabel(selectedSheet.dataset)}</h3><p>{selectedSheet.rows.length} data row{selectedSheet.rows.length === 1 ? '' : 's'} · {selectedSheet.headers.length} mapped column{selectedSheet.headers.length === 1 ? '' : 's'}</p><div className="small">Mapped headers: {selectedSheet.headers.join(', ') || 'None'}</div>
              {selectedSheet.blockingErrors.map((item) => <div className="message error" key={item} role="alert">{item}</div>)}
              {selectedSheet.warnings.map((item) => <div className="message" key={item}>{item}</div>)}
              {selectedSheet.rows.length > 0 && <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{selectedSheet.headers.slice(0, 6).map((header) => <th key={header} style={{ textAlign: 'left' }}>{header}</th>)}</tr></thead><tbody>{selectedSheet.rows.slice(0, 5).map((row, index) => <tr key={index}>{selectedSheet.headers.slice(0, 6).map((header) => <td key={header}>{row[header] || '—'}</td>)}</tr>)}</tbody></table></div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {selectedSheet.dataset === 'commercial_records' ? <button className="button-primary" disabled={busy || selectedSheet.blockingErrors.length > 0} onClick={confirmImport} type="button">{busy ? 'Importing…' : `Import ${selectedSheet.rows.length} commercial rows`}</button> : <button className="button-primary" disabled type="button">Database pipeline required before import</button>}
                <button className="button-secondary" disabled={busy} onClick={() => setPendingImport(null)} type="button">Cancel import review</button>
              </div>
              {selectedSheet.dataset !== 'commercial_records' && selectedSheet.dataset !== 'unknown' && <p className="small" style={{ marginTop: 10 }}>This sheet is now recognised and previewed. It is intentionally read-only until the reviewed Supabase tables and reconciliation workflow are added.</p>}
            </div>
          </div>}
          {message && <div className="message success" role="status">{message}</div>}{warning && <div className="message error" role="alert"><strong>Records imported, readiness reconciliation failed.</strong><br />{warning}<br />Do not upload the file again.</div>}{error && <div className="message error" role="alert">{error}</div>}
        </> : <><div className="kicker">Read-only access</div><h3>Imports are restricted</h3><p>An owner, admin or member is required to import or change data.</p></>}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Source of truth</div><h2>Commercial register</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}><input aria-label="Search commercial register" onChange={(event) => setSearch(event.target.value)} placeholder="Search supplier, service, owner, SME or ID" style={{ flex: '1 1 280px', minHeight: 44, padding: '0 14px' }} type="search" value={search} /><select aria-label="Filter commercial register" onChange={(event) => setFilter(event.target.value as RegisterFilter)} style={{ minHeight: 44, padding: '0 14px' }} value={filter}><option value="all">All active records</option><option value="ending_100">Within 100-day window</option><option value="expired">Expired contracts</option><option value="missing_owner">Missing accountable owner</option><option value="missing_sme">Missing SME email</option><option value="missing_end_date">Missing end date</option></select><select aria-label="Records per page" onChange={(event) => setPageSize(Number(event.target.value))} style={{ minHeight: 44, padding: '0 14px' }} value={pageSize}>{pageSizes.map((size) => <option key={size} value={size}>{size} per page</option>)}</select>{(search || filter !== 'all') && <button className="button-secondary" onClick={() => { setSearch(''); setFilter('all'); }} type="button">Clear filters</button>}</div>
        <div className="small" style={{ marginBottom: 14 }}>{visibleRecords.length === 0 ? '0 matching records' : `${pageStart + 1}–${Math.min(pageStart + pageSize, visibleRecords.length)} of ${visibleRecords.length} matching records`} · {missingSme} missing SME · {missingEndDate} missing end date</div>
        {records.length === 0 ? <p>No commercial records imported yet.</p> : visibleRecords.length === 0 ? <div className="message" role="status">No records match the current search or filter.</div> : <div className="organisation-list">{pagedRecords.map((record) => { const days = daysUntilEnd(record); return <a className="organisation-row" href={`/organisations/${params.slug}/commercial/${record.id}`} key={record.id}><div><strong>{record.supplier_name}</strong><div className="small">{record.product_service || 'No product/service'} · Owner: {record.contract_owner_email || 'missing'} · SME: {record.sme_email || 'missing'}</div></div><div className="small" style={{ textAlign: 'right' }}>{record.status || 'No status'} · {record.end_date || 'No end date'}{days != null ? ` (${days >= 0 ? `${days} days` : 'expired'})` : ''}<br />{record.annual_value == null ? 'No annual value' : formatMoney(Number(record.annual_value), record.currency)}<br />Open record →</div></a>; })}</div>}
        {pageCount > 1 && <nav aria-label="Commercial register pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}><span className="small">Page {safePage} of {pageCount}</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="button-secondary" disabled={safePage === 1} onClick={() => setPage(1)} type="button">First</button><button className="button-secondary" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Previous</button><button className="button-secondary" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">Next</button><button className="button-secondary" disabled={safePage === pageCount} onClick={() => setPage(pageCount)} type="button">Last</button></div></nav>}
      </section>
    </main>
  );
}
