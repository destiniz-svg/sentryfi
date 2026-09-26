/**
 * Sending goods or a charge back to a supplier.
 *
 * A return takes part of a bill back in the shares the bill put it in: less
 * owed to the supplier (2100), less GST claimed (1400), and less cost, on the
 * same accounts, projects and dimensions the bill charged. Goods that go back
 * leave stock at what they came in at on that bill, so the stock still equals
 * its value. Nothing already in the books changes; the return is its own
 * entry, dated the day it happened, and the GST return takes it off the input
 * tax of that month.
 */
const { postEntry } = require("./post");
const { toLaari, formatLaari, allocate } = require("./money");
const { today: localToday } = require("./today");
const stock = require("./stock");

const PAYABLE = "2100";
const INPUT_TAX = "1400";

async function byCode(client, companyId, code) {
  const { rows } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = $2", [companyId, code]);
  if (!rows.length) throw new Error(`This company has no ${code} account in its chart.`);
  return rows[0].id;
}

async function loadBill(client, { companyId, billId }) {
  const { rows } = await client.query(
    `SELECT b.*, c.name AS supplier,
            COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p JOIN payment_runs pr ON pr.id = p.run_id AND pr.reversed_at IS NULL WHERE p.bill_id = b.id), 0) AS paid,
            bill_returned(b.id) AS returned
       FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.id = $1 AND b.company_id = $2`,
    [billId, companyId]
  );
  const bill = rows[0];
  if (!bill) throw new Error("There is no such bill.");
  if (bill.status !== "posted" || bill.voided_at || !bill.entry_id) throw new Error("Only a bill in the books can have a return against it.");
  if (bill.fc_gross) throw new Error("This bill is in another currency. A return on it needs its own rate; raise an adjustment with your accountant for now.");
  return bill;
}

/** The goods a bill brought in that could still go back: bought, less what has gone back already. */
async function returnable(client, { companyId, billId }) {
  const bill = await loadBill(client, { companyId, billId });
  const { rows } = await client.query(
    `SELECT m.item_id, i.name, i.unit,
            SUM(m.quantity) FILTER (WHERE m.kind = 'bought') AS bought,
            SUM(m.value_laari) FILTER (WHERE m.kind = 'bought') AS value,
            COALESCE(-SUM(m.quantity) FILTER (WHERE m.kind = 'undone'), 0) AS back
       FROM stock_moves m JOIN stock_items i ON i.id = m.item_id
      WHERE m.company_id = $1 AND m.bill_id = $2
      GROUP BY m.item_id, i.name, i.unit`,
    [companyId, billId]
  );
  const items = rows
    .map((r) => {
      const bought = stock.fromDb(r.bought || 0);
      const back = stock.fromDb(r.back || 0);
      return { itemId: r.item_id, name: r.name, unit: r.unit, bought, left: bought - back, value: BigInt(r.value || 0) };
    })
    .filter((x) => x.bought > 0n);
  const left = BigInt(bill.gross_laari) - BigInt(bill.paid) - BigInt(bill.returned);
  return { bill, items, left };
}

async function nextNumber(client, companyId) {
  return require("./numbering").next(client, { companyId, kind: "purchase_return" });
}
/**
 * A return: goods by item and quantity (at what they came in at), and/or an
 * amount of the bill's other costs (tax included, split as the bill was).
 */
async function create(client, { companyId, userId, billId, reason, items = [], amount = null, issueDate, supplierRef }) {
  const said = String(reason || "").trim();
  if (!said) throw new Error("Say why it is going back.");
  const { bill, items: can, left } = await returnable(client, { companyId, billId });
  const net = BigInt(bill.net_laari);
  const tax = BigInt(bill.tax_laari);
  const taxOf = (n) => (net === 0n ? 0n : (n * tax + net / 2n) / net);

  // Goods, at what they came in at on this bill.
  const moves = [];
  let stockNet = 0n;
  for (const want of items) {
    const units = stock.toUnits(want.quantity);
    if (units <= 0n) continue;
    const it = can.find((x) => x.itemId === want.itemId);
    if (!it) throw new Error("That item did not come in on this bill.");
    if (units > it.left) throw new Error(`Only ${stock.unitsText(it.left)} ${it.unit || ""} of ${it.name} is left to go back on this bill.`.replace("  ", " "));
    const held = await stock.holding(client, { companyId, itemId: it.itemId });
    if (units > held.units) throw new Error(`Only ${stock.unitsText(held.units)} of ${it.name} is on hand; the rest has been sold.`);
    const value = (it.value * units + it.bought / 2n) / it.bought;
    if (value > held.value) throw new Error(`${it.name} on hand is worth less than it came in at; count it instead.`);
    stockNet += value;
    moves.push({ itemId: it.itemId, name: it.name, units, value });
  }

  // The rest of the bill's charges, tax included, split the way the bill was quoted.
  const other = amount === null || amount === undefined || amount === "" ? 0n : toLaari(amount);
  if (other < 0n) throw new Error("The amount going back is above zero.");
  const otherTax = BigInt(bill.gross_laari) === 0n ? 0n : (other * tax + BigInt(bill.gross_laari) / 2n) / BigInt(bill.gross_laari);
  const otherNet = other - otherTax;

  const stockTax = taxOf(stockNet);
  const total = stockNet + stockTax + other;
  if (total <= 0n) throw new Error("Say what is going back: the goods, or an amount.");
  if (total > left) throw new Error(`Only MVR ${formatLaari(left)} is still owed on this bill; a return cannot take back more than that.`);

  // The bill's own costs, in its shares, with their projects and dimensions.
  const { rows: charged } = await client.query(
    `SELECT l.account_id, l.project_id, l.cost_code_id, l.dimension_ids, SUM(l.debit_laari - l.credit_laari) AS amount
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.entry_id = $1 AND a.code NOT IN ($2, $3, '1350')
      GROUP BY 1, 2, 3, 4 HAVING SUM(l.debit_laari - l.credit_laari) > 0 ORDER BY 5 DESC`,
    [bill.entry_id, INPUT_TAX, PAYABLE]
  );
  if (otherNet > 0n && !charged.length) throw new Error("Everything on this bill went into stock: say which items are going back.");

  const number = await nextNumber(client, companyId);
  const memo = `${number}: ${said}`;
  const lines = [{ accountId: await byCode(client, companyId, PAYABLE), debit: total, counterpartyId: bill.counterparty_id, memo }];
  if (stockNet > 0n) lines.push({ accountId: await stock.account(client, companyId, stock.ACCOUNTS.stock), credit: stockNet, memo: `${number}: goods back to ${bill.supplier || "the supplier"}` });
  if (stockTax + otherTax > 0n) lines.push({ accountId: await byCode(client, companyId, INPUT_TAX), credit: stockTax + otherTax, counterpartyId: bill.counterparty_id, memo: `${number}: GST claimed on ${bill.bill_no || "the bill"} taken back` });
  if (otherNet > 0n) {
    const shares = allocate(otherNet, charged.map((r) => BigInt(r.amount)));
    charged.forEach((r, i) => shares[i] > 0n && lines.push({ accountId: r.account_id, credit: shares[i], projectId: r.project_id, costCodeId: r.cost_code_id, dimensionIds: r.dimension_ids, counterpartyId: bill.counterparty_id, memo }));
  }

  const on = issueDate || localToday();
  const entry = await postEntry(client, { companyId, userId, date: on, source: "adjustment", narrative: `${number}: ${said} (back to ${bill.supplier || "the supplier"} on ${bill.bill_no || "a bill"})`, lines });
  for (const m of moves) {
    await client.query(
      `INSERT INTO stock_moves (company_id, item_id, moved_on, kind, quantity, value_laari, entry_id, bill_id, note, created_by, place_id)
       VALUES ($1,$2,$3,'undone',$4,$5,$6,$7,$8,$9,$10)`,
      [companyId, m.itemId, on, stock.unitsText(-m.units), (-m.value).toString(), entry.id, billId, `Returned to supplier, ${number}`, userId, bill.place_id || null]
    );
  }
  const { rows } = await client.query(
    `INSERT INTO supplier_returns (company_id, counterparty_id, bill_id, number, reason, issue_date, supplier_ref, net_laari, tax_laari, gross_laari, items, entry_id, raised_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [companyId, bill.counterparty_id, billId, number, said, on, supplierRef ? String(supplierRef).trim().slice(0, 60) : null, (stockNet + otherNet).toString(), (stockTax + otherTax).toString(), total.toString(),
     JSON.stringify(moves.map((m) => ({ itemId: m.itemId, name: m.name, quantity: stock.unitsText(m.units), value: formatLaari(m.value) }))), entry.id, userId]
  );
  return { ret: rows[0], entry };
}

async function list(client, { companyId, billId }) {
  const { rows } = await client.query(
    "SELECT id, number, reason, issue_date::text AS on, supplier_ref, net_laari, tax_laari, gross_laari, items FROM supplier_returns WHERE company_id = $1 AND ($2::uuid IS NULL OR bill_id = $2) ORDER BY issue_date DESC, number DESC",
    [companyId, billId || null]
  );
  return rows.map((r) => ({ id: r.id, number: r.number, reason: r.reason, on: r.on, supplierRef: r.supplier_ref, net: formatLaari(BigInt(r.net_laari)), tax: formatLaari(BigInt(r.tax_laari)), gross: formatLaari(BigInt(r.gross_laari)), items: r.items }));
}

module.exports = { create, returnable, list };
