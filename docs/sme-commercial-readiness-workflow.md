# SME commercial information request workflow

## Purpose

A readiness request is not a generic status check. It is a structured, no-login information request sent to the accountable SME so the VMO can obtain the evidence needed to progress a renewal, replacement, commercial negotiation or closure decision.

## Trigger

Create a request when a commercial record enters the configured review window and has:

- an active commercial record;
- a valid SME email;
- an end or decision date;
- no open request for the same record and recipient.

The record detail action must be record-scoped. Organisation-wide reconciliation must be a separate action with explicit scope.

## SME questionnaire

The secure form should pre-populate supplier, product/service, current end date and known annual value, then ask:

1. **What needs to happen?**
   - Renew
   - Replace / re-tender
   - Extend temporarily
   - Reduce scope or licences
   - Exit / cease service
   - Unsure — VMO support required

2. **Business need and criticality**
   - Is the service still required?
   - What business process does it support?
   - What is the impact if it stops?
   - Criticality: critical / high / medium / low

3. **Scope and demand**
   - Current users, licences or consumption
   - Required users, licences or consumption for the next term
   - Scope changes or new requirements
   - Known unused licences or reduction opportunities

4. **Commercial position**
   - Latest quote available: yes / no
   - Quote value, currency and term
   - One-off costs
   - Current PO or budget code, if known
   - Expected budget available: yes / no / unknown
   - Target completion or decision date

5. **Supplier and market position**
   - Is the incumbent preferred?
   - Are alternatives available?
   - Is procurement or a competitive exercise required?
   - Known negotiation leverage, issues or service concerns

6. **Risk and dependencies**
   - Data, security, legal, regulatory or architecture review required
   - Implementation or migration lead time
   - Dependencies and key stakeholders
   - Consequence of delay

7. **Decision and ownership**
   - Recommended next action
   - Decision maker
   - Operational owner
   - Additional stakeholders
   - Support required from VMO, Procurement, Legal, Finance or Security

8. **Evidence upload or links**
   - Quote
   - Statement of work
   - Usage report
   - Business case
   - Existing contract or order form
   - Relevant links and comments

## Form lifecycle

- Draft saved automatically
- Submitted explicitly with confirmation
- Submission receipt shown to SME
- VMO sees completeness score and missing evidence
- VMO can return the request for clarification
- SME can resubmit through the same secure link until accepted or expired
- Reminder and escalation are separate from progress state
- Cancellation requires a reason
- Expired links cannot access or mutate data

## Status model

Keep these concepts separate:

### Progress

- pending
- sent
- opened
- draft
- submitted
- clarification_requested
- resubmitted
- accepted
- cancelled

### Deadline health

- not_due
- due
- overdue
- completed_on_time
- completed_late

### Decision state

- information_required
- ready_for_review
- commercial_engagement_required
- procurement_required
- approval_required
- approved
- rejected
- closed

## VMO output

A submitted request should create a decision brief, not just a JSON response:

- requested outcome;
- current and proposed scope;
- current and quoted commercials;
- budget and PO position;
- risks and dependencies;
- missing evidence;
- recommended action;
- accountable owner;
- decision required by date.

The dashboard should drill from the 100-day count into these states and make the next action explicit for every record.

## Security requirements

- Store only a hash of the access token.
- Apply expiry and single-record scope.
- Rate-limit token attempts and submissions.
- Do not expose organisation or other record data through the token route.
- Record opened, draft, submitted, returned and accepted events.
- Never send email automatically from a migration or test run.
