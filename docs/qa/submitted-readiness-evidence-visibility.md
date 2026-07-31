# QA finding: submitted readiness evidence is not visible to decision-makers

## Finding

`readiness_requests.response` is retrieved by the commercial-record API and included in the client-side `ReadinessRequest` type, but the record page renders only recipient, lifecycle status and dates. It does not display the submitted answers.

Production currently contains a submitted readiness request with structured answers for:

- `criticality`
- `renewal_intent`
- `information_to_proceed`

The evidence exists in Supabase but cannot be reviewed from the commercial record screen.

## Product impact

This breaks the central decision-support journey:

1. an SME supplies information;
2. Trevecta records the response;
3. the VMO user opens the commercial record;
4. the product hides the information needed to decide what happens next.

A request can therefore appear successfully submitted while creating a dead-end state. Users may have to query the database or contact the SME again, and leadership cannot drill from readiness counts to the underlying evidence.

## Safe corrective slice

This can be corrected without a schema change:

- Render submitted response fields on the linked commercial-record detail page.
- Use readable labels rather than raw JSON keys.
- Show an explicit `No answers recorded` state when a submitted row has an empty response object.
- Distinguish unanswered, not applicable and intentionally blank values.
- Show submission time and respondent alongside the answers.
- Provide a clear next action after review: accept as decision-ready, request clarification, or assign commercial engagement.
- Do not expose internal tokens, metadata or fields that are not intended for the reviewer.

## Required follow-on operating model

The full SME workflow should replace generic JSON rendering with a versioned questionnaire and decision brief. Until then, the existing answers must at least be visible and usable.

## Acceptance tests

1. A submitted request with answers displays every approved response field on the linked record.
2. An empty submitted response shows a clear incomplete-evidence warning.
3. Pending, sent and opened requests do not falsely present a completed answer set.
4. A viewer can read approved response evidence but cannot mutate it.
5. Cross-organisation access remains blocked by existing tenant policies.
6. No token or sensitive internal metadata is rendered.
