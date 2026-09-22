/**
 * Getting a bill into the books.
 *
 * A bill arrives as a photograph, is read, is checked by a person if anything
 * about it is doubtful, and then becomes a balanced journal entry. This module
 * owns the last part: the arithmetic of how the tax was quoted, the check for
 * having seen it before, and the entry itself.
 *
 * Nothing here decides anything it is not sure about. A bill whose GST
 * treatment is unknown does not post, and the refusal names what is missing.
 */

const { toLaari, formatLaari, gstWithin, gstOnTop } = require("./money");
const { postEntry, assumeIdentity } = require("./post");

const BASIS_POINTS = 10000n;

/**
 * Splits a bill's total into net and tax according to how the supplier quoted
 * it. This is the calculation that must not be guessed: the same MVR 4,250.50
 * is MVR 3,935.65 + 314.85 if the price includes tax, and MVR 4,250.50 + 340.04
 * if the tax goes on top. Getting it backwards on an inclusive bill overstates
 * the input tax claim by 8%.
 *
 * `amount` is whatever the supplier printed. What that figure means is decided
 * by `treatment`.
 */
function splitTax(amount, treatment, rateBasisPoints) {
  const figure = toLaari(amount);

  switch (treatment) {
    case "inclusive": {
      // The printed figure is the gross; the tax is already inside it.
      const tax = gstWithin(figure, rateFrom(rateBasisPoints, treatment));
      return { net: figure - tax, tax, gross: figure };
    }
    case "exclusive": {
      // The printed figure is the net; the tax is added on top.
      const tax = gstOnTop(figure, rateFrom(rateBasisPoints, treatment));
      return { net: figure, tax, gross: figure + tax };
    }
    case "none_unregistered":
    case "exempt":
    case "zero_rated":
      // No tax either way, and for an unregistered supplier none can ever be
      // claimed. The distinction between the three is kept because the return
      // reports them differently, even though the arithmetic is the same.
      return { net: figure, tax: 0n, gross: figure };
    case "unknown":
      throw new Error(
        "This cannot go in the books until someone says how its GST is quoted: " +
          "added on top, included in the price, or not charged at all."
      );
    default:
      throw new Error(`Unknown GST treatment: ${treatment}`);
  }
}

function rateFrom(rateBasisPoints, treatment) {
  if (rateBasisPoints === null || rateBasisPoints === undefined) {
    throw new Error(`A figure quoted ${treatment} needs its rate recorded. It is not assumed.`);
  }
  const bp = BigInt(rateBasisPoints);
  if (bp < 0n || bp > BASIS_POINTS) {
    throw new Error(`A tax rate of ${Number(bp) / 100}% is not credible.`);
  }
  return bp;
}

/**
 * Has this bill been seen before?
 *
 * Paying a supplier twice and claiming the input tax twice is the most
 * expensive ordinary mistake this app can allow, and on a construction site
 * where the same delivery note can arrive by two routes it is a weekly risk.
 *
 * Three signals, strongest first. The database also refuses an exact repeat
 * outright; this exists so a person is warned before they get that far, and so
 * a near-match that no constraint could catch still gets looked at.
 */
async function findPossibleDuplicates(client, { companyId, userId, bill }) {
  await assumeIdentity(client, { companyId, userId });
  const found = [];

  // 1. The same supplier and the same bill number. Near-certain.
  if (bill.counterpartyId && bill.billNo) {
    const { rows } = await client.query(
      `SELECT id, bill_no, gross_laari, issue_date, status
         FROM bills
        WHERE company_id = $1 AND counterparty_id = $2
          AND lower(btrim(bill_no)) = lower(btrim($3))
          AND status <> 'discarded' AND voided_at IS NULL
          AND ($4::uuid IS NULL OR id <> $4)`,
      [companyId, bill.counterpartyId, bill.billNo, bill.id || null]
    );
    for (const row of rows) {
      found.push({
        billId: row.id,
        confidence: "near-certain",
        because: `Bill ${row.bill_no} from this supplier is already recorded.`,
      });
    }
  }

  // 2. Same supplier, same amount, within a fortnight. Suspicious rather than
  //    certain: a monthly retainer legitimately looks like this.
  if (bill.counterpartyId && bill.grossLaari) {
    const { rows } = await client.query(
      `SELECT id, bill_no, gross_laari, issue_date
         FROM bills
        WHERE company_id = $1 AND counterparty_id = $2
          AND gross_laari = $3
          AND status <> 'discarded' AND voided_at IS NULL
          AND ($4::uuid IS NULL OR id <> $4)
          AND ($5::date IS NULL OR issue_date IS NULL
               OR abs(issue_date - $5::date) <= 14)`,
      [
        companyId,
        bill.counterpartyId,
        String(bill.grossLaari),
        bill.id || null,
        bill.issueDate || null,
      ]
    );
    for (const row of rows) {
      if (found.some((f) => f.billId === row.id)) continue;
      found.push({
        billId: row.id,
        confidence: "possible",
        because:
          `The same supplier, the same amount (MVR ${formatLaari(BigInt(row.gross_laari))}), ` +
          `within a fortnight.`,
      });
    }
  }

  return found;
}

/**
 * Posts a bill.
 *
 * The entry is the ordinary purchase shape: the cost and any reclaimable tax
 * are debits, and what is owed to the supplier is the credit.
 *
 *   Materials            debit   3,935.65
 *   GST we can claim     debit     314.85
 *     Suppliers we owe          credit   4,250.50
 *
 * Tax is only debited when it can actually be reclaimed. A bill from an
 * unregistered supplier has no tax line at all, which is what stops input tax
 * being claimed on it.
 *
 * Must be called inside a transaction.
 */
async function postBill(client, { companyId, userId, billId, accounts }) {
  await assumeIdentity(client, { companyId, userId });

  const { rows: billRows } = await client.query(
    `SELECT b.*, c.name AS counterparty_name
       FROM bills b
       LEFT JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.id = $1 AND b.company_id = $2`,
    [billId, companyId]
  );
  if (!billRows.length) throw new Error("No such bill in these books");
  const bill = billRows[0];

  if (bill.status === "posted") {
    throw new Error("This bill is already in the books.");
  }
  if (bill.voided_at) {
    throw new Error("This bill was voided. Record a new one instead.");
  }
  if (bill.gst_treatment === "unknown") {
    throw new Error(
      "Say how the tax was quoted before posting: added on top, included in " +
        "the price, or not charged at all."
    );
  }
  if (!bill.counterparty_id) {
    throw new Error("Say who this bill is from before posting it.");
  }

  const net = BigInt(bill.net_laari);
  const tax = BigInt(bill.tax_laari);
  const gross = BigInt(bill.gross_laari);
  if (gross === 0n) {
    throw new Error("This bill has no amount on it yet.");
  }

  // A second look at the duplicate question, now that it is about to become
  // real. The check earlier warns; this one refuses.
  const duplicates = await findPossibleDuplicates(client, { companyId, userId, bill: {
    id: bill.id,
    counterpartyId: bill.counterparty_id,
    billNo: bill.bill_no,
    grossLaari: gross,
    issueDate: bill.issue_date,
  }});
  const certain = duplicates.filter(
    (d) => d.confidence === "near-certain" && d.billId !== bill.id
  );
  if (certain.length) {
    throw new Error(
      `${certain[0].because} Voiding one or the other is the way to resolve this.`
    );
  }

  // A bill in another currency: each line also keeps its own-currency amount
  // and the rate on the bill, so the figure can always be read in both.
  const foreign = bill.fc_gross !== null && bill.fc_gross !== undefined;
  const fc = (amount) =>
    foreign && BigInt(amount) > 0n ? { currency: bill.currency.trim(), amount: BigInt(amount), rate: String(bill.fx_rate) } : undefined;

  const lines = [
    {
      accountId: accounts.expense,
      debit: net,
      fc: foreign ? fc(bill.fc_net) : undefined,
      counterpartyId: bill.counterparty_id,
      projectId: bill.project_id,
      memo: bill.bill_no ? `Bill ${bill.bill_no}` : null,
    },
  ];

  // Only reclaimable tax gets its own debit. An unregistered supplier's bill
  // has none, so nothing can be claimed from it.
  if (tax > 0n) {
    lines.push({
      accountId: accounts.taxReclaimable,
      debit: tax,
      fc: foreign ? fc(bill.fc_tax) : undefined,
      counterpartyId: bill.counterparty_id,
      memo: `GST ${bill.gst_treatment === "inclusive" ? "included in" : "added to"} the price`,
    });
  }

  lines.push({
    accountId: accounts.payable,
    credit: gross,
    fc: foreign ? fc(bill.fc_gross) : undefined,
    counterpartyId: bill.counterparty_id,
    memo: bill.counterparty_name || null,
  });

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: bill.issue_date || bill.received_at,
    source: "bill",
    sourceId: bill.id,
    narrative: `${bill.counterparty_name || "Supplier"}${
      bill.bill_no ? ` · ${bill.bill_no}` : ""
    }`,
    lines,
  });

  await client.query(
    `UPDATE bills SET status = 'posted', entry_id = $2, updated_at = now()
      WHERE id = $1`,
    [bill.id, entry.id]
  );

  return { entry, duplicatesWarned: duplicates };
}

module.exports = { splitTax, findPossibleDuplicates, postBill };
