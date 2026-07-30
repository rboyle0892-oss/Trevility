# Readiness recipient reconciliation gap

## Finding

A readiness request stores its own `recipient_name` and `recipient_email`, while the linked commercial record separately stores the current SME name and email.

The commercial-record edit path can change the SME fields, but it does not reconcile an existing pending, sent or opened readiness request. This creates a split source of truth:

- the commercial record can show the new SME;
- the outstanding request can still target the previous SME;
- the record page can display both without explaining the discrepancy;
- a later email or reminder workflow could contact the wrong person;
- leadership reporting can attribute overdue work to an obsolete recipient.

Current production data does not contain a mismatch, but the lifecycle permits one as soon as an SME is corrected after a request has been generated.

## Required behaviour

When SME details are changed on a commercial record, Trevecta must evaluate every linked non-terminal readiness request.

### Pending and unsent requests

The user should be offered a safe, explicit choice:

1. update the request recipient to the new SME; or
2. retain the existing recipient with a recorded reason.

The default should be to update an unsent request, because no external communication has yet occurred.

### Sent or opened requests

Do not silently rewrite the recipient. Present a controlled reassignment workflow that:

- shows the old and new recipient;
- asks whether the old request should be cancelled;
- creates or reissues a replacement request for the new SME;
- preserves the original request and delivery history;
- records who reassigned it, when and why;
- prevents both requests from remaining active accidentally.

### Submitted requests

Never mutate the historical respondent. Preserve the submitted request as evidence. A new clarification or follow-up request may target the current SME, but it must be linked as a separate lifecycle event.

## UI requirements

The commercial record should visibly flag any mismatch between the current SME and an active request recipient.

Example:

> Active request is assigned to previous SME jane@example.com. Current record SME is alex@example.com. Reassign request.

The warning must link directly to the reassignment action rather than leaving the user to infer the correction path.

## Data and audit requirements

- retain the original recipient on historical requests;
- add explicit cancellation/replacement linkage where a request is superseded;
- write an immutable audit event containing old recipient, new recipient, actor, timestamp and reason;
- prevent more than one active request for the same commercial record and workflow stage unless explicitly allowed;
- ensure tenant-scoped permission checks apply to reassignment.

## Acceptance tests

1. Changing the SME before a request is sent updates or explicitly retains the pending recipient.
2. Changing the SME after send does not silently mutate delivery history.
3. Reassignment cancels or supersedes the old active request and creates the replacement safely.
4. Submitted evidence retains the original respondent identity.
5. A mismatch warning appears whenever the current SME differs from a non-terminal request recipient.
6. Cross-organisation reassignment is rejected.
7. Viewer access cannot alter recipients.
8. Duplicate active requests are prevented.
