# Import-run provenance and reconciliation

## Finding

Trevecta currently writes imported rows directly to `commercial_records` and stores only `source_file_name`, `source_row_number`, and `raw_data` on each record.

The existing `imports` table is not populated by the commercial import route, and `commercial_records` has no `import_id` relationship. Production currently contains commercial records with source filenames and row numbers, but zero import-run rows.

This prevents Trevecta from treating an import as an auditable operational event.

## Product impact

Without a first-class import run, Trevecta cannot reliably answer:

- which exact upload created or changed a record;
- who uploaded it and when;
- whether the same file was uploaded twice;
- which rows succeeded, failed, were excluded, or were corrected;
- what changed compared with the previous source;
- whether a failed readiness-generation step belongs to a specific import;
- how to reverse or reconcile a bad upload safely;
- how dashboard figures changed after a particular import.

Source filename and row number are insufficient because filenames can be reused, renamed, or contain multiple versions of different content.

## Required reviewed design

Do not retrofit production rows blindly. Introduce an import-run boundary with:

1. One `imports` row created before persistence begins.
2. A cryptographic file checksum and dataset/sheet identity for duplicate-file detection.
3. Explicit lifecycle states such as `previewed`, `processing`, `completed`, `completed_with_warnings`, `failed`, and `reversed`.
4. `commercial_records.import_id` or a separate append-only source-link table.
5. Preserved raw source rows, source sheet, physical row number, mapped values, validation results, and acceptance state.
6. Counts that reconcile exactly: total rows = accepted + rejected + excluded.
7. A post-import summary that drills into created, updated, skipped, rejected, and readiness-generation outcomes.
8. Safe reversal through archive/supersession of rows created by the run, never hard deletion.
9. Immutable audit events for import confirmation, completion, failure, retry, and reversal.
10. Tenant-safe foreign keys and RLS across import runs, staged rows, and resulting records.

## Historical data

Existing production rows should remain usable. A migration may create legacy provenance records grouped conservatively by organisation and source filename, but must label them as reconstructed provenance and must not imply a verified checksum or exact upload event.

## Acceptance tests

1. Uploading the same file twice is detected before commit using checksum and dataset identity.
2. Every accepted record opens its import run and exact source row.
3. Every import run reconciles its row counts exactly.
4. A partially successful import shows rejected rows and readiness-generation warnings separately.
5. Reversing an import archives or supersedes only records attributable to that run and records an audit reason.
6. A changed file with the same filename is treated as a new version, not silently deduplicated by name.
7. Cross-organisation import/record links are rejected by the database.
8. Dashboard change reporting can explain which import caused each material movement.
