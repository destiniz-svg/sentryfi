import { FileClock, Users, Building2, Palette, Banknote, Boxes, Sunrise, CheckCheck, ClipboardList, FileText, HardHat, Ship, Gauge, HandCoins, Landmark, LayoutGrid, Lock, Package, Percent, ReceiptText, Scale, Settings, Upload, Wallet } from "lucide-react";

/**
 * The desk's places, grouped the way an owner thinks about them (DESIGN.md,
 * "A grouped rail"). The rail draws these and folds any group away; the bar's
 * breadcrumb reads them, so a page is named the same in both. The company's
 * own setup sits apart, at the foot of the rail.
 */
export const SECTIONS = [
  {
    label: "Needs you",
    items: [
      { to: "/dashboard", icon: LayoutGrid, label: "What needs you" },
      { to: "/cfo", icon: Sunrise, label: "The CFO", can: "read" },
      { to: "/analytics", icon: Gauge, label: "Analytics" },
      { to: "/approvals", icon: CheckCheck, label: "Approvals", can: "approve" },
    ],
  },
  {
    label: "Buying and selling",
    items: [
      { to: "/invoices", icon: FileText, label: "Invoices" },
      { to: "/bills", icon: ReceiptText, label: "Bills" },
      { to: "/orders", icon: ClipboardList, label: "Orders and quotes" },
      { to: "/advances", icon: FileClock, label: "Proforma and retainers" },
      { to: "/payments", icon: Banknote, label: "Payments", can: "record" },
      { to: "/claims", icon: Wallet, label: "Expense claims" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/bank", icon: Landmark, label: "Bank and cash" },
      { to: "/loans", icon: HandCoins, label: "Loans" },
      { to: "/payroll", icon: Users, label: "Payroll", can: "run_payroll" },
    ],
  },
  {
    label: "Work and assets",
    items: [
      { to: "/projects", icon: HardHat, label: "Projects" },
      { to: "/stock", icon: Boxes, label: "Items" },
      { to: "/shipments", icon: Ship, label: "Shipments" },
      { to: "/assets", icon: Package, label: "Fixed assets" },
    ],
  },
  {
    label: "The books",
    items: [
      { to: "/statements", icon: Scale, label: "Statements" },
      { to: "/tax", icon: Percent, label: "GST return" },
      { to: "/closing", icon: Lock, label: "Closing" },
    ],
  },
  {
    label: "Company",
    foot: true,
    items: [
      { to: "/practice", icon: Building2, label: "All your companies", multi: true },
      { to: "/branding", icon: Palette, label: "Branding and documents" },
      { to: "/import", icon: Upload, label: "Bring history in", can: "manage_settings" },
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

const EXTRA = {
  "/more": [null, "More"],
  "/money": [null, "Money"],
  "/cash": ["Money", "Cash tins"],
};

/** The group a path belongs to, if any. */
export function sectionOf(pathname) {
  return SECTIONS.find((s) => s.items.some((it) => pathname === it.to || pathname.startsWith(it.to + "/")))?.label || null;
}

/** Where a path sits: ["Money", "Bank and cash", "Statement"]. */
export function trail(pathname) {
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (pathname === it.to) return [s.label, it.label];
      if (pathname.startsWith(it.to + "/")) return [s.label, it.label, it.to === "/bank" ? "Statement" : "Detail"];
    }
  }
  if (pathname.startsWith("/documents/")) return ["Buying and selling", "Document"];
  const e = EXTRA[pathname];
  return e ? e.filter(Boolean) : [];
}
