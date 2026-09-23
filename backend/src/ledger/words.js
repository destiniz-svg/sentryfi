/**
 * Messages in the company's own words.
 *
 * The CFO and "needs you" were written for the Maldives: their sentences say
 * MVR, GST, MIRA and TIN. For a company on another pack (ledger/tax.js), what
 * they send is put into that pack's words on the way out: AED, VAT, the FTA,
 * TRN. A Maldivian company's messages pass through untouched.
 *
 * ponytail: word-for-word replacement on the finished text; a sentence whose
 * grammar changes between countries needs writing per pack, which is when
 * these messages move into the packs themselves.
 */
function speak(value, company) {
  const w = company?.tax;
  if (!w || w.code === "MV") return value;
  const cur = String(company.baseCurrency || w.currency || "").trim();
  const swap = (s) =>
    s
      .replace(/\bMVR\b/g, cur || "MVR")
      .replace(/\bMIRA's\b/g, `${w.authority}'s`)
      .replace(/\bMIRA\b/g, w.authority)
      .replace(/\bGST\b/g, w.tax)
      .replace(/\bTIN\b/g, w.taxId);
  const walk = (v) => (typeof v === "string" ? swap(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value);
}

module.exports = { speak };
