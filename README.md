# ledger-importer

A small CLI utility for importing messy financial files into SQLite and generating auditable debit–credit ledgers with reconciliation summaries.

---

## Docs

- **`importCsv` — CSV importer explainer & commentary**: [`import_csv.js.md`](import_csv.js.md)

---

## Introduction (problem / why)

- Financial data arrives in inconsistent formats (`CSV`, `OFX`, spreadsheets, exports, PDFs converted to `CSV`).
- Manual cleaning and reconciliation is error-prone and non-repeatable.
- Spreadsheets hide audit history and make re-imports unsafe.

This tool provides a repeatable, local, idempotent way to turn messy inputs into a clean ledger.

---

## What this tool does

1. Imports financial files into a local `SQLite` database
2. Normalises transactions into a debit–credit ledger
3. Prevents duplicate imports
4. Outputs reconciliation summaries (totals and balance deltas)

## What this tool does not do

1. No cloud sync
2. No authentication or user management
3. No budgeting, categorisation, or analytics
4. No UI beyond basic CLI output

---

## Assumptions

- Single user
- Local filesystem
- Data correctness is prioritised over convenience
- Explicit failures are preferred over silent fixes

---

## Status

Early prototype. Functionality and schema are intentionally minimal.

---


## Conceptual foundations

### 1. Data is not “information” — it’s evidence

Mental model shift (critical):

- `CSV` / `OFX` files are claims.
- Your database is evidence.
- Your ledger is an argument you can defend.

This tool is not about insight. It is about trustworthiness.

Everything else flows from this.

### 2. Normalisation (not the academic kind)

You are not doing 3NF theory for its own sake.

You are doing operational normalisation: turning inconsistent representations of the same real-world thing into one consistent structure.

Examples:

- Dates in different formats → one canonical date.
- Amounts with sign ambiguity → explicit debit / credit.
- Descriptions with noise → stored raw, interpreted later (or never).

Key principle:

- Raw input is preserved. Interpretation is layered on top.
- That’s why you keep imports separate from transactions.

### 3. Idempotency (the professional line)

This is one of the most important engineering concepts in this tool.

**Definition**: Running the same operation twice produces the same result as running it once.

Why this matters here:

- Users will re-import files.
- Files will be corrected and reprocessed.
- Trust collapses if totals change silently.

Mechanically, this means:

- Every imported row must have a stable identity.
- That identity must be enforceable (hash, natural key, or both).
- The database, not the CLI, is the final authority.

This is why `SQLite` constraints matter more than clever code.

### 4. Ledger thinking (debit / credit is not about signs)

Most people get this wrong:

- Debit / Credit ≠ Positive / Negative.
- Debit and credit are roles, not math signs.

What matters:

- Every transaction has balance impact.
- That impact must be explicit and explainable.
- Summation must be reproducible.

Your tool does not need double-entry accounts yet — but it must respect ledger symmetry:

- If the numbers don’t balance, the tool must say so.
- Silence is failure.

### 5. Reconciliation is a comparison, not a calculation

This is subtle but important.

You are not “calculating correctness”. You are comparing two claims:

- What the source claims.
- What the ledger currently says.

Reconciliation output answers:

- What was expected?
- What was observed?
- What is the delta?

That’s why reconciliation is a report, not a mutation.

### 6. Defensive programming (data edition)

You are building a tool that assumes:

- Inputs are messy.
- Formats lie.
- Users make mistakes.

So your default posture is: **reject loudly, never guess quietly**.

This means:

- Validate early.
- Fail explicitly.
- Log context.
- Preserve original data for audit.

### 7. SQLite as a boundary, not just storage

`SQLite` here is:

- A consistency engine.
- A constraint enforcer.
- A persistence boundary.

Key idea:

If correctness depends on your CLI logic alone, it’s fragile.

Constraints belong in the database because:

- They are unavoidable.
- They survive refactors.
- They encode intent.

### 8. Tests are evidence, not safety nets

You are not doing TDD ideology. You are doing proof of behaviour.

A test in this project answers:

> “What failure scared me enough to write this down?”

One failing-then-passing test is enough for credibility.

### The unifying mental model

This tool turns untrusted files into trusted records by enforcing constraints, preserving raw evidence, and making imbalance visible