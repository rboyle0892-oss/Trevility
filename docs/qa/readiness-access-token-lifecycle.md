# Readiness access-token lifecycle gap

## Finding

The current readiness generator creates rows without creating an access token or expiry. Production data confirms every current readiness request has both `access_token_hash` and `access_token_expires_at` set to null, including requests labelled `opened` and `submitted`.

This means the secure no-login SME journey is not merely incomplete in the UI: the persisted request does not contain the credential needed to support a secure link, expiry, revocation, replacement or replay protection.

## Product risk

- A request can be presented as sent, opened or submitted without evidence of a secure delivery credential.
- There is no enforceable expiry window.
- A compromised link cannot be revoked or rotated.
- Reassignment cannot safely invalidate the old recipient's access.
- Submission provenance cannot be linked to a specific issued token.
- Any future public form risks being implemented with an insecure identifier or an indefinitely reusable URL.

## Required design

1. Generate a cryptographically strong, single-purpose token server-side when a request is issued.
2. Persist only a one-way hash, token version, issue time and expiry.
3. Return the plaintext token only to the delivery operation that builds the link.
4. Validate token hash, expiry, request state and organisation linkage on every public read/write.
5. Rotate and revoke tokens on recipient replacement, cancellation, supersession or suspected compromise.
6. Preserve the historical request and its token lifecycle events in the audit trail.
7. Prevent submitted or cancelled requests from accepting further writes unless a controlled clarification token is issued.
8. Rate-limit public token validation and submission endpoints without leaking whether a request exists.
9. Never place service-role credentials or raw token values in logs, analytics, database fields or client bundles.

## Safe migration approach

Do not backfill public links for existing rows blindly. Existing requests should be classified first:

- pending and unsent: issue a fresh token when deliberately sent;
- sent/opened without token evidence: cancel or supersede and issue a replacement;
- submitted: retain as historical evidence and do not invent retroactive token provenance;
- overdue: require an explicit resend decision before issuing a token.

## Acceptance tests

- New issued requests have a non-null hash and bounded expiry; plaintext is never stored.
- An expired, cancelled, superseded or already-consumed token is rejected.
- Reassigning the recipient invalidates the old token and creates auditable replacement history.
- Cross-organisation token use is impossible.
- Invalid-token responses do not disclose request existence or recipient data.
- A submitted request cannot be overwritten with the original token.
- Existing historical requests remain readable internally without being assigned fabricated token history.
