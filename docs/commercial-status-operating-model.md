# Commercial status operating model

## Finding

`commercial_records.status` currently mixes imported source labels with live operational conditions.

Current production examples include:

- Active
- Expired - decision required
- In readiness window
- Missing end date
- Owner required
- Readiness due
- Renewal review
- SME required

Several of these are not stable record lifecycle states. They are derived exceptions or work states that can become stale when an owner, SME, end date or readiness request changes. A corrected record can therefore retain an obsolete status string while the dashboard derives a different live condition.

## Product risk

- users can see contradictory states between the register, action queue and readiness history;
- filters and leadership counts cannot rely on a consistent taxonomy;
- imported labels can silently override the meaning of live operational controls;
- free-text editing permits spelling, casing and terminology variants;
- historical source evidence is lost if the field is overwritten to match current operations.

## Proposed model

Keep three concepts separate.

### 1. Source status

The exact value supplied by the source workbook or upstream system. Preserve it as evidence and label it clearly as `Source status`.

### 2. Record lifecycle

A controlled value representing whether the commercial record itself is usable:

- active
- archived
- closed
- superseded

Archive and restore remain separate governed actions with reason and audit history.

### 3. Operational state

Derived from current evidence rather than stored as a free-text record label. Examples:

- end date missing
- accountable owner missing
- SME contact missing
- expired and decision required
- within 100-day window
- SME information request not created
- SME response overdue
- clarification required
- commercial engagement required
- approval required
- ready to close

A record may have multiple operational states at once. These should create persistent exceptions/actions where accountability is required rather than being compressed into one status string.

## Safe implementation sequence

1. Rename the existing UI label from `Status` to `Source status`; do not rewrite existing data.
2. Stop using the source status field for BAU counts, filters or decision logic.
3. Add controlled `record_lifecycle` only after reviewing existing integrations and archived-record semantics.
4. calculate operational states from end date, owner, SME, readiness, actions and evidence;
5. persist actionable exceptions with owner, due date, escalation and resolution history;
6. retain imported source status and row provenance unchanged;
7. add tests proving that correcting an owner, SME or end date removes the derived exception without requiring a manual status edit.

## Acceptance criteria

- the register never presents an imported label as the authoritative live workflow state;
- correcting underlying evidence immediately updates operational state;
- status terminology is consistent across dashboard, detail page, filters and leadership reports;
- one record can surface multiple concurrent exceptions;
- source evidence remains visible and auditable;
- no production status values are destructively rewritten during rollout.
