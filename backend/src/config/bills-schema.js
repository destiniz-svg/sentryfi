/**
 * What we owe, and who we owe it to.
 *
 * These are documents, not balances. A bill is kept because the law requires
 * the supporting paper and because a person needs to recognise what they are
 * looking at — but the bill does not hold the money. Posting it writes a
 * balanced journal entry, and every figure anyone reads comes from those
 * lines. A document that also stored its own balance would be a second copy
 * of the truth, and two copies are how they come to disagree.
 *
 * Three decisions here come straight from the real documents in
 * docs/real-world-samples/ rather than from how an invoicing app usually works:
 *
 *   1. A supplier's name is not a key. One real invoice spells its own issuer
 *      two different ways on the same page, and the bank statement truncates
 *      it to 35 characters. So a counterparty carries the other spellings it
 *      is known by, and matching is done against all of them.
 *   2. How GST was quoted is recorded, never inferred. Some suppliers add 8%
 *      on top, some include it in the price shown, and many are not registered
 *      and charge none at all. Guessing inclusive for an exclusive bill
 *      overstates the claim by 8%. `unknown` is a permitted value and blocks
 *      posting, because asking is better than guessing.
 *   3. A bill can name a different company from the one paying it. That is not
 *      an error to reject; it happened with a council invoice billed to one
 *      company in the group and paid by another. It is recorded and asked
 *      about.
 */

const BILLS_SQL = `
-- ----------------------------------------------------------- counterparties

DO $$ BEGIN
  CREATE TYPE cp_t AS ENUM
    ('supplier','customer','director','staff','government','intercompany');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS counterparties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- The other spellings this party is known by: its own misspelling of
  -- itself, and the bank's truncation of it.
  also_known_as   TEXT[] NOT NULL DEFAULT '{}',
  tin             TEXT,
  gst_registered  BOOLEAN,          -- NULL means nobody has established it yet
  kind            cp_t[] NOT NULL DEFAULT '{supplier}',
  bank_accounts   TEXT[] NOT NULL DEFAULT '{}',
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counterparties_company_idx ON counterparties(company_id);

-- Matching a supplier is a fuzzy search over the name and every alias, so both
-- need to be searchable together. trigram search handles the truncations and
-- the misspellings that exact matching cannot.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS counterparties_name_trgm
  ON counterparties USING gin (name gin_trgm_ops);

-- ------------------------------------------------------ projects, cost codes

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  budget_laari  BIGINT,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_company_idx ON projects(company_id);

CREATE TABLE IF NOT EXISTS cost_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  account_id  UUID REFERENCES accounts(id),
  archived_at TIMESTAMPTZ,
  UNIQUE (company_id, code)
);

-- ------------------------------------------------------------------- bills

DO $$ BEGIN
  CREATE TYPE gst_t AS ENUM
    ('inclusive','exclusive','none_unregistered','exempt','zero_rated','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bill_t AS ENUM
    ('draft','awaiting_review','posted','reversed','discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bills (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id   UUID REFERENCES counterparties(id),
  bill_no           TEXT,
  issue_date        DATE,
  due_date          DATE,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by       UUID REFERENCES users(id),
  currency          CHAR(3) NOT NULL DEFAULT 'MVR',
  fx_rate           NUMERIC(18,8),
  net_laari         BIGINT NOT NULL DEFAULT 0,
  tax_laari         BIGINT NOT NULL DEFAULT 0,
  gross_laari       BIGINT NOT NULL DEFAULT 0,
  gst_treatment     gst_t NOT NULL DEFAULT 'unknown',
  gst_rate_bp       INTEGER,          -- basis points, so 800 is 8%
  billed_to_company UUID REFERENCES companies(id),
  project_id        UUID REFERENCES projects(id),
  status            bill_t NOT NULL DEFAULT 'draft',
  confidence        JSONB,            -- per field, from extraction
  entry_id          UUID REFERENCES journal_entries(id),
  voided_at         TIMESTAMPTZ,
  void_reason       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bill_parts_sum CHECK (net_laari + tax_laari = gross_laari),
  CONSTRAINT bill_no_negatives CHECK (net_laari >= 0 AND tax_laari >= 0),
  -- Tax cannot be claimed on a bill from a supplier who charges none.
  CONSTRAINT bill_unregistered_has_no_tax
    CHECK (gst_treatment <> 'none_unregistered' OR tax_laari = 0),
  -- Posting requires knowing how the tax was quoted. Guessing is worse than
  -- asking, so an unknown treatment can be saved but never posted.
  CONSTRAINT bill_posted_knows_its_tax
    CHECK (status <> 'posted' OR gst_treatment <> 'unknown'),
  CONSTRAINT bill_posted_has_entry
    CHECK (status <> 'posted' OR entry_id IS NOT NULL)
);
-- A key the phone generates before it has any signal, so a bill queued on
-- site and sent twice — because the first response was lost, not because the
-- first request failed — is one bill and not two. Without this, a retry after
-- a timeout silently doubles a cost.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS client_ref UUID;
CREATE UNIQUE INDEX IF NOT EXISTS bills_client_ref_once
  ON bills (company_id, client_ref) WHERE client_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS bills_company_status_idx ON bills(company_id, status);
CREATE INDEX IF NOT EXISTS bills_counterparty_idx ON bills(company_id, counterparty_id);

-- The duplicate guard. The same supplier billing the same number twice is the
-- most expensive ordinary mistake available: the bill is paid twice and the
-- input tax claimed twice. A partial unique index lets drafts and discarded
-- bills repeat while making a posted pair impossible.
CREATE UNIQUE INDEX IF NOT EXISTS bills_no_duplicate_posted
  ON bills (company_id, counterparty_id, bill_no)
  WHERE bill_no IS NOT NULL
    AND counterparty_id IS NOT NULL
    AND status = 'posted'
    AND voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bill_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id           UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  quantity          NUMERIC(18,4) NOT NULL DEFAULT 1,
  -- Held at the precision printed: one real supplier quotes to three decimals.
  unit_price_laari  BIGINT NOT NULL DEFAULT 0,
  net_laari         BIGINT NOT NULL DEFAULT 0,
  tax_laari         BIGINT NOT NULL DEFAULT 0,
  cost_code_id      UUID REFERENCES cost_codes(id),
  project_id        UUID REFERENCES projects(id),
  position          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bill_lines_bill_idx ON bill_lines(bill_id);

-- --------------------------------------------------------------- the paper

CREATE TABLE IF NOT EXISTS attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bill_id       UUID REFERENCES bills(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  byte_size     BIGINT NOT NULL,
  -- The bytes are addressed by their own hash, so the same photograph filed
  -- twice is stored once and an altered file is a different file.
  sha256        BYTEA NOT NULL,
  storage_key   TEXT NOT NULL,
  uploaded_by   UUID REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_bill_idx ON attachments(bill_id);

-- ------------------------------------------- one company cannot see another

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'counterparties','projects','cost_codes','bills','bill_lines','attachments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO sentryfi_app', t);
  END LOOP;
END
$rls$;
`;

module.exports = { BILLS_SQL };
