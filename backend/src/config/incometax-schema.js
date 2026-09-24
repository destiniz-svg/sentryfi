/**
 * Where each account goes on the income tax return. Null means the default
 * for its kind of account (ledger/incomeTax.js); a person can say otherwise.
 */
const INCOMETAX_SQL = `
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tax_line TEXT;
GRANT UPDATE (tax_line) ON accounts TO sentryfi_app;
`;

module.exports = { INCOMETAX_SQL };
