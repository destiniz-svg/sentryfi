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
  goods_received: "Goods received note",
  credit_note: "Credit note",
  receipt: "Receipt",
  statement: "Statement",
};

/** Every label on the paper, renamable per template. */
/** Who the paper is addressed to, by kind; renamable as the "Bill to" label. */
const TO = { invoice: "Bill to", quote: "Prepared for", sales_order: "Customer", purchase_order: "Supplier", delivery_note: "Deliver to", goods_received: "Received from", credit_note: "Credit to" };

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

/**
 * Dhivehi labels, suggested. Written in Thaana, right to left, printed under or
 * beside the English. Each can be changed in the template; have them checked
 * by someone who writes Dhivehi every day before relying on them.
 */
export const DV_LABELS = {
  billTo: "ކަސްޓަމަރު",
  number: "ނަންބަރު",
  issued: "ތާރީޚު",
  due: "ދައްކަންޖެހޭ ތާރީޚު",
  reference: "ރެފަރެންސް",
  subject: "މައުޟޫޢު",
  project: "ޕްރޮޖެކްޓް",
  code: "ކޯޑް",
  description: "ތަފްސީލު",
  quantity: "އަދަދު",
  unit: "ޔުނިޓް",
  rate: "އަގު",
  amount: "ޖުމްލަ",
  net: "ޖީ.އެސް.ޓީ ނުލާ",
  tax: "ޖީ.އެސް.ޓީ",
  total: "ޖުމްލަ",
  notes: "ނޯޓު",
  terms: "ޝަރުތުތައް",
  payment: "ފައިސާ ދައްކާނެ ގޮތް",
};
export const DV_TITLES = {
  invoice: "އިންވޮއިސް",
  tax_invoice: "ޓެކްސް އިންވޮއިސް",
  quote: "ކޯޓޭޝަން",
  sales_order: "ސޭލްސް އޯޑަރ",
  purchase_order: "ޕަރޗޭސް އޯޑަރ",
  delivery_note: "ޑެލިވަރީ ނޯޓް",
  goods_received: "ލިބުނު މުދަލުގެ ނޯޓް",
  credit_note: "ކްރެޑިޓް ނޯޓް",
};
export const THAANA = { label: "Noto Sans Thaana", family: "Noto Sans Thaana", google: "Noto+Sans+Thaana:wght@400;600;700" };

export const DEFAULT_TEMPLATE = {
  layout: "classic",
  size: "a4",
  columns: { code: false, quantity: true, unit: true, rate: true },
  labels: {},
  language: "en",
  dvLabels: {},
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
    dvLabels: { ...(x.dvLabels || {}) },
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
  const both = t.language === "en-dv";
  const dv = (k) => t.dvLabels[k] || DV_LABELS[k];
  const label = (k) => (both && dv(k) ? `${t.labels[k] || LABELS[k]} · ${dv(k)}` : t.labels[k] || LABELS[k]);
  const taxed = data.gstTreatment && !["exempt", "none_unregistered", "out_of_scope"].includes(data.gstTreatment);
  const taxInvoice = data.kind === "invoice" && brand.gstRegistered && taxed;
  const custom = (t.title || "").trim();
  const title = taxInvoice ? "Tax Invoice" : custom || KIND_LABEL[data.kind] || "Document";
  const priced = data.priced !== false;
  const accent = brand.accent || "#16181d";
  const currency = data.currency || brand.baseCurrency || "MVR";
  const showTax = taxed || Number(String(data.totals?.tax || "0").replace(/,/g, "")) > 0;
  const columns = [
    t.columns.code && data.lines.some((l) => l.code) && { key: "code", label: label("code") },
    { key: "description", label: label("description"), grow: true },
    !priced && data.lines.some((l) => l.ordered) && { key: "ordered", label: "Ordered", num: true },
    (t.columns.quantity || !priced) && { key: "quantity", label: priced ? label("quantity") : data.kind === "goods_received" ? "Received" : "Delivered", num: true },
    t.columns.unit && data.lines.some((l) => l.unit) && { key: "unit", label: label("unit") },
    priced && t.columns.rate && data.lines.some((l) => l.rate) && { key: "rate", label: label("rate"), num: true },
    priced && { key: "amount", label: label("amount"), num: true },
  ].filter(Boolean);
  const totals = !priced ? [] : [
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
    data.due && { label: data.dueLabel || label("due"), value: longDate(data.due) },
    data.orderNumber && { label: "Order", value: data.orderNumber },
    data.againstInvoice && { label: "Against invoice", value: data.againstInvoice },
    data.reference && { label: label("reference"), value: data.reference },
    data.approvedBy && { label: "Approved by", value: data.approvedBy },
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
    subtitle: [taxInvoice && custom && !/tax invoice/i.test(custom) ? custom : null, both ? DV_TITLES[taxInvoice ? "tax_invoice" : data.kind] : null].filter(Boolean).join("  ·  ") || null,
    thaana: both,
    from: {
      name: brand.name || brand.legalName || "Your company",
      legalName: brand.legalName && brand.legalName !== brand.name ? brand.legalName : null,
      tagline: brand.tagline,
      lines: [brand.address, [brand.phone, brand.email].filter(Boolean).join("  ·  "), brand.website].filter(Boolean),
      ids: idLines,
      logo: t.show.logo ? brand.logo : null,
    },
    to: data.to,
    toLabel: (t.labels.billTo || TO[data.kind] || LABELS.billTo) + (both ? ` · ${dv("billTo")}` : ""),
    meta,
    subject: data.subject ? { label: label("subject"), value: data.subject } : null,
    columns,
    lines: data.lines,
    totals,
    inBase,
    priceNote: data.priceNote || null,
    receivedBy: Boolean(data.receivedBy),
    words: priced && t.show.words && data.totals.gross ? amountInWords(data.totals.gross, currency) : null,
    notes: t.notes ? { label: label("notes"), text: t.notes } : null,
    terms: t.terms ? { label: label("terms"), text: t.terms } : null,
    payment: priced && ["invoice", "quote", "sales_order"].includes(data.kind) && t.show.payment && brand.paymentDetails ? { label: label("payment"), text: brand.paymentDetails } : null,
    signature: t.show.signature && (brand.signature || brand.signatory) ? { image: brand.signature, name: brand.signatory, title: brand.signatoryTitle } : null,
    stamp: t.show.stamp ? brand.stamp : null,
    footer: t.show.footer ? brand.footer : null,
    watermark: data.watermark || (data.status === "void" ? "VOID" : data.status === "draft" ? "DRAFT" : null),
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

/** Made-up documents for the brand kit's preview. Invented names and figures. */
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

const PARTY = SAMPLE_INVOICE.to;
const SUPPLIER = { name: "Coral Steel Trading Pvt Ltd", address: "Malé, Maldives", tin: "1034567GST501" };
const ORDER_LINES = SAMPLE_INVOICE.lines;
export const SAMPLES = {
  invoice: SAMPLE_INVOICE,
  quote: { ...SAMPLE_INVOICE, kind: "quote", number: "QT-0031", reference: null, due: "2026-10-23", dueLabel: "Valid until", priceNote: "GST at 8%, the rate today; the invoice charges the rate on its own date." },
  sales_order: { ...SAMPLE_INVOICE, kind: "sales_order", number: "SO-0012", reference: "PO-2026-0418", due: "2026-10-01", dueLabel: "Expected" },
  purchase_order: {
    kind: "purchase_order", number: "PO-0027", status: "open", issued: "2026-09-23", due: "2026-10-05", dueLabel: "Expected", approvedBy: "A. Manager", to: SUPPLIER,
    gstTreatment: "none_unregistered", gstRatePercent: null, priceNote: "Prices before GST.",
    lines: [
      { description: "Deformed steel bar 12 mm", quantity: "180", unit: "BAR", rate: "96.00", amount: "17,280.00" },
      { description: "Binding wire, 25 kg roll", quantity: "6", unit: "ROLL", rate: "650.00", amount: "3,900.00" },
    ],
    totals: { net: "21,180.00", tax: "0.00", gross: "21,180.00" },
  },
  delivery_note: {
    kind: "delivery_note", number: "SO-0012-D1", status: "issued", issued: "2026-09-24", orderNumber: "SO-0012", to: PARTY, priced: false, receivedBy: true,
    lines: ORDER_LINES.map((l) => ({ description: l.description, ordered: l.quantity, quantity: l.quantity, unit: l.unit })),
    totals: {},
  },
  goods_received: {
    kind: "goods_received", number: "PO-0027-D1", status: "issued", issued: "2026-10-04", orderNumber: "PO-0027", to: SUPPLIER, priced: false,
    lines: [{ description: "Deformed steel bar 12 mm", ordered: "180", quantity: "180", unit: "BAR" }, { description: "Binding wire, 25 kg roll", ordered: "6", quantity: "4", unit: "ROLL" }],
    totals: {},
  },
  credit_note: {
    kind: "credit_note", number: "CN-0004", status: "posted", issued: "2026-09-28", againstInvoice: "INV-000142", subject: "Two days the excavator stood idle", to: PARTY,
    gstTreatment: "exclusive", gstRatePercent: 8,
    lines: [{ description: "Credit against invoice INV-000142: two days the excavator stood idle", quantity: "1", unit: null, rate: null, amount: "6,000.00" }],
    totals: { net: "6,000.00", tax: "480.00", gross: "6,480.00" },
  },
};

/**
 * Starting points by industry: layouts, columns, labels and wording that suit
 * how that kind of business writes its paper. Everything stays editable.
 */
export const PRESETS = {
  construction: {
    label: "Construction",
    hint: "Project and the client's order on every document; rates by day and lot.",
    all: { layout: "classic", columns: { code: false, unit: true } },
    kinds: {
      invoice: { terms: "Payment within 30 days of the invoice date. Retention, where agreed, is released on completion." },
      quote: { terms: "Rates valid for 30 days. Work not listed is not included and is priced when asked for." },
      delivery_note: { notes: "Check the quantities before signing. Shortages cannot be accepted afterwards." },
    },
  },
  trading: {
    label: "Trading and import",
    hint: "Item codes and units; compact rows for long lists.",
    all: { layout: "compact", columns: { code: true, unit: true } },
    kinds: {
      invoice: { terms: "Goods remain ours until paid in full." },
      quote: { terms: "Prices depend on stock and the exchange rate on the day the order is placed." },
      purchase_order: { notes: "Please quote this order number on your invoice and delivery note." },
    },
  },
  services: {
    label: "Services",
    hint: "Hours and rates; no units or item codes.",
    all: { layout: "modern", columns: { code: false, unit: false }, labels: { quantity: "Hours", rate: "Rate per hour" } },
    kinds: { invoice: { terms: "Payment within 14 days of the invoice date." } },
  },
  resort: {
    label: "Resort and tourism",
    hint: "A calm modern page; foreign-currency invoices show GST in MVR.",
    all: { layout: "modern", columns: { code: false } },
    kinds: { invoice: { notes: "Where prices are in US dollars, GST is shown in MVR as MIRA requires.", terms: "Payment on or before the due date." } },
  },
  retail: {
    label: "Retail",
    hint: "Till receipts at 80 mm; codes on the line.",
    all: { columns: { code: true, unit: false } },
    kinds: { invoice: { size: "r80", layout: "compact", show: { words: false } } },
  },
};

/** A template with a preset laid over it, keeping what the preset does not touch. */
export function withPreset(template, preset, kind) {
  const add = { ...preset.all, ...(preset.kinds[kind] || {}) };
  return templateWith({
    ...template,
    ...add,
    columns: { ...template.columns, ...(add.columns || {}) },
    labels: { ...template.labels, ...(add.labels || {}) },
    show: { ...template.show, ...(add.show || {}) },
  });
}
