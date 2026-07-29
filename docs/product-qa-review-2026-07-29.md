# Trevecta product QA review — 2026-07-29

## Highest-priority findings

1. Commercial register rows are not actionable. A detail page exists, but list rows are not links and successful single-row imports do not navigate to the created record.
2. Duplicate imports are currently possible. Production contains three copies of the same example contract in one organisation.
3. Imported commercial records have no edit, archive, restore, or import rollback workflow.
4. Dashboard metrics are decorative counts rather than drill-down controls.
5. The CSV flow commits immediately without a preview, accepted/rejected-row summary, or duplicate warning.
6. Readiness requests exist in the schema but no scheduled sender, secure public response form, delivery log, or operational work queue is live.
7. The downloaded template includes an example row, which has already been imported repeatedly and can create misleading BAU data.

## Recommended safe implementation order

1. Make commercial register rows open the existing detail page and route successful single-row imports to it.
2. Add import batches and deterministic duplicate detection before insert.
3. Add soft archive fields, archive/restore actions, confirmation, and audit events.
4. Add import preview with row-level errors and explicit commit.
5. Convert dashboard metrics into filtered work queues.
6. Build readiness request generation, secure token response page, and email delivery as a separately reviewed production change.

No production records were deleted during this review.