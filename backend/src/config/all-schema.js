/**
 * Every schema file, in the order it has to be applied. A restore builds an
 * empty database from this before loading rows into it.
 */

const { SCHEMA_SQL } = require("./schema");
const { LEDGER_SQL } = require("./ledger-schema");
const { BILLS_SQL } = require("./bills-schema");
const { ATTACHMENTS_SQL } = require("./attachments-schema");
const { COUNTERPARTY_SQL } = require("./counterparty-schema");
const { CASH_SQL } = require("./cash-schema");
const { SALES_SQL } = require("./sales-schema");
const { STATEMENT_SQL } = require("./statement-schema");
const { PERIOD_SQL } = require("./period-schema");
const { TAX_SQL } = require("./tax-schema");
const { IMPORT_SQL } = require("./import-schema");
const { FX_SQL } = require("./fx-schema");
const { PEOPLE_SQL } = require("./people-schema");
const { BACKUP_SQL } = require("./backup-schema");
const { ASSETS_SQL } = require("./assets-schema");
const { LOANS_SQL } = require("./loans-schema");
const { DIMENSIONS_SQL } = require("./dimensions-schema");
const { CURRENCY_SQL } = require("./currency-schema");
const { ACCESS_SQL } = require("./access-schema");
const { STOCK_SQL } = require("./stock-schema");
const { ADVISER_SQL } = require("./adviser-schema");
const { SHIPMENT_SQL } = require("./shipment-schema");
const { PROJECTS_SQL } = require("./projects-schema");
const { ORDERS_SQL } = require("./orders-schema");
const { RECURRING_SQL } = require("./recurring-schema");
const { CLAIMS_SQL } = require("./claims-schema");
const { PORTAL_SQL } = require("./portal-schema");
const { CFO_SQL } = require("./cfo-schema");
const { PUSH_SQL } = require("./push-schema");
const { DOCUMENTS_SQL } = require("./documents-schema");
const { FIELD_SQL } = require("./field-schema");
const { KEYS_SQL } = require("./keys-schema");
const { SECURITY_SQL } = require("./security-schema");
const { PAYROLL_SQL } = require("./payroll-schema");
const { ADVANCES_SQL } = require("./advances-schema");
const { SHARE_SQL } = require("./share-schema");
const { COMMENTS_SQL } = require("./comments-schema");
const { CONTACTS_SQL } = require("./contacts-schema");
const { WALLS_SQL } = require("./walls-schema");
const { NWT_SQL } = require("./nwt-schema");
const { INCOMETAX_SQL } = require("./incometax-schema");
const { PLACES_SQL } = require("./places-schema");
const { CONTACT_EXTRAS_SQL } = require("./contact-extras-schema");
const { PLATFORM_SQL } = require("./platform-schema");

// The database's own day is Malé's, so CURRENT_DATE and date_trunc agree with
// ledger/today.js: a server in UTC says yesterday until five in the morning.
const ZONE_SQL = `DO $zone$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Indian/Maldives');
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Could not set the database time zone';
END $zone$;`;

const ALL_SQL = [
  ZONE_SQL, SCHEMA_SQL, LEDGER_SQL, BILLS_SQL, ATTACHMENTS_SQL, COUNTERPARTY_SQL, CASH_SQL, SALES_SQL,
  STATEMENT_SQL, PERIOD_SQL, TAX_SQL, IMPORT_SQL, FX_SQL, PEOPLE_SQL, BACKUP_SQL, ASSETS_SQL, LOANS_SQL, DIMENSIONS_SQL, CURRENCY_SQL, ACCESS_SQL, STOCK_SQL, ADVISER_SQL, SHIPMENT_SQL, PROJECTS_SQL, ORDERS_SQL, RECURRING_SQL, CLAIMS_SQL, PORTAL_SQL, CFO_SQL, PUSH_SQL, DOCUMENTS_SQL, FIELD_SQL, KEYS_SQL, NWT_SQL, INCOMETAX_SQL, PLACES_SQL, CONTACT_EXTRAS_SQL, PLATFORM_SQL, PAYROLL_SQL, ADVANCES_SQL, SHARE_SQL, COMMENTS_SQL, CONTACTS_SQL,
  // After every table exists: each company's rows point only at its own.
  WALLS_SQL,
  // Last: it has the final word over grants made above.
  SECURITY_SQL,
];

module.exports = { ALL_SQL };
