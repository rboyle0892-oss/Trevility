# Readiness timestamp and status integrity

## Finding

Production readiness records currently allow lifecycle timestamps and status values that contradict each other or precede the request itself.

Observed examples on 30 July 2026 include:

- requests created on 29 July with `sent_at`, `opened_at`, or `submitted_at` dates earlier than `created_at`;
- an `opened` request whose due date had already passed, while the record remained `opened` rather than becoming overdue;
- lifecycle state represented by one mutable status even though timestamp evidence indicates a different deadline condition.

This makes the readiness history unsuitable as reliable commercial-control evidence. A dashboard can display a plausible label while the underlying chronology is impossible.

## Product risk

- leadership reporting can understate overdue work;
- users cannot distinguish workflow progress from deadline health;
- response provenance and escalation timing cannot be defended;
- imported or seeded history can appear to have occurred before the request existed;
- later automation may make decisions from stale status text rather than current dates.

## Required operating model

Readiness must separate three concepts:

1. **Progress state** — draft, issued, opened, submitted, clarification required, accepted, cancelled or superseded.
2. **Deadline health** — not due, due soon, overdue or completed on time, derived from dates rather than manually stored as the sole status.
3. **Decision state** — information incomplete, ready for review, approved, rejected or commercial action required.

Lifecycle timestamps must be monotonic and auditable:

```text
created_at <= issued_at <= opened_at <= submitted_at
```

A timestamp may be null when the event has not occurred, but later events must not exist without the earlier required events.

## Safe remediation proposal

Do not rewrite historical production timestamps blindly.

1. Add read-only integrity checks that flag impossible chronology and status/deadline contradictions.
2. Mark affected existing rows as legacy or unverified evidence rather than fabricating corrected history.
3. Add database constraints or guarded server transitions for newly issued requests.
4. Derive overdue health at query time, or maintain it through a controlled scheduled reconciliation, instead of relying on a stale mutable label.
5. Record every state transition as an immutable audit event with actor, timestamp, previous state, new state and reason.
6. Prevent direct client updates to lifecycle timestamps and status.

## Acceptance tests

- a request cannot be opened before it is issued;
- a request cannot be submitted before it is opened, unless a documented exceptional transition records a reason;
- lifecycle event timestamps cannot precede `created_at`;
- a past-due incomplete request is reported as overdue regardless of its progress state;
- a submitted request retains its submission chronology and cannot regress silently;
- cancelled and superseded requests remain visible but generate no new reminders;
- legacy inconsistent rows are visibly flagged and excluded from trustworthy SLA reporting until reviewed;
- tenant and role boundaries are enforced for every transition.
