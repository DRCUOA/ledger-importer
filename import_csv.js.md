## `importCsv` — CSV importer explainer & commentary

This document is a guided walkthrough of the CSV importer implementation, with links to the exact sections of code it references.

- **Implementation**: [`src/import_csv.js`](src/import_csv.js)

---

## Table of contents

- [Concept: canonical transaction contract](#concept-canonical-transaction-contract)
- [Step 1: read file + split into lines](#step-1-read-file--split-into-lines)
- [Step 2: header normalisation + alias mapping](#step-2-header-normalisation--alias-mapping)
- [Step 3: required columns check](#step-3-required-columns-check)
- [Step 4: record source name + content hash](#step-4-record-source-name--content-hash)
- [Step 5: prepare SQL statements](#step-5-prepare-sql-statements)
- [Step 6: transaction wrapper (atomic import)](#step-6-transaction-wrapper-atomic-import)
- [Step 7: row loop + row-level validation](#step-7-row-loop--row-level-validation)
- [Step 8: amount normalisation (amount vs debit/credit)](#step-8-amount-normalisation-amount-vs-debitcredit)
- [Step 9: insert transactions](#step-9-insert-transactions)
- [Step 10: parse date into canonical form](#step-10-parse-date-into-canonical-form)
- [Known limitations (CSV parsing)](#known-limitations-csv-parsing)

---

## Concept: canonical transaction contract

**Code**: [`src/import_csv.js#L13-L18`](src/import_csv.js#L13-L18)

The importer normalises messy CSV rows into a canonical transaction shape:

- **`txn_date`**: ISO `YYYY-MM-DD` (canonical time anchor)
- **`description`**: non-empty string (human audit anchor)
- **`raw_amount`**: signed number (original numeric meaning preserved)
- **`debit`/`credit`**: exactly one positive side (ledger-friendly representation)

If a row can’t satisfy this contract, the importer fails loudly.

---

## Step 1: read file + split into lines

**Code**: [`src/import_csv.js#L19-L23`](src/import_csv.js#L19-L23)

The importer reads the whole file as UTF-8, splits on newline, and drops empty lines. This makes the import deterministic and makes hashing (for idempotency) straightforward.

---

## Step 2: header normalisation + alias mapping

**Code**:

- Alias list: [`src/import_csv.js#L5-L11`](src/import_csv.js#L5-L11)
- Header normalisation: [`src/import_csv.js#L22`](src/import_csv.js#L22)
- `resolveColumn`: [`src/import_csv.js#L24-L28`](src/import_csv.js#L24-L28)
- Column indices: [`src/import_csv.js#L30-L34`](src/import_csv.js#L30-L34)

CSV exports often rename the same concept (e.g., `memo` vs `description` vs `details`). The importer:

- lowercases headers (`trim().toLowerCase()`), then
- resolves each concept to a **column index** using an alias list.

**Why return an index?** Rows are positional arrays (`cols[...]`), so the index is the most direct pointer into each row.

---

## Step 3: required columns check

**Code**: [`src/import_csv.js#L36-L38`](src/import_csv.js#L36-L38)

`date` and `description` are treated as hard requirements because:

- **Without a date**: the row can’t be reconciled or audited meaningfully.
- **Without a description**: the row can’t be explained to a human.

`amount` is allowed to be missing as a *single column*, because the value can be represented as either:

- a signed amount column, or
- separate debit/credit columns (see Step 8).

---

## Step 4: record source name + content hash

**Code**:

- Basename-only `source_name`: [`src/import_csv.js#L40`](src/import_csv.js#L40)
- Content hash: [`src/import_csv.js#L42-L45`](src/import_csv.js#L42-L45)

Two “identities” are stored on purpose:

- **`source_name` (basename only)**: human audit context that’s portable and doesn’t leak machine paths.
- **`source_hash` (sha256 of file contents)**: the actual idempotency key (identity derived from substance, not circumstance).

---

## Step 5: prepare SQL statements

**Code**: [`src/import_csv.js#L47-L63`](src/import_csv.js#L47-L63)

Statements are prepared once so:

- the SQL shape stays fixed (reduces “SQL drift” bugs),
- the loop stays mechanically simple (only values vary),
- repeated parsing/planning work is avoided.

---

## Step 6: transaction wrapper (atomic import)

**Code**: [`src/import_csv.js#L65-L113`](src/import_csv.js#L65-L113)

All writes happen inside a DB transaction so the import is atomic:

- If any row fails, the DB doesn’t end up with a partial import.
- A try/catch without a DB transaction can catch errors, but it can’t rollback already-written rows.

Inside the transaction we insert a new `imports` record and capture the generated `importId`.

---

## Step 7: row loop + row-level validation

**Code**:

- Loop + split row: [`src/import_csv.js#L69-L71`](src/import_csv.js#L69-L71)
- Description check: [`src/import_csv.js#L72-L75`](src/import_csv.js#L72-L75)

Each row is validated at the trust boundary:

- **Description must exist** (no silent “best-effort” imports).
- Errors include the row number to make fixes actionable.

---

## Step 8: amount normalisation (amount vs debit/credit)

**Code**: [`src/import_csv.js#L77-L97`](src/import_csv.js#L77-L97)

Two supported representations:

### A) A single signed `amount` column

**Code**: [`src/import_csv.js#L81-L88`](src/import_csv.js#L81-L88)

- Negative → debit
- Positive → credit

### B) Separate `debit` and `credit` columns

**Code**: [`src/import_csv.js#L88-L97`](src/import_csv.js#L88-L97)

Validation enforces:

- not both positive
- not both zero

Then `rawAmount = credit - debit` to preserve a signed interpretation.

---

## Step 9: insert transactions

**Code**: [`src/import_csv.js#L99-L108`](src/import_csv.js#L99-L108)

Each imported transaction stores:

- canonical values (`txn_date`, `debit`, `credit`, `raw_amount`)
- raw input for auditing (`raw_description`)
- relational context (`import_id`, `account_id`)

---

## Step 10: parse date into canonical form

**Code**: [`src/import_csv.js#L115-L121`](src/import_csv.js#L115-L121)

Dates are converted to ISO `YYYY-MM-DD`. Invalid dates fail fast with row context.

---

## Known limitations (CSV parsing)

**Code**:

- Row splitting: [`src/import_csv.js#L21-L22`](src/import_csv.js#L21-L22)
- Column splitting: [`src/import_csv.js#L70`](src/import_csv.js#L70)

This importer currently uses naive string splitting (`split('\n')`, `split(',')`), which does **not** correctly parse:

- quoted fields containing commas
- newlines inside quoted fields

If those cases matter, the importer should switch to a real CSV parser library; the hashing/idempotency and validation structure can stay the same.

