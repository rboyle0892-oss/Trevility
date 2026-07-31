# Import row remediation and partial acceptance

## Finding

The commercial import validates the whole submitted payload and stops at the first invalid row. The UI previews only the first five rows and provides no way to correct, exclude or download rejected rows before retrying.

This is safe from a data-integrity perspective, but it is not a complete BAU import workflow. A large workbook containing one malformed date, invalid email, negative value or duplicate reference becomes an all-or-nothing dead end. The user receives a row number, but cannot navigate to that row in Trevecta or resolve it without returning to the source workbook and restarting the review.

Database insert failures can also return a general import error without mapping the failure back to the source row, because the batch is posted as one payload.

## Commercial impact

- A single poor-quality row blocks hundreds of otherwise usable records.
- Users cannot distinguish accepted, rejected and warning-only rows.
- There is no retained import attempt, rejection file or audit evidence.
- Rework happens outside Trevecta and is invisible to leadership reporting.
- Repeated retries increase the risk of duplicate or inconsistent source files.

## Required workflow

1. Validate every row before confirmation.
2. Show a row-level results grid with valid, warning and blocked states.
3. Allow users to open and correct a staged row without changing the source file.
4. Allow explicit exclusion of rejected rows, with a reason.
5. Provide clear choices:
   - import all valid rows and retain rejected rows for remediation;
   - cancel the entire import;
   - download rejected rows with error messages.
6. Persist an import run containing file name, checksum, actor, timestamps, source row, original values, mapped values, outcome and errors.
7. Prevent the same file/checksum from being imported accidentally without an explicit reviewed override.
8. Re-run validation after any staged correction.
9. Generate readiness only for records successfully committed.
10. Show a post-import outcome that links directly to imported records, rejected rows and generated actions.

## Safety model

Partial acceptance must be explicit rather than automatic. No rejected row should be silently dropped. The confirmation should state the number of records to be committed, excluded and retained for remediation.

A production schema change is required for durable import runs and staged rows, so this should be implemented through a reviewed migration and preview deployment. The current production data should not be rewritten.

## Acceptance tests

- One invalid row does not obscure the status of the other rows.
- The invalid source row and field are identified exactly.
- A user can correct a staged value and revalidate it.
- A user can exclude a row only with an explicit confirmation and retained reason.
- Importing valid rows does not import rejected rows.
- Retrying the same file is detected by checksum.
- The completion screen drills into imported records, rejected rows and readiness outcomes.
- Tenant and role boundaries apply to import runs and staged data.
