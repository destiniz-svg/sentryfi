/**
 * Who you deal with, learned a document at a time.
 *
 * A supplier on a construction site hands over a scrap of paper with a name on
 * it. Three weeks later a proper invoice arrives from the same company with a
 * TIN, an address and a bank account. Neither document is wrong, and neither
 * is complete. The second should fill in what the first could not, without
 * anybody retyping anything and without the first being blocked at the time.
 *
 * So a counterparty is never a form somebody fills in. It is the accumulation
 * of everything every document has said about them, and it improves on its
 * own.
 *
 * Three rules, and the third is the one that matters.
 *
 *   1. **Never block.** A name with nothing else is a valid counterparty. The
 *      bill gets recorded; the details arrive when they arrive.
 *   2. **Fill what is empty, silently.** A field nobody knew is simply learned.
 *      That is not a decision anybody needs to be consulted about.
 *   3. **Never silently change what is already known.** A field that arrives
 *      *different* is not an update, it is a disagreement: a misread, a
 *      different entity with a similar name, or — for a bank account —
 *      possibly fraud. Invoice redirection works exactly this way, by sending
 *      a real supplier's next bill with a new account number, and a contractor
 *      paying suppliers by transfer is the target. Those surface as something
 *      a person answers, and the old value stays until they do.
 *
 * Every observation is kept with the document it came from, so "where did this
 * TIN come from?" is answerable, and a wrong one can be traced to the bill that
 * introduced it rather than being a mystery in a field.
 */

const COUNTERPARTY_SQL = `
-- Details a document might carry. All optional, all learned rather than asked.
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS gst_number TEXT;
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS notes      TEXT;
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS last_seen  TIMESTAMPTZ;

-- What each document said about them, kept whether or not it was acted on.
CREATE TABLE IF NOT EXISTS counterparty_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  field           TEXT NOT NULL,
  value           TEXT NOT NULL,
  -- Where it came from, so a wrong value leads back to the document that
  -- introduced it rather than being a mystery in a field.
  source_kind     TEXT NOT NULL,          -- 'bill', 'sales_invoice', 'person'
  source_id       UUID,
  confidence      TEXT NOT NULL DEFAULT 'medium',
  -- applied: it filled an empty field. conflict: it disagreed with what was
  -- known and is waiting for a person. superseded: a person chose otherwise.
  outcome         TEXT NOT NULL DEFAULT 'applied',
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT observation_outcome_known
    CHECK (outcome IN ('applied','conflict','superseded','ignored'))
);
CREATE INDEX IF NOT EXISTS cp_obs_party_idx
  ON counterparty_observations(company_id, counterparty_id);
-- The open disagreements, which is what "what needs you" asks for.
CREATE INDEX IF NOT EXISTS cp_obs_open_idx
  ON counterparty_observations(company_id) WHERE outcome = 'conflict';

ALTER TABLE counterparty_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparty_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON counterparty_observations;
CREATE POLICY company_isolation ON counterparty_observations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON counterparty_observations TO sentryfi_app;
`;

module.exports = { COUNTERPARTY_SQL };
