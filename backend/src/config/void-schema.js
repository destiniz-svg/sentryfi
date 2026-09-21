/**
 * Voiding, not deleting.
 *
 * A money record is never removed. It is voided: it stays exactly where it
 * was, keeps its number in sequence, loses its effect on every total, and
 * carries a reason, a time and the person who did it.
 *
 * This is the pattern every established accounting system uses, for the same
 * reason. Xero and QuickBooks both distinguish void from delete and both
 * recommend void: a deleted invoice leaves no trace of what it was, so the
 * audit log can say only that something was removed, while a voided one still
 * shows the original amount, who voided it and when. Voiding also keeps the
 * numbering unbroken, and a gap in a numbered invoice sequence is the first
 * thing an auditor asks about.
 *
 * It is also what the ledger underneath already does. As of step 1 a posted
 * entry cannot be edited or deleted by anyone, and a correction is a new
 * opposite entry carrying a reason. Until now the screens said the opposite —
 * every list offered a trash can and the invoice list promised "This cannot be
 * undone" — so the interface was describing a product that no longer existed
 * underneath it.
 *
 * This applies to money records only: expenses. (Invoices and payments left with
 * the purchased tables; the ledger's own documents carry their own void rules.)
 * Customers and catalogue items are reference data, not financial events, and
 * requiring a written reason to remove a mistyped item name would be ceremony
 * rather than rigour.
 */

const VOID_SQL = `
DO $void$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS voided_at  TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS voided_by  UUID REFERENCES users(id)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS void_reason TEXT', t);

    -- A void without a reason is just a quieter delete.
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_void_needs_reason');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (' ||
      '  voided_at IS NULL OR (void_reason IS NOT NULL AND length(btrim(void_reason)) >= 3)' ||
      ')', t, t || '_void_needs_reason');

    -- Live records are the common query, so they get the index.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (user_id) WHERE voided_at IS NULL',
      'idx_' || t || '_live', t);
  END LOOP;
END
$void$;
`;

module.exports = { VOID_SQL };
