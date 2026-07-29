'use client';

import { useEffect, useState } from 'react';
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
};

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : 'Not provided';
}

export default function CommercialRecordPage() {
  const params = useParams<{ slug: string; recordId: string }>();
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [record, setRecord] = useState<CommercialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const organisationResponse = await fetch('/api/organisations', { cache: 'no-store' });
        const organisationData = await organisationResponse.json();
        if (!organisationResponse.ok) throw new Error(organisationData.error ?? 'Unable to load organisation.');
        const selected = (organisationData.organisations as Organisation[]).find((item) => item.organisations?.slug === params.slug);
        if (!selected) throw new Error('Organisation not found or access is not permitted.');
        setOrganisation(selected);

        const recordResponse = await fetch(`/api/commercial-records?organisationId=${encodeURIComponent(selected.organisation_id)}&recordId=${encodeURIComponent(params.recordId)}`, { cache: 'no-store' });
        const recordData = await recordResponse.json();
        if (!recordResponse.ok) throw new Error(recordData.error ?? 'Unable to load commercial record.');
        setRecord(recordData.record as CommercialRecord);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load commercial record.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.recordId, params.slug]);

  async function archiveRecord() {
    if (!record || !organisation || organisation.role === 'viewer') return;
    const reason = window.prompt('Why is this record being archived? This will be retained in the audit data.');
    if (reason === null) return;
    if (!reason.trim()) { setError('An archive reason is required.'); return; }
    if (!window.confirm(`Archive ${record.supplier_name}? It will be removed from active dashboard totals.`)) return;

    setArchiving(true); setError(null);
    try {
      const response = await fetch('/api/commercial-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, organisationId: organisation.organisation_id, action: 'archive', reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to archive record.');
      window.location.href = `/organisations/${params.slug}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive record.');
      setArchiving(false);
    }
  }

  if (loading) return <main className="shell"><div className="card">Opening commercial record…</div></main>;
  if (error && (!record || !organisation?.organisations)) return <main className="shell"><div className="card"><h2>Record unavailable</h2><p>{error}</p><a className="button-secondary" href={`/organisations/${params.slug}`}>Back to workspace</a></div></main>;
  if (!record || !organisation?.organisations) return null;

  const triggerDate = record.end_date ? new Date(`${record.end_date}T00:00:00`) : null;
  if (triggerDate) triggerDate.setDate(triggerDate.getDate() - 100);
  const isDue = triggerDate ? triggerDate.getTime() <= Date.now() : false;
  const readinessTiming = !record.end_date
    ? 'End date missing'
    : !record.sme_email
      ? 'SME contact missing'
      : isDue
        ? 'Inside 100-day window'
        : 'Not yet in window';

  return (
    <main className="shell dashboard">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><div>{organisation.organisations.name}</div><div className="small">Commercial record</div></div></div>
        <a className="button-secondary" href={`/organisations/${params.slug}`}>Back to workspace</a>
      </div>

      <section>
        <div className="kicker">Imported commercial record</div>
        <h1 style={{ fontSize: 'clamp(42px, 6vw, 68px)', marginBottom: 10 }}>{record.supplier_name}</h1>
        <p className="lead">{record.product_service || 'No product or service description supplied.'}</p>
      </section>

      <section className="grid">
        <div className="card metric"><span className="small">End date</span><strong style={{ fontSize: 28 }}>{formatDate(record.end_date)}</strong></div>
        <div className="card metric"><span className="small">Readiness trigger</span><strong style={{ fontSize: 28 }}>{triggerDate ? triggerDate.toLocaleDateString('en-GB') : 'Not available'}</strong></div>
        <div className="card metric"><span className="small">Readiness timing</span><strong style={{ fontSize: 28 }}>{readinessTiming}</strong><span className="small">Calculated from contract fields only</span></div>
      </section>

      <section className="empty">
        <div className="card">
          <div className="kicker">Contract details</div>
          <h2>Commercial information</h2>
          <p><strong>Reference:</strong> {record.external_id || 'Not provided'}</p>
          <p><strong>Status:</strong> {record.status || 'Not provided'}</p>
          <p><strong>Start date:</strong> {formatDate(record.start_date)}</p>
          <p><strong>Annual value:</strong> {record.annual_value == null ? 'Not provided' : `${record.currency} ${Number(record.annual_value).toLocaleString()}`}</p>
          <p><strong>Source file:</strong> {record.source_file_name || 'Not recorded'}</p>
        </div>
        <div className="card">
          <div className="kicker">Readiness contact</div>
          <h2>Owner and SME</h2>
          <p><strong>Contract owner:</strong> {record.contract_owner_name || 'Not provided'}</p>
          <p><strong>Owner email:</strong> {record.contract_owner_email || 'Not provided'}</p>
          <p><strong>SME:</strong> {record.sme_name || 'Not provided'}</p>
          <p><strong>SME email:</strong> {record.sme_email || 'Not provided'}</p>
          <p className="small">Readiness delivery, response, reminder and escalation states are not yet connected to this page.</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="kicker">Record management</div>
        {organisation.role === 'viewer' ? (
          <>
            <h2>Read-only record</h2>
            <p>You can review this record, but an owner, admin or member is required to archive or change commercial data.</p>
          </>
        ) : (
          <>
            <h2>Archive this record</h2>
            <p>Archive incorrect, duplicated or no-longer-active records. Archived records are removed from active dashboard totals while retaining the reason, user and timestamp.</p>
            <button className="button-secondary" disabled={archiving} onClick={archiveRecord} type="button">{archiving ? 'Archiving…' : 'Archive record'}</button>
            {error && <div className="message error" role="alert">{error}</div>}
          </>
        )}
      </section>
    </main>
  );
}
