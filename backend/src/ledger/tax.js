/**
 * The tax engine.
 *
 * The core does not know what country it is in; the pack does. A pack is data:
 * which rates exist, from which date, how a document may quote its tax, and
 * when a return is due. Nothing else in the app should write "8".
 *
 * A rate is found for a date, never "the current rate", because a document is
 * taxed at the rate in force on its own date. And once a document has a rate
 * it keeps it: bills and invoices store the basis points they were computed at,
 * so a rate change from a date can only ever affect documents from that date
 * on. Nothing here rewrites history, and nothing could, because nothing reads
 * a rate back for a document that already has one.
 *
 * Rates are basis points (800 is 8%) so a rate like 8.5% is exact.
 *
 * Two places a rate can come from, in order:
 *   1. The company's own rows in tax_rates. An administrator adds one when the
 *      law changes before the pack does, or, on the generic pack, to say what
 *      its rate is at all. Append-only: a change is a new row with a date.
 *   2. The pack, below. Changes to it are code changes, reviewed and dated.
 */

/**
 * Maldives. GST Act 10/2011 and its amendments, as MIRA publishes them:
 * general 6% from 2 January 2013, 8% from 1 January 2023 (sixth amendment);
 * tourism 3.5% from 2 October 2011, then 6%, 8%, 12%, 16% from 1 January
 * 2023, 17% from 1 July 2025 (seventh amendment). Returns are due by the 28th
 * of the month after the period. To be confirmed by the accountant before the
 * first filing, as PRODUCT.md requires.
 */
const MV = {
  code: "MV",
  name: "Maldives",
  currency: "MVR",
  rates: {
    general: {
      label: "General GST",
      history: [
        { from: "2013-01-02", bp: 600 },
        { from: "2023-01-01", bp: 800 },
      ],
    },
    tourism: {
      label: "Tourism GST",
      history: [
        { from: "2011-10-02", bp: 350 },
        { from: "2012-01-01", bp: 600 },
        { from: "2013-01-01", bp: 800 },
        { from: "2014-11-01", bp: 1200 },
        { from: "2023-01-01", bp: 1600 },
        { from: "2025-07-01", bp: 1700 },
      ],
    },
  },
  defaultRate: "general",
  treatments: ["exclusive", "inclusive", "none_unregistered", "exempt", "zero_rated", "unknown"],
  filing: { periods: ["month", "quarter"], dueDay: 28, authority: "MIRA" },
};

/**
 * Anywhere else. One consumption tax whose rate the company states, any period
 * length, and no forms: enough to keep correct books without pretending to
 * file for a country this product does not know.
 */
const GENERIC = {
  code: "GENERIC",
  name: "Generic",
  currency: null,
  rates: { standard: { label: "Standard rate", history: [] } },
  defaultRate: "standard",
  treatments: ["exclusive", "inclusive", "none_unregistered", "exempt", "zero_rated", "unknown"],
  filing: { periods: ["month", "quarter", "year"], dueDay: null, authority: null },
};

const PACKS = { MV, GENERIC };

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10));

function packCalled(code) {
  const pack = PACKS[code];
  if (!pack) throw new Error(`There is no tax pack called ${code}.`);
  return pack;
}

async function packFor(client, { companyId }) {
  const { rows } = await client.query("SELECT tax_pack FROM companies WHERE id = $1", [companyId]);
  return packCalled(rows[0]?.tax_pack || "MV");
}

/**
 * The rate in force on a date, and where it came from. Throws when none is
 * known: a missing rate is not zero, it is a question.
 */
async function rateOn(client, { companyId, on, rate }) {
  const pack = await packFor(client, { companyId });
  const code = rate || pack.defaultRate;
  if (!pack.rates[code]) throw new Error(`${pack.name} has no rate called ${code}.`);
  const day = isoDate(on || new Date());

  const { rows } = await client.query(
    `SELECT rate_bp, effective_from::text AS from FROM tax_rates
      WHERE company_id = $1 AND rate_code = $2 AND effective_from <= $3::date
      ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    [companyId, code, day]
  );
  const own = rows[0] ? { bp: rows[0].rate_bp, from: rows[0].from, source: "company" } : null;
  const fromPack = [...pack.rates[code].history].reverse().find((h) => h.from <= day);
  const packed = fromPack ? { bp: fromPack.bp, from: fromPack.from, source: "pack" } : null;

  // The later effective date wins; on the same date the company's own word does.
  const found = !own ? packed : !packed ? own : own.from >= packed.from ? own : packed;
  if (!found) {
    throw new Error(`No ${pack.rates[code].label.toLowerCase()} rate is known for ${day}. An administrator can add one.`);
  }
  return { ...found, code, label: pack.rates[code].label, on: day };
}

/**
 * The rate a document should carry. A treatment that charges no tax carries
 * none; one that does gets the rate for its date unless the paper printed a
 * different one, in which case the paper wins and is kept as printed.
 */
async function rateForDocument(client, { companyId, on, treatment, printedBp }) {
  if (!["inclusive", "exclusive"].includes(treatment)) return null;
  if (printedBp !== null && printedBp !== undefined) return printedBp;
  return (await rateOn(client, { companyId, on })).bp;
}

/** A company's own rate from a date. Earlier documents keep what they were computed at. */
async function setRate(client, { companyId, userId, rate, bp, from, reason }) {
  const pack = await packFor(client, { companyId });
  const code = rate || pack.defaultRate;
  if (!pack.rates[code]) throw new Error(`${pack.name} has no rate called ${code}.`);
  if (!Number.isInteger(bp) || bp < 0 || bp > 10000) throw new Error("A rate is between 0% and 100%.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))) throw new Error("From which date?");
  const { rows } = await client.query(
    `INSERT INTO tax_rates (company_id, rate_code, rate_bp, effective_from, reason, set_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [companyId, code, bp, from, String(reason || "").trim() || null, userId]
  );
  return { id: rows[0].id, code, bp, from };
}

/** What the screens need: the pack, and each rate as it stands today. */
async function overview(client, { companyId, on }) {
  const pack = await packFor(client, { companyId });
  const rates = [];
  for (const code of Object.keys(pack.rates)) {
    try {
      rates.push(await rateOn(client, { companyId, on, rate: code }));
    } catch {
      rates.push({ code, label: pack.rates[code].label, bp: null, from: null, source: null });
    }
  }
  const { rows: own } = await client.query(
    `SELECT rate_code, rate_bp, effective_from::text AS from, reason, created_at
       FROM tax_rates WHERE company_id = $1 ORDER BY effective_from DESC, created_at DESC`,
    [companyId]
  );
  return {
    pack: { code: pack.code, name: pack.name, filing: pack.filing, treatments: pack.treatments },
    defaultRate: pack.defaultRate,
    rates,
    changes: own,
  };
}

module.exports = { PACKS, packFor, rateOn, rateForDocument, setRate, overview };
