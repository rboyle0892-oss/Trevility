'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Organisation = {
  organisation_id: string;
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

        const recordsResponse = await fetch(`/api/commercial-records?organisationId=${encodeURIComponent(selected.organisation_id)}`, { cache: 'no-store' });
        const recordsData = await recordsResponse.json();
        if (!recordsResponse.ok) throw new Error(recordsData.error ?? 'Unable to load commercial record.');
        const selectedRecord = (recordsData.records as CommercialRecord[]).find((item) => item.id === params.recordId);
        if (!selectedRecord) throw new Error('Commercial record not found or access is not permitted.');
        setRecord(selectedRecord);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load commercial record.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.recordId, params.slug]);

  if (loading) return <main className="shell"><div className="card">Opening commercial record…</div></main>;
  if (error || !record || !organisation?.organisations) return <main className="shell"><div className="card"><h2>Record unavailable</h2><p>{error}</p><a className="button-secondary" href={`/organisations/${params.slug}`}>Back to workspace</a></div></main>;

  const triggerDate = record.end_date ? new Date(`${record.end_date}T00:00:00`) : null;
  if (triggerDate) triggerDate.setDate(triggerDate.getDate() - 100);
  const isDue = triggerDate ? triggerDate.getTime() <= Date.now() : false;

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
        <div className="card metric"><span className="small">Readiness status</span><strong style={{ fontSize: 28 }}>{!record.sme_email ? 'Missing SME email' : isDue ? 'Request due now' : 'Waiting for trigger'}</strong></div>
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
          <p className="small">The no-login readiness form and email delivery are the next workflow step.</p>
        </div>
      </section>
    </main>
  );
}
