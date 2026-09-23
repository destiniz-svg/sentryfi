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
const { SECURITY_SQL } = require("./security-schema");

const ALL_SQL = [
  SCHEMA_SQL, LEDGER_SQL, BILLS_SQL, ATTACHMENTS_SQL, COUNTERPARTY_SQL, CASH_SQL, SALES_SQL,
  STATEMENT_SQL, PERIOD_SQL, TAX_SQL, IMPORT_SQL, FX_SQL, PEOPLE_SQL, BACKUP_SQL, ASSETS_SQL, LOANS_SQL, DIMENSIONS_SQL, CURRENCY_SQL, ACCESS_SQL, STOCK_SQL, ADVISER_SQL, SHIPMENT_SQL, PROJECTS_SQL,
  // Last: it has the final word over grants made above.
  SECURITY_SQL,
];

module.exports = { ALL_SQL };
