export default function ConfirmedPage() {
  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 680, margin: '12vh auto' }}>
        <div className="kicker">Email confirmed</div>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 64px)', marginBottom: 18 }}>You’re ready to sign in.</h1>
        <p className="lead">Your email address has been confirmed. Return to Trevecta and sign in with the password you created.</p>
        <a className="button-primary" href="/" style={{ display: 'inline-flex', marginTop: 22, textDecoration: 'none' }}>
          Return to sign in
        </a>
      </section>
    </main>
  );
}
