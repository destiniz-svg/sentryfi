import { Sparkles, Inbox, Contact, Truck, FileClock, FilePen, FileSignature, Users, Building2, Palette, Banknote, Boxes, Sunrise, CheckCheck, ClipboardList, FileText, HardHat, Ship, Gauge, HandCoins, Landmark, LayoutGrid, Lock, Package, Percent, ReceiptText, Scale, Settings, Upload, Wallet, Wallet2, Warehouse, ClipboardCheck } from "lucide-react";

/**
 * The desk's places, grouped the way business apps group them (Xero,
 * QuickBooks, Zoho: Sales, Purchases, Banking, Payroll, Inventory, Accounting),
 * each section a short noun and each place a short name. The rail draws these
 * and folds any group away; the bar's breadcrumb reads them, so a page is named
 * the same in both. The company's own setup sits apart, at the foot.
 *
 * A place may carry a query (Quotes, Sales orders and Purchase orders are the
 * one Orders page on its three kinds); it is current only on that kind.
 */
export const SECTIONS = [
  {
    label: "Home",
    items: [
      { to: "/dashboard", icon: LayoutGrid, label: "Home" },
      { to: "/inbox", icon: Inbox, label: "Inbox" },
      { to: "/cfo", icon: Sunrise, label: "CFO", can: "read" },
      { to: "/analytics", icon: Gauge, label: "Analytics" },
      { to: "/approvals", icon: CheckCheck, label: "Approvals", can: "approve" },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/contacts?side=customers", icon: Contact, label: "Customers", can: "read" },
      { to: "/invoices", icon: FileText, label: "Invoices" },
      { to: "/orders?kind=quote", icon: FileSignature, label: "Quotes" },
      { to: "/advances", icon: FileClock, label: "Advance billing" },
      { to: "/orders?kind=sale", icon: ClipboardList, label: "Sales orders" },
    ],
  },
  {
    label: "Purchases",
    items: [
      { to: "/contacts?side=suppliers", icon: Truck, label: "Suppliers", can: "read" },
      { to: "/bills", icon: ReceiptText, label: "Bills" },
      { to: "/orders?kind=purchase", icon: FilePen, label: "Purchase orders" },
      { to: "/claims", icon: Wallet, label: "Expense claims" },
      { to: "/payments", icon: Banknote, label: "Payments", can: "record" },
    ],
  },
  {
    label: "Banking",
    items: [
      { to: "/bank", icon: Landmark, label: "Bank & cash" },
      { to: "/loans", icon: HandCoins, label: "Loans" },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/payroll", icon: Users, label: "Payroll", can: "run_payroll" },
      { to: "/payslips", icon: Wallet2, label: "My payslips" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/inventory", icon: Warehouse, label: "Stock", can: "read" },
      { to: "/stock", icon: Boxes, label: "Items" },
      { to: "/counts", icon: ClipboardCheck, label: "Counts", can: "read" },
      { to: "/still-owed", icon: ClipboardList, label: "Still owed", can: "read" },
      { to: "/shipments", icon: Ship, label: "Shipments" },
    ],
  },
  {
    label: "Projects",
    items: [
      { to: "/projects", icon: HardHat, label: "Projects" },
      { to: "/assets", icon: Package, label: "Fixed assets" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { to: "/reports", icon: Scale, label: "Reports" },
      { to: "/tax", icon: Percent, label: "GST return" },
      { to: "/closing", icon: Lock, label: "Closing" },
    ],
  },
  {
    label: "Company",
    foot: true,
    items: [
      { to: "/practice", icon: Building2, label: "All companies", multi: true },
      { to: "/branding", icon: Palette, label: "Branding" },
      { to: "/import", icon: Upload, label: "Import history", can: "manage_settings" },
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/whats-new", icon: Sparkles, label: "What's new" },
    ],
  },
];

const EXTRA = {
  "/more": [null, "More"],
  "/money": [null, "Money"],
  "/cash": ["Banking", "Cash tins"],
  "/statements": ["Accounting", "Reports", "Financial statements"],
};

const pathOf = (to) => to.split("?")[0];
/** Is this place the one at pathname and search? A place with a query needs its query too. */
export function isHere(to, pathname, search = "") {
  const [path, query] = to.split("?");
  if (!query) return pathname === path || pathname.startsWith(path + "/");
  if (pathname !== path) return false;
  const want = new URLSearchParams(query);
  const got = new URLSearchParams(search);
  return [...want].every(([k, v]) => got.get(k) === v);
}
const places = () => SECTIONS.flatMap((s) => s.items.map((it) => ({ s, it })));
/** The place a location is, most specific first: a kind of order before its page. */
function placeOf(pathname, search) {
  const all = places();
  // A page under a place with a query (a supplier under /contacts?side=suppliers) carries that query along.
  const under = ({ it }) => it.to.includes("?") && pathname.startsWith(pathOf(it.to) + "/") && isHere(it.to, pathOf(it.to), search);
  return all.find(({ it }) => it.to.includes("?") && isHere(it.to, pathname, search)) || all.find(({ it }) => !it.to.includes("?") && isHere(it.to, pathname)) || all.find(under) || all.find(({ it }) => pathname.startsWith(pathOf(it.to) + "/") || pathname === pathOf(it.to));
}

/** The group a location belongs to, if any. */
export function sectionOf(pathname, search = "") {
  return placeOf(pathname, search)?.s.label || null;
}

/** Where a location sits: ["Banking", "Bank & cash", "Statement"]. */
export function trail(pathname, search = "") {
  const p = placeOf(pathname, search);
  if (p) {
    const path = pathOf(p.it.to);
    if (pathname === path) return [p.s.label, p.it.label];
    return [p.s.label, p.it.label, path === "/bank" ? "Statement" : "Detail"];
  }
  if (pathname.startsWith("/documents/")) return ["Sales", "Document"];
  const e = EXTRA[pathname];
  return e ? e.filter(Boolean) : [];
}
