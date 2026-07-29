'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  source_file_name: string | null;
  source_row_number: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

type ReadinessRequest = {
  id: string;
  recipient_name: string | null;
  recipient_email: string;
  due_date: string | null;
  trigger_date: string;
  status: 'pending' | 'sent' | 'opened' | 'submitted' | 'overdue' | 'cancelled';
  sent_at: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  response: Record<string, unknown>;
  created_at: string;
};

type EditFields = {
  external_id: string;
  supplier_name: string;
  product_service: string;
  contract_owner_name: string;
  contract_owner_email: string;
  sme_name: string;
  sme_email: string;
  start_date: string;
  end_date: string;
  annual_value: string;
  currency: string;
  status: string;
};

function formatDate(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : 'Not provided';
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB') : 'Not recorded';
}

function fieldsFromRecord(record: CommercialRecord): EditFields {
  return {
    external_id: record.external_id ?? '',
    supplier_name: record.supplier_name,
    product_service: record.product_service ?? '',
    contract_owner_name: record.contract_owner_name ?? '',
    contract_owner_email: record.contract_owner_email ?? '',
    sme_name: record.sme_name ?? '',
    sme_email: record.sme_email ?? '',
    start_date: record.start_date ?? '',
    end_date: record.end_date ?? '',
    annual_value: record.annual_value == null ? '' : String(record.annual_value),
    currency: record.currency || 'GBP',
    status: record.status ?? '',
  };
}

export default function CommercialRecordPage() {
  const params = useParams<{ slug: string; recordId: string }>();
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [record, setRecord] = useState<CommercialRecord | null>(null);
  const [readinessRequests, setReadinessRequests] = useState<ReadinessRequest[]>([]);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRecord(selected: Organisation) {
    const recordResponse = await fetch(`/api/commercial-records?organisationId=${encodeURIComponent(selected.organisation_id)}&recordId=${encodeURIComponent(params.recordId)}&includeArchived=true`, { cache: 'no-store' });
    const recordData = await recordResponse.json();
    if (!recordResponse.ok) throw new Error(recordData.error ?? 'Unable to load commercial record.');
    const nextRecord = recordData.record as CommercialRecord;
    setRecord(nextRecord);
    setFields(fieldsFromRecord(nextRecord));
    setReadinessRequests((recordData.readinessRequests ?? []) as ReadinessRequest[]);
  }

  useEffect(() => {
    async function load() {
      try {
        const organisationResponse = await fetch('/api/organisations', { cache: 'no-store' });
        const organisationData = await organisationResponse.json();
        if (!organisationResponse.ok) throw new Error(organisationData.error ?? 'Unable to load organisation.');
        const selected = (organisationData.organisations as Organisation[]).find((item) => item.organisations?.slug === params.slug);
        if (!selected) throw new Error('Organisation not found or access is not permitted.');
        setOrganisation(selected);
        await loadRecord(selected);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load commercial record.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.recordId, params.slug]);

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!record || !organisation || !fields || organisation.role === 'viewer') return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/commercial-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, organisationId: organisation.organisation_id, action: 'update', fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to save record.');
      setRecord(data.record as CommercialRecord);
      setFields(fieldsFromRecord(data.record as CommercialRecord));
      setEditing(false);
      setMessage('Commercial record updated. Dashboard figures and work queues will reflect the corrected values.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save record.');
    } finally { setBusy(false); }
  }

  async function changeArchiveState(action: 'archive' | 'restore') {
    if (!record || !organisation || organisation.role === 'viewer') return;
    let reason = '';
    if (action === 'archive') {
      const entered = window.prompt('Why is this record being archived? The reason will remain visible on the record.');
      if (entered === null) return;
      reason = entered.trim();
      if (!reason) { setError('An archive reason is required.'); return; }
      if (!window.confirm(`Archive ${record.supplier_name}? It will be removed from active dashboard totals but retained for recovery.`)) return;
    } else if (!window.confirm(`Restore ${record.supplier_name} to the active commercial register?`)) return;

    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/commercial-records', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, organisationId: organisation.organisation_id, action, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Unable to ${action} record.`);
      setRecord(data.record as CommercialRecord);
      setFields(fieldsFromRecord(data.record as CommercialRecord));
      setMessage(action === 'archive' ? 'Record archived. It is excluded from active totals and can be restored here.' : 'Record restored to the active commercial register.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${action} record.`);
    } finally { setBusy(false); }
  }

  async function retryReadiness() {
    if (!organisation || organisation.role === 'viewer') return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/commercial-records', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organisationId: organisation.organisation_id, action: 'retry_readiness' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to retry readiness generation.');
      await loadRecord(organisation);
      setMessage(`${data.readinessCreated ?? 0} new readiness request(s) created. Existing requests were not duplicated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to retry readiness generation.');
    } finally { setBusy(false); }
  }

  const latestReadiness = readinessRequests[0] ?? null;
  const readinessSummary = useMemo(() => {
    if (!record) return 'Not available';
    if (latestReadiness) return latestReadiness.status;
    if (!record.end_date) return 'Blocked: end date missing';
    if (!record.sme_email) return 'Blocked: SME contact missing';
    const trigger = new Date(`${record.end_date}T00:00:00`); trigger.setDate(trigger.getDate() - 100);
    return trigger.getTime() <= Date.now() ? 'Due: request not found' : 'Not yet in window';
  }, [latestReadiness, record]);

  if (loading) return <main className="shell"><div className="card">Opening commercial record…</div></main>;
  if (error && (!record || !organisation?.organisations)) return <main className="shell"><div className="card"><h2>Record unavailable</h2><p>{error}</p><a className="button-secondary" href={`/organisations/${params.slug}`}>Back to workspace</a></div></main>;
  if (!record || !organisation?.organisations || !fields) return null;

  const triggerDate = record.end_date ? new Date(`${record.end_date}T00:00:00`) : null;
  if (triggerDate) triggerDate.setDate(triggerDate.getDate() - 100);
  const canManage = organisation.role !== 'viewer';

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>{organisation.organisations.name}</div><div className="small">Commercial record · {record.archived_at ? 'Archived' : 'Active'}</div></div></div>
        <a className="button-secondary" href={`/organisations/${params.slug}`}>Back to workspace</a>
      </div>

      {record.archived_at && <div className="message error" role="status"><strong>Archived record</strong><br />Archived {formatDateTime(record.archived_at)} · Reason: {record.archive_reason || 'Not recorded'}</div>}
      {message && <div className="message success" role="status">{message}</div>}
      {error && <div className="message error" role="alert">{error}</div>}

      <section>
        <div className="kicker">Commercial evidence and next action</div>
        <h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{record.supplier_name}</h1>
        <p className="lead">{record.product_service || 'No product or service description supplied.'}</p>
      </section>

      <section className="grid">
        <div className="card metric"><span className="small">End date</span><strong style={{ fontSize: 28 }}>{formatDate(record.end_date)}</strong></div>
        <div className="card metric"><span className="small">Readiness trigger</span><strong style={{ fontSize: 28 }}>{triggerDate ? triggerDate.toLocaleDateString('en-GB') : 'Not available'}</strong></div>
        <div className="card metric"><span className="small">Readiness state</span><strong style={{ fontSize: 28, textTransform: 'capitalize' }}>{readinessSummary.replaceAll('_', ' ')}</strong><span className="small">Backed by live readiness request data</span></div>
      </section>

      <section className="empty">
        <div className="card">
          <div className="kicker">Contract details</div><h2>Commercial information</h2>
          <p><strong>Reference:</strong> {record.external_id || 'Not provided'}</p><p><strong>Status:</strong> {record.status || 'Not provided'}</p>
          <p><strong>Start date:</strong> {formatDate(record.start_date)}</p><p><strong>Annual value:</strong> {record.annual_value == null ? 'Not provided' : `${record.currency} ${Number(record.annual_value).toLocaleString('en-GB')}`}</p>
          <p><strong>Source evidence:</strong> {record.source_file_name || 'Not recorded'}{record.source_row_number ? ` · row ${record.source_row_number}` : ''}</p>
          <p className="small">Created {formatDateTime(record.created_at)} · Last changed {formatDateTime(record.updated_at)}</p>
        </div>
        <div className="card">
          <div className="kicker">Accountability</div><h2>Owner and SME</h2>
          <p><strong>Contract owner:</strong> {record.contract_owner_name || 'Not provided'}</p><p><strong>Owner email:</strong> {record.contract_owner_email || 'Not provided'}</p>
          <p><strong>SME:</strong> {record.sme_name || 'Not provided'}</p><p><strong>SME email:</strong> {record.sme_email || 'Not provided'}</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Readiness lifecycle</div><h2>Requests and responses</h2>
        {readinessRequests.length === 0 ? <div className="message" role="status">No readiness request is linked to this record. {readinessSummary.startsWith('Due') ? 'Retry generation to recover the missing request.' : 'A request will be created when the record enters the 100-day window and has an SME email.'}</div> : <div className="organisation-list">{readinessRequests.map((request) => <div className="organisation-row" key={request.id}><div><strong style={{ textTransform: 'capitalize' }}>{request.status}</strong><div className="small">{request.recipient_name || 'Unnamed SME'} · {request.recipient_email}</div></div><div className="small" style={{ textAlign: 'right' }}>Trigger: {formatDate(request.trigger_date)}<br />Due: {formatDate(request.due_date)}<br />Submitted: {formatDateTime(request.submitted_at)}</div></div>)}</div>}
        {canManage && !record.archived_at && <button className="button-secondary" disabled={busy} onClick={retryReadiness} style={{ marginTop: 14 }} type="button">{busy ? 'Working…' : 'Retry readiness generation'}</button>}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Record correction</div>
        {!canManage ? <><h2>Read-only record</h2><p>You can review this record, but an owner, admin or member is required to change it.</p></> : !editing ? <><h2>Edit or correct this record</h2><p>Correct imported values here instead of re-uploading or creating a duplicate record.</p><button className="button-primary" disabled={busy || Boolean(record.archived_at)} onClick={() => setEditing(true)} type="button">Edit record</button></> : <form onSubmit={saveRecord}><h2>Edit commercial record</h2><div className="grid" style={{ alignItems: 'start' }}>{Object.entries(fields).map(([key, value]) => <label key={key} style={{ display: 'grid', gap: 6 }}><span className="small">{key.replaceAll('_', ' ')}</span><input onChange={(event) => setFields((current) => current ? { ...current, [key]: event.target.value } : current)} required={key === 'supplier_name'} style={{ minHeight: 44, padding: '0 12px' }} type={key.includes('date') ? 'date' : key.includes('email') ? 'email' : key === 'annual_value' ? 'number' : 'text'} value={value} /></label>)}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}><button className="button-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save changes'}</button><button className="button-secondary" disabled={busy} onClick={() => { setFields(fieldsFromRecord(record)); setEditing(false); setError(null); }} type="button">Cancel</button></div></form>}
      </section>

      {canManage && <section className="card" style={{ marginTop: 20 }}><div className="kicker">Lifecycle management</div>{record.archived_at ? <><h2>Restore this record</h2><p>Return the record to active dashboard totals and work queues.</p><button className="button-primary" disabled={busy} onClick={() => changeArchiveState('restore')} type="button">{busy ? 'Restoring…' : 'Restore record'}</button></> : <><h2>Archive this record</h2><p>Archive incorrect, duplicated or no-longer-active records without permanently deleting evidence.</p><button className="button-secondary" disabled={busy} onClick={() => changeArchiveState('archive')} type="button">{busy ? 'Archiving…' : 'Archive record'}</button></>}</section>}
    </main>
  );
}
