/**
 * Money.
 *
 * One rufiyaa is 100 laari. Every amount in the ledger is a whole number of
 * laari held in a BigInt, so MVR 4,250.00 is 425000n.
 *
 * Nothing here ever puts money through a JavaScript number. 0.1 + 0.2 is
 * 0.30000000000000004, and a system that adds up thousands of bills that way
 * ends the month out by a few laari with no way to find where. Parsing is done
 * on the decimal text, digit by digit.
 */

const LAARI_PER_RUFIYAA = 100n;

/** Rounds half away from zero, the convention MIRA and every invoice uses. */
function divideRounded(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const twiceRemainder = (a % b) * 2n;
  const rounded = twiceRemainder >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Accepts "4250.50", "4,250.50", 4250.5, "MVR 4,250.50", 425050n.
 * Rejects anything it cannot read exactly rather than guessing, because a
 * guessed amount is worse than a refused one.
 */
function toLaari(input) {
  if (typeof input === "bigint") return input;
  if (input === null || input === undefined || input === "") {
    throw new TypeError("Amount is missing");
  }
  if (typeof input === "number" && !Number.isFinite(input)) {
    throw new RangeError(`Not an amount: ${input}`);
  }

  const text = String(input).trim().replace(/[\s,]/g, "").replace(/^(MVR|USD|EUR)/i, "");
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] === undefined || match[3] === ""))) {
    throw new RangeError(`Not an amount: ${input}`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2] || "0");
  const fractionText = match[3] || "";

  // Keep two digits; anything beyond is rounded, not truncated.
  const kept = BigInt((fractionText.slice(0, 2) + "00").slice(0, 2));
  let laari = whole * LAARI_PER_RUFIYAA + kept;
  if (fractionText.length > 2 && Number(fractionText[2]) >= 5) laari += 1n;

  return sign * laari;
}

/** 425050n -> "4,250.50". Always two decimals; never a bare "4250.5". */
function formatLaari(laari, { withGrouping = true } = {}) {
  const value = typeof laari === "bigint" ? laari : BigInt(laari);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = (absolute / LAARI_PER_RUFIYAA).toString();
  const fraction = (absolute % LAARI_PER_RUFIYAA).toString().padStart(2, "0");
  const grouped = withGrouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

/**
 * GST, both ways round.
 *
 * Maldivian suppliers quote it inconsistently and the app must record which was
 * meant rather than infer it: some add 8% on top, some include it in the price
 * shown, and many are not registered and charge none at all. Getting this
 * backwards on an inclusive invoice overstates the claim by 8%.
 */
// Rates in basis points (800 is 8%), so 8.5% is exact.
function gstOnTop(netLaari, rateBp) {
  return divideRounded(toLaari(netLaari) * BigInt(rateBp), 10000n);
}

function gstWithin(grossLaari, rateBp) {
  const rate = BigInt(rateBp);
  return divideRounded(toLaari(grossLaari) * rate, 10000n + rate);
}

/** Splits a total across n shares without losing or inventing a laari. */
function allocate(totalLaari, weights) {
  const total = toLaari(totalLaari);
  const weightSum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (weightSum === 0n) throw new RangeError("Cannot allocate across zero weight");

  const shares = weights.map((w) => divideRounded(total * BigInt(w), weightSum));
  // Rounding leaves a laari or two unspent. It goes to the largest share, so
  // the parts always sum to the whole.
  const drift = total - shares.reduce((a, b) => a + b, 0n);
  if (drift !== 0n) {
    let largest = 0;
    for (let i = 1; i < shares.length; i += 1) {
      if (shares[i] > shares[largest]) largest = i;
    }
    shares[largest] += drift;
  }
  return shares;
}

module.exports = {
  LAARI_PER_RUFIYAA,
  toLaari,
  formatLaari,
  gstOnTop,
  gstWithin,
  allocate,
  divideRounded,
};
