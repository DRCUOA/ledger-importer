# SQLite Schema Design — ledger-importer

## Design Principles

- Raw data is preserved
- Derived data is explicit
- Idempotency is enforced by the database
- Reconciliation is read-only
- Failure is loud

This schema encodes those principles.

## Table Overview

You will have three tables:

- imports — tracks file-level ingestion
- transactions — canonical ledger entries
- accounts — minimal anchor for ledger balance

No more. No less.

## 1. imports — Evidence Ledger

This table answers:
"What files have I already trusted?"

```sql
CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,              -- csv, ofx
  source_name TEXT NOT NULL,              -- filename or label
  source_hash TEXT NOT NULL,              -- content hash for idempotency
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (source_hash)
);
```

### Why this exists

- Prevents duplicate imports
- Preserves audit trail
- Decouples files from transactions

### Key concept

Idempotency lives here.

If the same file is imported twice, SQLite says no, not your code.

## 2. accounts — Minimal Ledger Anchor

This is intentionally boring.

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',

  UNIQUE (name, currency)
);
```

### Why this exists

- Ledger math requires a balance anchor
- Even single-account systems need an identity
- Enables future extension without refactor

### What this does not do

- No account hierarchy
- No chart of accounts
- No balances stored (derived, not persisted)

## 3. transactions — Canonical Truth

This is the heart of the system.

```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,

  txn_date TEXT NOT NULL,
  description TEXT NOT NULL,

  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,

  raw_amount REAL NOT NULL,               -- original signed value
  raw_description TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id) REFERENCES imports(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),

  CHECK (debit >= 0),
  CHECK (credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (debit > 0 OR credit > 0)
);
```

### Why this shape matters

- Debit / Credit as roles
- No signed ambiguity
- Every row declares how it affects balance

### Raw vs Canonical

- raw_amount, raw_description = evidence
- debit, credit, description = interpretation

This allows:

- audits
- reprocessing
- future rule changes

Without re-importing.

### Critical Constraints (Read This Twice)

These constraints enforce professional behaviour:

```sql
CHECK (NOT (debit > 0 AND credit > 0))
CHECK (debit > 0 OR credit > 0)
```

This guarantees:

- exactly one side is populated
- silent balancing errors are impossible

If this fails, the import must fail.

## Reconciliation Is NOT a Table

You do not store reconciliation results.

Reconciliation is a query:

```sql
SELECT
  SUM(debit)  AS total_debits,
  SUM(credit) AS total_credits,
  SUM(debit) - SUM(credit) AS balance_delta
FROM transactions
WHERE account_id = ?;
```

### Why:

- Stored balances rot
- Derived balances expose truth
- Queries don't lie

## What This Schema Intentionally Avoids

- Categories
- Tags
- Multi-currency handling
- Transfers
- Double-entry enforcement across accounts
- Journals

Those are later concerns.
This schema is complete for its stated scope.

## Mental Model You Should Lock In

- imports = what you trusted
- transactions = what you believe
- reconciliation = what doesn't match

If you keep that straight, the code stays simple.
