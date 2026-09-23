/**
 * Documents: what goes on the paper, and the rules no template can break.
 *
 * `compose` turns the facts (from the server, or from a form being filled in)
 * plus the brand kit and the template into exactly what is drawn. The drawing
 * itself is components/documents/DocumentPaper.jsx: one drawing for the live
 * preview, the printed page, the PDF and the customer's link.
 */

export const SIZES = {
  a4: { label: "A4", width: 210, height: 297 },
  letter: { label: "Letter", width: 215.9, height: 279.4 },
  a5: { label: "A5", width: 148, height: 210 },
  r80: { label: "Receipt 80 mm", width: 72, height: null, receipt: true, paper: 80 },
  r58: { label: "Receipt 58 mm", width: 48, height: null, receipt: true, paper: 58 },
};

export const LAYOUTS = {
  classic: { label: "Classic", hint: "Letterhead across the top, a quiet rule under it." },
  modern: { label: "Modern", hint: "Your colour as a band, the title large." },
  compact: { label: "Compact", hint: "Tight rows for long lists of items." },
};

export const FONTS = {
  barlow: { label: "Barlow", family: "Barlow", google: "Barlow:wght@400;500;600;700" },
  inter: { label: "Inter", family: "Inter", google: "Inter:wght@400;500;600;700" },
  plex: { label: "IBM Plex Sans", family: "IBM Plex Sans", google: "IBM+Plex+Sans:wght@400;500;600;700" },
  "space-grotesk": { label: "Space Grotesk", family: "Space Grotesk", google: "Space+Grotesk:wght@400;500;600;700" },
  "source-serif": { label: "Source Serif", family: "Source Serif 4", google: "Source+Serif+4:wght@400;600;700" },
  lora: { label: "Lora", family: "Lora", google: "Lora:wght@400;500;600;700" },
};

export const KIND_LABEL = {
  invoice: "Invoice",
  quote: "Quotation",
  sales_order: "Sales order",
  purchase_order: "Purchase order",
  delivery_note: "Delivery note",
  credit_note: "Credit note",
  receipt: "Receipt",
  statement: "Statement",
};

/** Every label on the paper, renamable per template. */
export const LABELS = {
  billTo: "Bill to",
  number: "Number",
  issued: "Date",
  due: "Due",
  reference: "Your reference",
  subject: "For",
  project: "Project",
  code: "Code",
  description: "Description",
  quantity: "Qty",
  unit: "Unit",
  rate: "Rate",
  amount: "Amount",
  net: "Before GST",
  tax: "GST",
  total: "Total",
  notes: "Notes",
  terms: "Terms",
  payment: "How to pay",
};

export const DEFAULT_TEMPLATE = {
  layout: "classic",
  size: "a4",
  columns: { code: false, quantity: true, unit: true, rate: true },
  labels: {},
  title: "",
  notes: "",
  terms: "",
  show: { logo: true, stamp: true, signature: true, payment: true, words: true, footer: true },
};

export function templateWith(t) {
  const x = t || {};
  return {
    ...DEFAULT_TEMPLATE,
    ...x,
    columns: { ...DEFAULT_TEMPLATE.columns, ...(x.columns || {}) },
    show: { ...DEFAULT_TEMPLATE.show, ...(x.show || {}) },
    labels: { ...(x.labels || {}) },
  };
}

// ------------------------------------------------------------------ colour

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function luminance(h) {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** The accent, darkened until text in it reads on white paper (WCAG AA). */
export function readable(accent) {
  let c = accent;
  for (let i = 0; i < 20 && contrast(c, "#ffffff") < 4.5; i++) c = toHex(hex(c).map((v) => v * 0.88));
  return c;
}
/** White or ink, whichever reads on the accent. */
export const inkOn = (accent) => (contrast(accent, "#ffffff") >= 3 ? "#ffffff" : "#16181d");
/** A pale wash of the accent, for bands and table heads. */
export const wash = (accent, amount = 0.1) => toHex(hex(accent).map((v) => 255 - (255 - v) * amount));

// ------------------------------------------------------------------ words

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : "");
  return [h ? ONES[h] + " hundred" : "", rest].filter(Boolean).join(" and ");
}
export function inWords(n) {
  if (n === 0) return "zero";
  const parts = [];
  [
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
    [1, ""],
  ].forEach(([size, name]) => {
    const chunk = Math.floor(n / size) % 1000;
    if (chunk) parts.push(below1000(chunk) + (name ? " " + name : ""));
  });
  return parts.join(" ");
}
const MONEY_NAMES = { MVR: ["Rufiyaa", "Laari"], USD: ["US Dollars", "Cents"], EUR: ["Euros", "Cents"], GBP: ["Pounds", "Pence"], AED: ["Dirhams", "Fils"], INR: ["Rupees", "Paise"], CNY: ["Yuan", "Fen"], SGD: ["Singapore Dollars", "Cents"], JPY: ["Yen", ""] };
export function amountInWords(text, currency) {
  const [whole, frac = "00"] = String(text).replace(/,/g, "").split(".");
  const [big, small] = MONEY_NAMES[currency] || [currency, "cents"];
  const w = inWords(Number(whole));
  const cents = Number(frac.slice(0, 2).padEnd(2, "0"));
  const s = `${big} ${w}${cents && small ? ` and ${inWords(cents)} ${small}` : ""} only`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------------ composing

/**
 * What is drawn. Legal lines come last and win: for a GST-registered company
 * an invoice with GST on it says "Tax Invoice", shows the company's TIN and
 * GST number, the rate and the GST, and on an invoice in another currency the
 * GST in MVR too. A template can rename a label; it cannot remove those.
 */
export function compose({ data, brand, template, size }) {
  const t = templateWith(template);
  const s = SIZES[size || t.size] || SIZES.a4;
  const label = (k) => t.labels[k] || LABELS[k];
  const taxed = data.gstTreatment && !["exempt", "none_unregistered", "out_of_scope"].includes(data.gstTreatment);
  const taxInvoice = data.kind === "invoice" && brand.gstRegistered && taxed;
  const custom = (t.title || "").trim();
  const title = taxInvoice ? "Tax Invoice" : custom || KIND_LABEL[data.kind] || "Document";
  const accent = brand.accent || "#16181d";
  const currency = data.currency || brand.baseCurrency || "MVR";
  const showTax = taxed || Number(String(data.totals?.tax || "0").replace(/,/g, "")) > 0;
  const columns = [
    t.columns.code && data.lines.some((l) => l.code) && { key: "code", label: label("code") },
    { key: "description", label: label("description"), grow: true },
    t.columns.quantity && { key: "quantity", label: label("quantity"), num: true },
    t.columns.unit && data.lines.some((l) => l.unit) && { key: "unit", label: label("unit") },
    t.columns.rate && data.lines.some((l) => l.rate) && { key: "rate", label: label("rate"), num: true },
    { key: "amount", label: label("amount"), num: true },
  ].filter(Boolean);
  const totals = [
    showTax && { label: label("net"), value: data.totals.net },
    showTax && { label: `${label("tax")}${data.gstRatePercent !== null && data.gstRatePercent !== undefined ? ` ${data.gstRatePercent}%` : ""}`, value: data.totals.tax },
    { label: `${label("total")} ${currency}`, value: data.totals.gross, strong: true },
  ].filter(Boolean);
  const inBase =
    data.currency && data.totals.taxInBase !== undefined
      ? [
          `GST in MVR: ${data.totals.taxInBase}${data.fxRate ? ` at ${data.fxRate} MVR to 1 ${data.currency}` : ""}`,
          `Total in MVR: ${data.totals.grossInBase}`,
        ]
      : [];
  const meta = [
    { label: label("number"), value: data.number },
    { label: label("issued"), value: longDate(data.issued) },
    data.due && { label: label("due"), value: longDate(data.due) },
    data.reference && { label: label("reference"), value: data.reference },
    data.project && { label: label("project"), value: data.project },
  ].filter(Boolean);
  const idLines = [
    brand.tin && `TIN ${brand.tin}`,
    brand.gstRegistered && brand.gstNumber && `GST ${brand.gstNumber}`,
    brand.registrationNo && `Reg. ${brand.registrationNo}`,
  ].filter(Boolean);
  return {
    size: s,
    layout: s.receipt ? "receipt" : LAYOUTS[t.layout] ? t.layout : "classic",
    font: FONTS[brand.font] || FONTS.barlow,
    accent,
    accentText: readable(accent),
    onAccent: inkOn(accent),
    wash: wash(accent),
    title,
    subtitle: taxInvoice && custom && !/tax invoice/i.test(custom) ? custom : null,
    from: {
      name: brand.name || brand.legalName || "Your company",
      legalName: brand.legalName && brand.legalName !== brand.name ? brand.legalName : null,
      tagline: brand.tagline,
      lines: [brand.address, [brand.phone, brand.email].filter(Boolean).join("  ·  "), brand.website].filter(Boolean),
      ids: idLines,
      logo: t.show.logo ? brand.logo : null,
    },
    to: data.to,
    toLabel: label("billTo"),
    meta,
    subject: data.subject ? { label: label("subject"), value: data.subject } : null,
    columns,
    lines: data.lines,
    totals,
    inBase,
    words: t.show.words && data.totals.gross ? amountInWords(data.totals.gross, currency) : null,
    notes: t.notes ? { label: label("notes"), text: t.notes } : null,
    terms: t.terms ? { label: label("terms"), text: t.terms } : null,
    payment: t.show.payment && brand.paymentDetails ? { label: label("payment"), text: brand.paymentDetails } : null,
    signature: t.show.signature && (brand.signature || brand.signatory) ? { image: brand.signature, name: brand.signatory, title: brand.signatoryTitle } : null,
    stamp: t.show.stamp ? brand.stamp : null,
    footer: t.show.footer ? brand.footer : null,
    watermark: data.status === "void" ? "VOID" : data.status === "draft" ? "DRAFT" : null,
  };
}

export function longDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Loads a Google font once. */
const loaded = new Set();
export function loadFont(font) {
  if (!font?.google || loaded.has(font.google) || typeof document === "undefined") return;
  loaded.add(font.google);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(l);
}

/** A made-up invoice for the brand kit's preview. Invented names and figures. */
export const SAMPLE_INVOICE = {
  kind: "invoice",
  number: "INV-000142",
  status: "posted",
  issued: "2026-09-23",
  due: "2026-10-23",
  reference: "PO-2026-0418",
  subject: "Equipment hire, September 2026",
  project: null,
  to: { name: "Blue Lagoon Resorts Pvt Ltd", address: "Hulhumalé, Maldives", tin: "1098765GST501" },
  currency: null,
  gstTreatment: "exclusive",
  gstRatePercent: 8,
  lines: [
    { code: "EXC-05", description: "Excavator hire, 5 tonne, with operator", quantity: "22", unit: "DAY", rate: "3,000.00", amount: "66,000.00" },
    { code: "TRK-10", description: "Tipper truck, 10 m³", quantity: "14", unit: "DAY", rate: "1,850.00", amount: "25,900.00" },
    { code: "MOB", description: "Mobilisation and demobilisation", quantity: "1", unit: "LOT", rate: "4,500.00", amount: "4,500.00" },
  ],
  totals: { net: "96,400.00", tax: "7,712.00", gross: "104,112.00" },
};
