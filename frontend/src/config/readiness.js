/**
 * Which parts of the app read from the books.
 *
 * On 19 September 2026 the owner photographed a real bill on his phone and it
 * went nowhere near the ledger. He had not done anything wrong: the navigation
 * offered "Bills" and "Expenses" side by side as equal choices, and Expenses —
 * the purchased product's screen, on the purchased product's tables — was the
 * one with a working scan button. He picked the reasonable one.
 *
 * A screen that looks correct and is not is worse than a screen that is
 * missing, and it is much worse in an application about money, where the cost
 * of the mistake is a record nobody can find at the end of the month.
 *
 * So the sections still running on the purchased tables are not reachable.
 * Their code stays, because it is the reference for what replaces it, and each
 * comes back the moment its step lands.
 */

/** Sections that read and write the ledger. These are real. */
export const READY = new Set(["/dashboard", "/figures", "/bills", "/settings"]);

/**
 * Sections still on the purchased product's own tables, with the step that
 * brings each one onto the ledger. The wording is what a person sees, so it
 * says where to go instead rather than apologising.
 */
export const NOT_READY = {
  "/expenses": {
    name: "Expenses",
    instead: "/bills",
    insteadName: "Bills",
    why: "Money you have spent is recorded as a bill now, which keeps the supplier, how the GST was quoted, and the photograph itself.",
  },
  "/invoices": {
    name: "Invoices",
    instead: null,
    why: "Invoicing has not moved onto the books yet. Keep raising them where you raise them today.",
  },
  "/clients": {
    name: "Clients",
    instead: null,
    why: "Customers move across with invoicing. Suppliers already live with Bills.",
  },
  "/payments": {
    name: "Payments",
    instead: null,
    why: "Recording money received moves across with invoicing.",
  },
  "/items": {
    name: "Items",
    instead: null,
    why: "Saved products and rates move across with invoicing.",
  },
  "/reports": {
    name: "Reports",
    instead: null,
    why: "Reports built on the old records would not agree with the books. The real ones — trial balance, profit and loss, balance sheet — come from the ledger.",
  },
};

export const isReady = (to) => !(to in NOT_READY);
