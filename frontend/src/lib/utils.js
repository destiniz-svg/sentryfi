import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n, opts = {}) {
  return new Intl.NumberFormat("en-US", opts).format(n);
}

export const CURRENCIES = [
  { code: "MVR", symbol: "MVR" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "INR", symbol: "₹" },
  { code: "CAD", symbol: "$" },
  { code: "AUD", symbol: "$" },
  { code: "JPY", symbol: "¥" },
];

// The books are kept in rufiyaa. This used to default to USD, so every screen
// that did not explicitly pass a currency — and most did not — showed a
// Maldivian contractor's money with a dollar sign. A figure in the wrong
// denomination cannot be checked against a bank statement, which is the whole
// job, so the default is the currency the company actually trades in.
export function formatMoney(amount, currency = "MVR") {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

// "19 Sep 2026" rather than "Sep 19, 2026": day-first is what every document in
// docs/real-world-samples/ uses, and it cannot be misread the way a
// month-first date can.
export function formatDate(date, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", opts);
}

/**
 * Any date as YYYY-MM-DD for <input type="date"> and the API.
 *
 * Read in the local timezone, deliberately. This used to be
 * `toISOString().slice(0, 10)`, which reads the date in UTC: Maldives is
 * UTC+5, so between midnight and 5am every default date came out as
 * yesterday. On a construction site that is a normal working hour, and it
 * silently files bills and payments into the previous month — which, at the
 * turn of a month, is the wrong GST period on a return that has already been
 * filed. A calendar date is a local fact and must be read locally.
 */
export function toDateInput(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today, where the user is standing. */
export function today() {
  return toDateInput(new Date());
}

export function relativeTime(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
