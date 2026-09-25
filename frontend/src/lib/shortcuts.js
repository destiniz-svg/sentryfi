import { ArrowLeftRight, Box, ClipboardList, FileSignature, FileText, HandCoins, Receipt, ShoppingCart, Truck, UserPlus, Wallet } from "lucide-react";

/**
 * Every shortcut the phone's Record sheet can carry, under Photograph and Say
 * it. `may` is the permissions its screen checks on the server (any one will
 * do), so a shortcut is never offered to someone it would refuse. `to` goes
 * there, opening the form at once; `bill` opens the bill sheet.
 */
export const SHORTCUTS = [
  { key: "invoice", icon: FileText, name: "Raise an invoice", sub: "To a customer, with GST added", to: "/invoices/new", may: ["record"] },
  { key: "bill", icon: Receipt, name: "Type in a bill", sub: "Item by item, or just the total", bill: true, may: ["record", "capture"] },
  { key: "quote", icon: FileSignature, name: "Make a quote", sub: "Prices a customer can say yes to", to: "/orders?kind=quote&new=1", may: ["record"] },
  { key: "sales-order", icon: ClipboardList, name: "Sales order", sub: "What a customer has ordered", to: "/orders?kind=sale&new=1", may: ["record"] },
  { key: "purchase-order", icon: ShoppingCart, name: "Purchase order", sub: "What you are ordering from a supplier", to: "/orders?new=1", may: ["record", "order"] },
  { key: "claim", icon: HandCoins, name: "Claim expenses", sub: "Money you spent for the company", to: "/claims?new=1", may: ["record", "capture", "spend_cash", "order", "read"] },
  { key: "customer", icon: UserPlus, name: "Add a customer", sub: "Name, TIN and usual terms", to: "/contacts?side=customers&new=1", may: ["record"] },
  { key: "supplier", icon: Truck, name: "Add a supplier", sub: "Name, TIN and bank details", to: "/contacts?side=suppliers&new=1", may: ["record"] },
  { key: "item", icon: Box, name: "Add an item", sub: "A product or service you sell or buy", to: "/stock?new=1", may: ["record"] },
  { key: "move", icon: ArrowLeftRight, name: "Move money", sub: "Between banks, tins and currencies", to: "/bank?move=1", may: ["approve", "adjust"] },
  { key: "tin", icon: Wallet, name: "Give cash to a tin", sub: "Held until the holder confirms", to: "/bank", may: ["approve", "adjust"] },
];

/** What someone who has not chosen gets, of what they may use. */
export const USUAL = ["invoice", "bill", "move", "tin", "claim"];

/** Could a role with these permissions use this shortcut at all. */
export const roleMay = (caps = [], s) => s.may.some((m) => caps.includes(m));

/**
 * The shortcuts a person may use here: their permissions allow it, and at
 * least one of their roles is allowed it by the administrator. A role with no
 * rule is allowed everything its permissions allow.
 */
export function shortcutsFor({ can, roles = [], rules = {} }) {
  return SHORTCUTS.filter((s) => s.may.some((m) => can(m)) && roles.some((r) => !rules[r] || rules[r].includes(s.key)));
}
