# Data model

Drafted 19 September 2026. This is the foundation the rest of Sentryfi sits on, so it is written before any schema is created rather than after.

> **Built 19 September 2026.** The core of this is no longer a plan. `backend/src/config/ledger-schema.js` creates it, `backend/src/ledger/` is the code that writes to it, and `npm run ledger:selftest` proves it against the real database. Where this document and that schema disagree, **the schema is what exists** and this document is the intent it was built from.
>
> In now: companies, memberships with roles, the chart of accounts, journal entries and lines, whole-laari money, GST both ways round, the hash chain, gapless numbering, reversal-not-deletion, and per-company isolation.
>
> Not yet: projects, cost codes, suppliers and customers as counterparties, bills and their tax treatment, petty cash, bank import, and foreign currency. The journal lines already carry the columns for projects, cost codes and counterparties, deliberately without foreign keys, so those tables can arrive without rewriting anything already posted.
>
> One thing this document did not anticipate: a Postgres superuser ignores row-level security, so the isolation described here does nothing unless the application drops to a restricted role first. It now does, in `assumeIdentity`.

It is informed by the purchased PERN invoice manager in `reference/purchased/`, but it is not derived from it. That application is a single-tenant, receivables-only invoicing tool with a flat record store and no ledger. Sentryfi needs a correct double-entry ledger, payables, multiple companies, projects, petty cash held by named people, and Maldives GST. Almost none of that maps across, so the useful borrowing is architectural, not structural.

## Six decisions that everything else depends on

**1. Money is an integer count of laari. Never a float.**

One rufiyaa is one hundred laari, so `MVR 4,250.00` is stored as `425000`. Every amount column is `bigint`, named with a `_laari` suffix so no one has to guess. Floats cannot represent decimal fractions exactly, and an accounting system that is out by a laari is out. This is the single decision that is most expensive to change later, and the purchased code gets it wrong: it stores money as JavaScript numbers and rounds with a helper.

Foreign currency carries its own minor units plus the rate used, and the rufiyaa figure is stored alongside, never recomputed on read.

**2. The journal is the record. Everything else is a view of it.**

A bill, a payment, a director's contribution and a cash count are all just things that cause journal entries. The documents are kept because the law requires the supporting document and the owner needs to recognise what he is looking at, but no balance is ever stored on a document. Balances are derived from journal lines. Two places holding the same figure is how they disagree.

**3. Nothing is deleted and nothing is edited after posting.**

A posted entry is immutable. A correction is a new entry that reverses the old one, carrying a reason and a link back. Soft-delete flags on financial rows are a trap, because they leave the question of whether a report includes them. Reversal answers it.

**4. Every entry is hash-chained.**

Each journal entry stores the hash of the previous entry in its company's chain plus a hash of its own content. Tampering with any historic row breaks every hash after it. This is what makes the archive auditable rather than merely backed up.

**5. Every row belongs to exactly one company, and that is enforced in the database.**

`company_id` on every business table, with row-level security policies rather than application-side filtering. The purchased code filters by user in application code, which works until one query forgets. Altura, Steva Hotels and Steva Enterprises are separate companies whose books must never bleed.

**6. A tax treatment is recorded, never inferred.**

The real documents in `docs/real-world-samples/` prove why. State Trading adds GST on top of the item total. Other suppliers quote a GST-inclusive figure. Island Zone and the Maalhos Council are not registered and charge none at all. The document says which it is; the app records what the document said and what it therefore claimed, so a filing can always be traced back.

## Tables

### Identity and tenancy

```
companies
  id                uuid pk
  name              text not null
  registration_no   text                    -- C05262022
  tin               text                    -- 1145053
  gst_number        text                    -- 1145053GST501
  gst_registered    boolean not null default false
  base_currency     char(3) not null default 'MVR'
  created_at        timestamptz not null default now()

users
  id                uuid pk
  full_name         text not null
  email             citext unique
  passkey_only      boolean not null default true
  created_at        timestamptz not null default now()

memberships                                  -- a user's role in one company
  id                uuid pk
  user_id           uuid not null → users
  company_id        uuid not null → companies
  role              role_t not null
  cash_box_id       uuid null → cash_boxes    -- set only for a site staff custodian
  unique (user_id, company_id)

role_t = enum ('owner','director','accountant','office_admin','site_staff','auditor')
```

Roles live on the membership, not the user, because the same person is an owner in one company and a director in another. `cash_box_id` is how a snap-only role becomes a cash holder without inventing a seventh role.

### The ledger

```
accounts                                     -- the chart of accounts
  id                uuid pk
  company_id        uuid not null → companies
  code              text not null            -- '1100'
  name              text not null            -- 'BML · MVR current'
  type              account_t not null
  parent_id         uuid null → accounts
  currency          char(3) not null default 'MVR'
  is_postable       boolean not null default true
  archived_at       timestamptz null
  unique (company_id, code)

account_t = enum ('asset','liability','equity','income','expense')

journal_entries
  id                uuid pk
  company_id        uuid not null → companies
  entry_no          bigint not null          -- per company, gapless
  entry_date        date not null            -- when it happened
  posted_at         timestamptz not null     -- when it was recorded
  posted_by         uuid not null → users
  source            source_t not null
  source_id         uuid null                -- the bill, payment, count…
  narrative         text not null            -- plain words, shown on the phone
  reverses_id       uuid null → journal_entries
  reversal_reason   text null
  prev_hash         bytea null               -- previous entry in this company
  hash              bytea not null
  unique (company_id, entry_no)

source_t = enum ('bill','sales_invoice','payment','money_in','cash_spend',
                 'cash_count','cash_topup','reimbursement','bank_import',
                 'intercompany','adjustment','opening_balance')

journal_lines
  id                uuid pk
  entry_id          uuid not null → journal_entries on delete restrict
  account_id        uuid not null → accounts
  debit_laari       bigint not null default 0 check (debit_laari  >= 0)
  credit_laari      bigint not null default 0 check (credit_laari >= 0)
  project_id        uuid null → projects
  cost_code_id      uuid null → cost_codes
  counterparty_id   uuid null → counterparties
  memo              text null
  check (debit_laari = 0 or credit_laari = 0)
```

Two constraints carry the correctness of the whole system. A line is a debit or a credit, never both, which the check enforces. And every entry must balance, which a deferred constraint trigger enforces at commit:

```sql
create constraint trigger journal_entry_balances
  after insert or update on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_balanced();
-- sum(debit_laari) = sum(credit_laari) for the entry
```

Deferred matters: the lines are inserted one at a time inside a transaction, and the entry is only required to balance when that transaction commits. Every write that produces an entry runs in a transaction. The purchased code wraps nothing in a transaction, which for invoice totals is untidy and for a ledger would be fatal.

`entry_no` is gapless per company, allocated from a counter row inside the same transaction. Gaps in a numbered journal are a question an auditor will ask.

### Documents

```
counterparties                               -- suppliers, customers, directors, staff
  id                uuid pk
  company_id        uuid not null → companies
  name              text not null
  also_known_as     text[] not null default '{}'   -- 'Island Zone Constraction'
  tin               text null
  gst_registered    boolean null             -- null means not yet known
  kind              cp_t[] not null          -- a party can be several at once
  default_cost_code uuid null → cost_codes
  bank_accounts     text[] not null default '{}'
  archived_at       timestamptz null

cp_t = enum ('supplier','customer','director','staff','government','intercompany')
```

`also_known_as` exists because one real invoice spells its own issuer two different ways and the bank statement truncates it to 35 characters. Vendor matching cannot be string equality.

```
bills                                        -- what we owe
  id                uuid pk
  company_id        uuid not null → companies
  counterparty_id   uuid null → counterparties
  bill_no           text null
  issue_date        date null
  due_date          date null
  received_at       timestamptz not null default now()
  currency          char(3) not null default 'MVR'
  fx_rate           numeric(18,8) null
  net_laari         bigint not null
  tax_laari         bigint not null default 0
  gross_laari       bigint not null
  gst_treatment     gst_t not null
  gst_rate_bp       integer null             -- basis points; 800 = 8%
  billed_to_company uuid null → companies    -- when it names another company
  project_id        uuid null → projects
  status            bill_t not null default 'draft'
  confidence        jsonb null               -- per field, from extraction
  entry_id          uuid null → journal_entries
  check (net_laari + tax_laari = gross_laari)

gst_t  = enum ('inclusive','exclusive','none_unregistered','exempt','zero_rated','unknown')
bill_t = enum ('draft','awaiting_review','posted','reversed','discarded')
```

`gst_treatment` is the decision from the real documents made explicit. `none_unregistered` is a fact about the supplier and is what stops input tax being claimed on an Island Zone bill. `unknown` is allowed and blocks posting, because guessing is worse than asking.

`billed_to_company` is how the Maalhos Council invoice gets caught: billed to Steva, paid by Altura. When it differs from `company_id` the app asks rather than posting.

`sales_invoices` mirrors this for receivables, adding `po_reference` for the RDC purchase orders.

```
bill_lines
  id                uuid pk
  bill_id           uuid not null → bills
  description       text not null
  quantity          numeric(18,4) not null default 1
  unit_price_laari  bigint not null          -- STO quotes to three decimals
  net_laari         bigint not null
  tax_laari         bigint not null default 0
  cost_code_id      uuid null → cost_codes
  project_id        uuid null → projects
  position          integer not null
```

Unit price is stored at the precision printed. Rounding happens once, on the line total.

### Projects and cost codes

```
projects
  id, company_id, name, client_company_id, budget_laari,
  started_on, status

cost_codes
  id, company_id, code, name, parent_id, archived_at
  -- materials, labour, subcontractors, equipment, fuel,
  -- transport and boat freight, site overheads
```

Both hang off journal lines, not off documents, so a single bill can split across cost codes and the project report is a ledger query rather than a document query.

### Cash boxes

```
cash_boxes
  id                uuid pk
  company_id        uuid not null → companies
  name              text not null            -- 'Site cash box · Hotel'
  account_id        uuid not null → accounts -- its own ledger account
  custodian_id      uuid null → users
  float_laari       bigint not null          -- what a top-up restores it to
  last_counted_at   timestamptz null

cash_counts
  id, company_id, cash_box_id, counted_at, counted_by,
  counted_laari, expected_laari, difference_laari,
  reason, entry_id
```

Each box is its own ledger account, so custody is a ledger fact rather than a note. A count that does not balance posts its difference to a cash-over-and-short account with the reason attached. `reason` accepts "not sure", because forcing a reason nobody believes corrupts the record.

A spend with no bill is a `cash_spend` entry with no document behind it and `gst_treatment` effectively none: no input tax, ever.

### Reimbursements

Money a person spent themselves posts the expense against a liability account for that person. Paying them back clears it. Both are ordinary entries, so "what we owe our people" is a balance, not a separate system.

### Bank

```
bank_accounts
  id, company_id, account_id, bank, masked_number, currency

bank_statement_imports
  id, company_id, bank_account_id, imported_at, imported_by,
  file_name, row_count, opening_laari, closing_laari,
  column_map jsonb                            -- what each column was read as

bank_lines
  id                uuid pk
  import_id         uuid not null → bank_statement_imports
  posted_on         date not null
  value_date        date null
  reference         text null                -- BLAZ525729582342, the match key
  bank_reference    text null
  counterparty_text text not null
  channel           text null
  amount_laari      bigint not null          -- signed
  balance_laari     bigint null
  txn_type          text not null
  match_state       match_t not null default 'unmatched'
  matched_entry_id  uuid null → journal_entries
  matched_by        uuid null → users
  unique (import_id, reference, posted_on, amount_laari)

match_t = enum ('unmatched','auto_matched','confirmed','left_for_later','ignored')
```

`column_map` is stored per import because the bank's export has no header row and the layout can change. `reference` is the match key, and it is the reason most of a thousand rows match themselves: the bank prints the same reference on the statement and on the transfer receipt staff photograph.

### Attachments and the archive

```
attachments
  id, company_id, kind, storage_key, byte_size, content_type,
  sha256, uploaded_by, uploaded_at,
  archive_path      text                     -- the OneDrive filename
  linked_type, linked_id
```

`sha256` is what duplicate detection compares first, before any fuzzy matching on supplier and amount.

### Tax periods

```
tax_periods
  id, company_id, tax_type, period_start, period_end, due_on,
  status, output_tax_laari, input_tax_laari, net_laari,
  filed_at, filed_by, mira_reference, pack_archive_path

tax_type covers the MIRA revenue types in docs/real-world-samples/mira-revenue-types.md,
not GST alone. Company Annual Fee, Withholding Tax and Remittance Tax all apply.
```

Figures are snapshotted when a period is filed, so a later correction cannot silently rewrite what was submitted.

## What this borrows from the purchased code

Its architecture, not its schema. Specifically worth keeping: the route-per-resource layout, zod validation at the edge, the middleware split, and the shape of its settings table. Its data model is a single-tenant invoicing store and shares almost nothing with the above.

## What must not be borrowed

Money as floats. Absent transactions. Application-side tenancy filtering. A single flat tax percentage on a document. Totals stored on the document and recomputed in four places.

## Open, pending the accountant

The funding treatment for director and Steva money is still unconfirmed, and it decides which accounts those entries hit. The schema does not care, which is the point: it is a chart-of-accounts question, not a structural one. Retention, progress billing and work in progress are deliberately not modelled yet; they need the contract terms first.
