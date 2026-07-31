# VMO import contract

Trevecta's sellable MVP must ingest the same operational source data used by the VMO Control Workbook rather than forcing users to remodel it first.

## Source datasets

### Budget Lines

Retain every source column in `source_payload` and map recognised fields into typed columns. The first supported aliases are:

- `BudgetCode`, `Budget Code`, `B Code`
- `Vendor`, `Supplier`, `Supplier Name`
- `Product`, `Product / Service`, `Description`
- `FY27_PO_Budget_Value`, `Budget Value`, `Annual Value`
- `Currency`, `Budget currency`
- `Budget Status`, `Status`
- `Updated PO`, with `Latest PO` accepted as a legacy fallback
- `VMO_Notes`, `Comment`
- owner and pillar-lead names/emails
- contract start, end and renewal dates
- SME name and email

### PO Info

Retain and map:

- `PO Number`
- `Order Date`
- `Payee Name`
- `PO Status`
- `Currency`
- `Total Cost`
- `Total Cost (Rep)`
- `GL Description`, `GL Desc`
- `PO Comments`

PO rows must aggregate to one operational PO and support matching to one or more Budget Codes. Unmatched IT POs must remain visible and manually correctable.

### Readiness Requests

Retain and map:

- `BudgetCode`
- `RequestStatus`
- `Is This Still Required?`
- `Information To Proceed`
- `Vendor/Product Satisfaction`
- `Renewal Intent`
- `Criticality`
- SME and owner fields
- created, due, sent, responded, reminded and escalated timestamps where present

## Import behaviour

1. Accept CSV immediately and XLSX once workbook sheet selection is implemented.
2. Preview detected dataset, headers, row count and validation issues before commit.
3. Reject malformed structures without saving partial rows.
4. Preserve source file name, sheet name, row number and raw values.
5. Prevent duplicates using organisation + dataset + stable source key.
6. Treat imports as versioned runs with succeeded, partially succeeded, failed and reversed states.
7. Provide row-level correction, archive and restore after import.
8. Reconcile dashboard metrics and readiness actions after every successful run.

## Decision outputs

The dashboard must produce drillable views for:

- records in the next 30, 60 and 100 days
- expired and missing-end-date records
- missing owner or SME
- no PO, unmatched PO and over-budget positions
- readiness not created, pending, overdue, escalated, completed or cancelled
- supplier, product, pillar, owner, currency and status exposure
- changed values since the previous import

No summary count is complete unless it opens the exact records behind it.
