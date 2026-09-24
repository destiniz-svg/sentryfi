const { today: localToday } = require("./today");
/**
 * Converting between currencies, exactly.
 *
 * A rate is how many units of the company's own currency one unit of the
 * other buys: 15.42 for USD in rufiyaa. It is carried as a decimal string and
 * scaled to an integer, so no conversion ever passes through a float. The
 * result is rounded half up to the laari, once.
 */

const SCALE = 100_000_000n; // eight decimal places, as the column holds

/** "15.42" -> 1542000000n (the rate times 10^8). */
function scaledRate(rate) {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(rate ?? "").trim());
  if (!m) throw new Error(`"${rate}" is not an exchange rate.`);
  const v = BigInt(m[1]) * SCALE + BigInt((m[2] || "").padEnd(8, "0"));
  if (v <= 0n) throw new Error("An exchange rate has to be more than nothing.");
  return v;
}

/** Foreign minor units at a rate, to the company's minor units. */
function toBase(fcMinor, rate) {
  const n = BigInt(fcMinor) * scaledRate(rate);
  return n >= 0n ? (n + SCALE / 2n) / SCALE : -((-n + SCALE / 2n) / SCALE);
}

/** The rate that turns one amount into another, to eight places: base / foreign. */
function rateBetween(baseMinor, fcMinor) {
  const b = BigInt(baseMinor);
  const f = BigInt(fcMinor);
  if (f <= 0n) throw new Error("The other amount has to be more than nothing.");
  const scaled = (b * SCALE + f / 2n) / f;
  const whole = scaled / SCALE;
  return `${whole}.${String(scaled % SCALE).padStart(8, "0")}`;
}

async function baseCurrency(client, { companyId }) {
  const { rows } = await client.query("SELECT base_currency FROM companies WHERE id = $1", [companyId]);
  return (rows[0]?.base_currency || "MVR").trim();
}

/** The latest rate recorded on or before a date, or null. A suggestion, never applied by itself. */
async function rateOn(client, { companyId, currency, on }) {
  const { rows } = await client.query(
    `SELECT rate::text AS rate, on_date::text AS on FROM exchange_rates
      WHERE company_id = $1 AND currency = $2 AND on_date <= $3::date
      ORDER BY on_date DESC, created_at DESC LIMIT 1`,
    [companyId, String(currency).toUpperCase(), on || localToday()]
  );
  return rows[0] ? { rate: rows[0].rate.replace(/0+$/, "").replace(/\.$/, ""), on: rows[0].on } : null;
}

async function recordRate(client, { companyId, userId, currency, on, rate, source }) {
  scaledRate(rate);
  await client.query(
    `INSERT INTO exchange_rates (company_id, currency, on_date, rate, source, set_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [companyId, String(currency).toUpperCase(), on, String(rate), source || null, userId]
  );
}

module.exports = { scaledRate, toBase, rateBetween, baseCurrency, rateOn, recordRate };
