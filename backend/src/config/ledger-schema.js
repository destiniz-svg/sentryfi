/**
 * The ledger.
 *
 * Everything the business does ends up here as a balanced entry. The documents
 * above it — bills, invoices, payments, cash counts — are kept because the law
 * requires the paper and because people need to recognise what they are looking
 * at, but no balance is ever stored on a document. Balances are derived from
 * these lines. Two places holding the same figure is how they come to disagree.
 *
 * Six rules are enforced here rather than in application code, because code
 * forgets and a constraint does not:
 *
 *   1. Money is a whole number of laari. One rufiyaa is 100 laari, so
 *      MVR 4,250.00 is 425000. Floating point cannot hold decimal fractions
 *      exactly, and an accounting system that is out by a laari is out.
 *   2. A line is a debit or a credit, never both.
 *   3. Every entry balances, checked when the transaction commits rather than
 *      line by line, because lines arrive one at a time.
 *   4. Entry numbers have no gaps. A gap in a numbered journal is the first
 *      thing an auditor asks about.
 *   5. Each entry carries the hash of the one before it in its company's
 *      chain, so altering history shows.
 *   6. A company's rows are invisible to another company, enforced by the
 *      database, not by every query remembering to filter.
 */

const LEDGER_SQL = `
-- ---------------------------------------------------------------- companies

CREATE TABLE IF NOT EXISTS companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  registration_no  TEXT,
  tin              TEXT,
  gst_number       TEXT,
  gst_registered   BOOLEAN NOT NULL DEFAULT false,
  base_currency    CHAR(3) NOT NULL DEFAULT 'MVR',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE role_t AS ENUM (
    'administrator','accountant','manager','approver','viewer','auditor',
    'site_staff','cash_holder','procurement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role         role_t NOT NULL,
  spend_limit_laari BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_company_idx ON memberships(company_id);

-- ------------------------------------------------------- chart of accounts

DO $$ BEGIN
  CREATE TYPE account_t AS ENUM ('asset','liability','equity','income','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  type         account_t NOT NULL,
  parent_id    UUID REFERENCES accounts(id),
  currency     CHAR(3) NOT NULL DEFAULT 'MVR',
  is_postable  BOOLEAN NOT NULL DEFAULT true,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ------------------------------------------------------------- the journal

DO $$ BEGIN
  CREATE TYPE source_t AS ENUM (
    'bill','sales_invoice','payment','money_in','cash_spend','cash_count',
    'cash_topup','reimbursement','bank_import','intercompany','adjustment',
    'opening_balance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Gapless numbering needs a row to lock, one per company.
CREATE TABLE IF NOT EXISTS journal_counters (
  company_id   UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_no      BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entry_no        BIGINT NOT NULL,
  entry_date      DATE NOT NULL,
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source          source_t NOT NULL,
  source_id       UUID,
  narrative       TEXT NOT NULL,
  reverses_id     UUID REFERENCES journal_entries(id),
  reversal_reason TEXT,
  prev_hash       BYTEA,
  hash            BYTEA NOT NULL,
  UNIQUE (company_id, entry_no)
);
CREATE INDEX IF NOT EXISTS journal_entries_company_date_idx
  ON journal_entries(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_source_idx
  ON journal_entries(company_id, source, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit_laari     BIGINT NOT NULL DEFAULT 0 CHECK (debit_laari  >= 0),
  credit_laari    BIGINT NOT NULL DEFAULT 0 CHECK (credit_laari >= 0),
  project_id      UUID,
  cost_code_id    UUID,
  counterparty_id UUID,
  memo            TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT one_side_only CHECK (debit_laari = 0 OR credit_laari = 0),
  CONSTRAINT has_value     CHECK (debit_laari > 0 OR credit_laari > 0)
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines(company_id, account_id);

-- Every entry must balance. Checked at COMMIT, not per row, because the lines
-- of one entry are inserted one at a time inside a single transaction.
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS trigger AS $fn$
DECLARE d BIGINT; c BIGINT;
BEGIN
  SELECT COALESCE(SUM(debit_laari), 0), COALESCE(SUM(credit_laari), 0)
    INTO d, c
    FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF d <> c THEN
    RAISE EXCEPTION
      'Entry % does not balance: debits % laari, credits % laari', NEW.entry_id, d, c;
  END IF;
  IF d = 0 THEN
    RAISE EXCEPTION 'Entry % has no value', NEW.entry_id;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_balance ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balance
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- Posted entries are immutable. A correction is a new entry that reverses the
-- old one; nothing is edited and nothing is deleted.
CREATE OR REPLACE FUNCTION forbid_entry_rewrite() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Journal entries cannot be deleted. Reverse it instead.';
  END IF;
  IF NEW.hash IS DISTINCT FROM OLD.hash
     OR NEW.entry_no IS DISTINCT FROM OLD.entry_no
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.entry_date IS DISTINCT FROM OLD.entry_date THEN
    RAISE EXCEPTION 'A posted entry cannot be altered. Reverse it instead.';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_entry_rewrite();

CREATE OR REPLACE FUNCTION forbid_line_rewrite() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'Journal lines cannot be changed once posted. Reverse the entry instead.';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines;
CREATE TRIGGER journal_lines_immutable
  BEFORE DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_line_rewrite();

-- ------------------------------------------------- one company cannot see another

-- The books, the accounts and the lines are visible only to the company whose
-- identity this connection is currently carrying. Set by assumeIdentity() with
-- SET LOCAL, so it lasts one transaction and a pooled connection handed to the
-- next request carries nothing over. If nothing is set, nothing is visible:
-- a forgotten identity fails closed and returns no rows, rather than open.
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','journal_entries','journal_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
  END LOOP;
END
$rls$;

-- Memberships cannot use that policy: it is the table you read to find out
-- which companies you belong to, before any company is chosen. So it answers to
-- the signed-in person as well. Signing in sets only app.user_id and you see
-- your own memberships; once a company is chosen, an administrator can also see
-- who else is in it.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON memberships;
DROP POLICY IF EXISTS membership_visibility ON memberships;
CREATE POLICY membership_visibility ON memberships
  USING (
    user_id    = NULLIF(current_setting('app.user_id',    true), '')::uuid
    OR company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  );

-- The application does not connect as an administrator.
--
-- A Postgres superuser ignores row-level security completely. Railway hands out
-- a superuser by default, so without this the isolation rules above would be
-- present, correct, and doing absolutely nothing. Every transaction drops to
-- this restricted role for its duration, which also means the application has
-- no power to disable the triggers that keep it honest.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentryfi_app') THEN
    CREATE ROLE sentryfi_app NOLOGIN NOBYPASSRLS NOSUPERUSER;
  END IF;
END
$role$;

ALTER ROLE sentryfi_app NOBYPASSRLS NOSUPERUSER;

-- The connecting user must be a member of the role to be able to step into it.
DO $grant$
BEGIN
  EXECUTE format('GRANT sentryfi_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN NULL;  -- already a member, or is the role itself
END
$grant$;

GRANT USAGE ON SCHEMA public TO sentryfi_app;
GRANT SELECT ON companies, users TO sentryfi_app;
GRANT SELECT, INSERT ON accounts, journal_entries, journal_lines, memberships TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE ON journal_counters TO sentryfi_app;

-- Deliberately withheld: UPDATE and DELETE on journal_entries and
-- journal_lines. The triggers refuse them too, but a permission the role does
-- not hold cannot be got around by a bug in a query.
REVOKE UPDATE, DELETE ON journal_entries, journal_lines FROM sentryfi_app;
`;

module.exports = { LEDGER_SQL };
