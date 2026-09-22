import { FileText, Gauge, Landmark, LayoutGrid, Lock, Percent, ReceiptText, Scale, Upload } from "lucide-react";

/**
 * The desk's places, grouped the way an owner thinks about them (DESIGN.md,
 * "A grouped rail"). The rail draws these; the bar's breadcrumb reads them, so
 * a page is named the same in both.
 */
export const SECTIONS = [
  {
    label: "Needs you",
    items: [
      { to: "/dashboard", icon: LayoutGrid, label: "What needs you" },
      { to: "/figures", icon: Gauge, label: "Figures" },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/bills", icon: ReceiptText, label: "Bills" },
      { to: "/invoices", icon: FileText, label: "Invoices" },
      { to: "/bank", icon: Landmark, label: "Bank and cash" },
    ],
  },
  {
    label: "The books",
    items: [
      { to: "/closing", icon: Lock, label: "Closing" },
      { to: "/statements", icon: Scale, label: "Statements" },
      { to: "/tax", icon: Percent, label: "GST return" },
      { to: "/import", icon: Upload, label: "Bring history in", can: "manage_settings" },
    ],
  },
];

const EXTRA = {
  "/settings": ["Company", "Settings"],
  "/more": [null, "More"],
  "/money": [null, "Money"],
  "/cash": ["Money", "Cash tins"],
};

/** Where a path sits: ["Money", "Bank and cash", "Statement"]. */
export function trail(pathname) {
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (pathname === it.to) return [s.label, it.label];
      if (pathname.startsWith(it.to + "/")) return [s.label, it.label, it.to === "/bank" ? "Statement" : "Detail"];
    }
  }
  const e = EXTRA[pathname];
  return e ? e.filter(Boolean) : [];
}
