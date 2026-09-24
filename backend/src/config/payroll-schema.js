/**
 * Payroll: the people paid, what each is paid, each month's run, advances,
 * and what has been paid to the tax office and the pension office.
 *
 * Salaries are private. The tables sit behind the same company wall as every
 * other, and the routes behind the run_payroll capability (administrators and
 * accountants). The journal gets each run's totals, never a person's pay, so
 * someone who reads the books does not read the payroll.
 *
 * A run is worked out and kept as it was: each line holds what was entered and
 * every figure with how it was reached. Approving posts it and freezes it; a
 * mistake after that is put right by an adjustment run, never by editing.
 */
const PAYROLL_SQL = `
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'payroll';

CREATE TABLE IF NOT EXISTS employees (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  employee_no        TEXT,
  name               TEXT NOT NULL,
  job_title          TEXT,
  nationality        CHAR(2) NOT NULL DEFAULT 'MV',
  id_number          TEXT,
  tin                TEXT,
  dob                DATE,
  email              TEXT,
  phone              TEXT,
  joined_on          DATE NOT NULL,
  left_on            DATE,
  basic_laari        BIGINT NOT NULL CHECK (basic_laari >= 0),
  -- NULL: the law decides (nationals of working age are in).
  pension_member     BOOLEAN,
  pension_scheme     TEXT,
  service_charge     BOOLEAN NOT NULL DEFAULT false,
  bank_name          TEXT,
  bank_account       TEXT,
  bank_account_name  TEXT,
  -- UAE Wage Protection System: the person's MOHRE id and their bank's routing code.
  wps_person_id      TEXT,
  wps_routing_code   TEXT,
  project_id         UUID REFERENCES projects(id),
  -- Someone who signs in to Sentryfi and may see their own payslips.
  user_id            UUID REFERENCES users(id),
  archived_at        TIMESTAMPTZ,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (left_on IS NULL OR left_on >= joined_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_no_idx ON employees(company_id, lower(employee_no)) WHERE employee_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_user_idx ON employees(user_id) WHERE user_id IS NOT NULL;

-- What is paid or taken every month until changed: allowances and agreed deductions.
CREATE TABLE IF NOT EXISTS employee_pay_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('allowance','deduction')),
  name          TEXT NOT NULL,
  amount_laari  BIGINT NOT NULL CHECK (amount_laari > 0),
  pensionable   BOOLEAN NOT NULL DEFAULT false,
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS employee_pay_items_idx ON employee_pay_items(employee_id);

CREATE TABLE IF NOT EXISTS pay_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period         TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  kind           TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','adjustment')),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  pay_date       DATE NOT NULL,
  note           TEXT,
  entry_id       UUID REFERENCES journal_entries(id),
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pay_runs_regular_idx ON pay_runs(company_id, period) WHERE kind = 'regular';

CREATE TABLE IF NOT EXISTS pay_run_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  run_id                  UUID NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  employee_id             UUID NOT NULL REFERENCES employees(id),
  inputs                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The payslip as worked out: every line, with how it was reached.
  slip                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  gross_laari             BIGINT NOT NULL DEFAULT 0,
  net_laari               BIGINT NOT NULL DEFAULT 0,
  tax_laari               BIGINT NOT NULL DEFAULT 0,
  pension_employee_laari  BIGINT NOT NULL DEFAULT 0,
  pension_employer_laari  BIGINT NOT NULL DEFAULT 0,
  gratuity_laari          BIGINT NOT NULL DEFAULT 0,
  advance_laari           BIGINT NOT NULL DEFAULT 0,
  other_deductions_laari  BIGINT NOT NULL DEFAULT 0,
  service_charge_laari    BIGINT NOT NULL DEFAULT 0,
  UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS pay_run_lines_employee_idx ON pay_run_lines(employee_id);

-- Money lent to a person, repaid from their pay.
CREATE TABLE IF NOT EXISTS staff_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES employees(id),
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  -- What comes off each month's pay until it is repaid.
  instalment_laari BIGINT NOT NULL CHECK (instalment_laari > 0),
  given_on         DATE NOT NULL,
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  note             TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paying out what a run owes: the wages, the tax office, the pension office.
CREATE TABLE IF NOT EXISTS payroll_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  run_id           UUID NOT NULL REFERENCES pay_runs(id),
  kind             TEXT NOT NULL CHECK (kind IN ('wages','tax','pension')),
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  paid_on          DATE NOT NULL,
  from_account_id  UUID NOT NULL REFERENCES accounts(id),
  reference        TEXT,
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, kind)
);

CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE RESTRICT,
  -- For the Maldivian minimum wage: small, medium or large business.
  business_size     TEXT NOT NULL DEFAULT 'small' CHECK (business_size IN ('small','medium','large')),
  pay_day           INTEGER CHECK (pay_day BETWEEN 1 AND 31),
  wps_employer_id   TEXT,
  wps_routing_code  TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','employee_pay_items','pay_runs','pay_run_lines','staff_advances','payroll_payments','payroll_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON employees, pay_runs, payroll_settings TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_pay_items, pay_run_lines TO sentryfi_app;
-- A draft run can be thrown away; an approved one never (the route refuses it).
GRANT DELETE ON pay_runs TO sentryfi_app;
-- Advances and payments are history: added, never changed.
GRANT SELECT, INSERT ON staff_advances, payroll_payments TO sentryfi_app;
`;

module.exports = { PAYROLL_SQL };
