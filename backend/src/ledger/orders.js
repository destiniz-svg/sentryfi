/**
 * Orders. See config/orders-schema.js.
 *
 * A purchase order waits for approval when its total is above what the person
 * ordering may approve (no approve right, or a spending limit below it).
 * Deliveries record what arrived, never more than was ordered. A bill is made
 * from what was received and not yet billed, at the ordered prices unless the
 * supplier's paper says otherwise (the difference is shown, not hidden), and
 * is split into stock and costs line by line, so it needs no adviser. A sales
 * order is the same the other way round: delivered, then invoiced from what
 * was delivered, stock items leaving at average cost when the invoice posts.
 */
const { assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const stock = require("./stock");
const billSplit = require("./billSplit");
const sales = require("./sales");
const { splitTax } = require("./bills");
const taxEngine = require("./tax");
const { findOrCreate } = require("./counterparties");
const { today: localToday } = require("./today");

const PREFIX = { purchase: "PO", sale: "SO", quote: "QT" };
const times = (unitLaari, units) => (unitLaari * units + 5000n) / 10000n; // units are ten-thousandths

async function nextNumber(client, { companyId, kind }) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::int), 0) AS n FROM orders WHERE company_id = $1 AND kind = $2`,
    [companyId, kind]
  );
  return `${PREFIX[kind]}-${String(rows[0].n + 1).padStart(4, "0")}`;
}

/**
 * A new order. `approveUpTo` is what the person ordering may approve: null for
 * no limit, a laari amount for their spending limit, or -1n when they may not
 * approve at all.
 */
async function create(client, { companyId, userId, kind, counterpartyId, partyName, projectId, orderedOn, expectedOn, validUntil, note, lines, approveUpTo }) {
  await assumeIdentity(client, { companyId, userId });
  if (!PREFIX[kind]) throw new Error("A purchase order or a sales order?");
  if (!lines?.length) throw new Error("An order needs at least one line.");
  let party = counterpartyId;
  if (party) {
    const { rows } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [party, companyId]);
    if (!rows.length) throw new Error("That supplier or customer is not in these books.");
  } else {
    if (!String(partyName || "").trim()) throw new Error(kind === "purchase" ? "Who is it ordered from?" : "Who ordered it?");
    party = (await findOrCreate(client, { companyId, userId, name: partyName, kind: kind === "purchase" ? "supplier" : "customer" })).party.id;
  }
  if (projectId) {
    const { rows } = await client.query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2", [projectId, companyId]);
    if (!rows.length) throw new Error("That project is not in these books.");
  }
  const prepared = [];
  for (const [i, l] of lines.entries()) {
    const description = String(l.description || "").trim();
    let unit = l.unit ? String(l.unit).trim() : null;
    if (l.itemId) {
      const { rows } = await client.query("SELECT name, unit FROM stock_items WHERE id = $1 AND company_id = $2 AND archived_at IS NULL", [l.itemId, companyId]);
      if (!rows.length) throw new Error("One of those items is not in these books.");
      unit = unit || rows[0].unit;
      if (!description) l.description = rows[0].name;
    } else if (kind === "purchase") {
      if (!l.accountId) throw new Error(`Line ${i + 1}: an item from stock, or which kind of cost?`);
      const { rows } = await client.query("SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'expense'", [l.accountId, companyId]);
      if (!rows.length) throw new Error(`Line ${i + 1}: that is not one of this company's kinds of cost.`);
    }
    const units = stock.toUnits(l.quantity);
    const price = toLaari(l.unitPrice ?? 0);
    if (price < 0n) throw new Error("A price is not below zero.");
    prepared.push({ position: i, description: String(l.description || description).trim() || "Goods", itemId: l.itemId || null, accountId: l.itemId ? null : l.accountId || null, units, unit, price });
  }
  const total = prepared.reduce((a, l) => a + times(l.price, l.units), 0n);
  const selfApproved = kind !== "purchase" || approveUpTo === null || (approveUpTo !== undefined && approveUpTo >= 0n && total <= approveUpTo);
  const number = await nextNumber(client, { companyId, kind });
  const { rows } = await client.query(
    `INSERT INTO orders (company_id, kind, number, counterparty_id, project_id, ordered_on, expected_on, note, needs_approval, approved_by, approved_at, created_by, valid_until)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, current_date),$7,$8,$9,$10,$11,$12,$13) RETURNING id, number`,
    [companyId, kind, number, party, projectId || null, orderedOn || null, expectedOn || null, String(note || "").trim(), !selfApproved, selfApproved ? userId : null, selfApproved ? new Date() : null, userId, kind === "quote" ? validUntil || null : null]
  );
  for (const l of prepared) {
    await client.query(
      `INSERT INTO order_lines (company_id, order_id, position, description, item_id, account_id, quantity, unit, unit_price_laari) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [companyId, rows[0].id, l.position, l.description, l.itemId, l.accountId, stock.unitsText(l.units), l.unit, l.price.toString()]
    );
  }
  return { id: rows[0].id, number: rows[0].number, total, approved: selfApproved };
}

/** An order with each line's ordered, delivered and billed quantities, and where it stands. */
async function load(client, { companyId, orderId }) {
  const { rows } = await client.query(
    `SELECT o.*, c.name AS party, p.name AS project, u.name AS approver, cu.name AS orderer FROM orders o
       JOIN counterparties c ON c.id = o.counterparty_id LEFT JOIN projects p ON p.id = o.project_id
       LEFT JOIN users u ON u.id = o.approved_by LEFT JOIN users cu ON cu.id = o.created_by
      WHERE o.id = $1 AND o.company_id = $2`,
    [orderId, companyId]
  );
  const o = rows[0];
  if (!o) throw new Error("That order is not in these books.");
  const { rows: lines } = await client.query(
    `SELECT l.*, a.name AS account_name, i.name AS item_name,
            COALESCE((SELECT SUM(d.quantity) FROM order_delivery_lines d WHERE d.order_line_id = l.id), 0) AS delivered,
            COALESCE((SELECT SUM(b.quantity) FROM order_billed b
                       LEFT JOIN bills bl ON bl.id = b.bill_id LEFT JOIN sales_invoices s ON s.id = b.invoice_id
                      WHERE b.order_line_id = l.id AND COALESCE(bl.voided_at, s.voided_at) IS NULL), 0) AS billed
       FROM order_lines l LEFT JOIN accounts a ON a.id = l.account_id LEFT JOIN stock_items i ON i.id = l.item_id
      WHERE l.order_id = $1 ORDER BY l.position`,
    [orderId]
  );
  const out = lines.map((l) => ({
    ...l,
    units: stock.fromDb(l.quantity),
    deliveredUnits: stock.fromDb(l.delivered),
    billedUnits: stock.fromDb(l.billed),
    price: BigInt(l.unit_price_laari),
  }));
  const all = (k) => out.every((l) => l[k] >= l.units);
  const any = (k) => out.some((l) => l[k] > 0n);
  const expired = o.valid_until && new Date(o.valid_until) < new Date(localToday());
  const status = o.kind === "quote"
    ? o.accepted_at ? "accepted" : o.declined_at ? "declined" : o.cancelled_at ? "cancelled" : expired ? "expired" : "quoted"
    : o.cancelled_at
    ? "cancelled"
    : o.needs_approval && !o.approved_at
      ? "awaiting_approval"
      : o.closed_at || all("billedUnits")
        ? "done"
        : all("deliveredUnits")
          ? "delivered"
          : any("deliveredUnits")
            ? "part_delivered"
            : "open";
  return { order: o, lines: out, status, total: out.reduce((a, l) => a + times(l.price, l.units), 0n) };
}

async function approve(client, { companyId, userId, orderId, approveUpTo }) {
  await assumeIdentity(client, { companyId, userId });
  const { order, total, status } = await load(client, { companyId, orderId });
  if (status !== "awaiting_approval") throw new Error("That order is not waiting for approval.");
  if (approveUpTo !== null && total > approveUpTo) throw new Error(`MVR ${formatLaari(total)} is over your limit of MVR ${formatLaari(approveUpTo < 0n ? 0n : approveUpTo)}. Someone with a higher one has to approve it.`);
  await client.query("UPDATE orders SET approved_by = $2, approved_at = now() WHERE id = $1", [order.id, userId]);
}

/** What arrived (or went out): never more than was ordered and is still to come. */
async function deliver(client, { companyId, userId, orderId, deliveredOn, reference, note, lines }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await load(client, { companyId, orderId });
  if (s.order.kind === "quote") throw new Error("A quote is not delivered. Accept it, and deliver the sales order.");
  if (s.status === "cancelled" || s.status === "done") throw new Error("That order is finished.");
  if (s.status === "awaiting_approval") throw new Error("That order has not been approved yet. Nothing can be received against it.");
  const byId = new Map(s.lines.map((l) => [l.id, l]));
  const taking = lines.map((l) => ({ line: byId.get(l.orderLineId), units: stock.toUnits(l.quantity) }));
  for (const t of taking) {
    if (!t.line) throw new Error("That line is not on this order.");
    const left = t.line.units - t.line.deliveredUnits;
    if (t.units > left) throw new Error(`Only ${stock.unitsText(left)} of ${t.line.description} ${s.order.kind === "purchase" ? "is still to come" : "is still to go"}.`);
  }
  if (!taking.length) throw new Error("Say how many of what.");
  const { rows } = await client.query(
    `INSERT INTO order_deliveries (company_id, order_id, delivered_on, reference, note, created_by) VALUES ($1,$2,COALESCE($3::date, current_date),$4,$5,$6) RETURNING id`,
    [companyId, orderId, deliveredOn || null, reference || null, note || null, userId]
  );
  for (const t of taking) {
    await client.query("INSERT INTO order_delivery_lines (company_id, delivery_id, order_line_id, quantity) VALUES ($1,$2,$3,$4)", [companyId, rows[0].id, t.line.id, stock.unitsText(t.units)]);
  }
  return { id: rows[0].id };
}

/** Which lines, how many and at what price: by default, all that has arrived and not been billed, at the ordered price. */
function toBill(s, lines) {
  const byId = new Map(s.lines.map((l) => [l.id, l]));
  const chosen = lines?.length
    ? lines.map((l) => ({ line: byId.get(l.orderLineId), units: stock.toUnits(l.quantity), price: l.unitPrice !== undefined && l.unitPrice !== null && l.unitPrice !== "" ? toLaari(l.unitPrice) : null }))
    : s.lines.filter((l) => l.deliveredUnits > l.billedUnits).map((l) => ({ line: l, units: l.deliveredUnits - l.billedUnits, price: null }));
  if (!chosen.length) throw new Error(`Nothing has ${s.order.kind === "purchase" ? "arrived" : "gone out"} that is not already ${s.order.kind === "purchase" ? "billed" : "invoiced"}.`);
  const differences = [];
  for (const c of chosen) {
    if (!c.line) throw new Error("That line is not on this order.");
    const left = c.line.deliveredUnits - c.line.billedUnits;
    if (c.units > left) {
      throw new Error(`Only ${stock.unitsText(left)} of ${c.line.description} ${s.order.kind === "purchase" ? "has arrived and is not billed" : "has gone out and is not invoiced"}. Record the delivery first.`);
    }
    c.price = c.price ?? c.line.price;
    if (c.price !== c.line.price) differences.push(`${c.line.description}: MVR ${formatLaari(c.price)} a unit, not the MVR ${formatLaari(c.line.price)} ordered`);
    c.amount = times(c.price, c.units);
  }
  return { chosen, differences };
}

/**
 * The supplier's bill for what arrived. Made in the books ready to post, split
 * into stock and costs line by line. Prices on an order are before tax.
 */
async function billFromOrder(client, { companyId, userId, orderId, billNo, issueDate, gstTreatment = "exclusive", gstRateBp, lines }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await load(client, { companyId, orderId });
  if (s.order.kind !== "purchase") throw new Error("A sales order is invoiced, not billed.");
  if (!["exclusive", "none_unregistered", "exempt", "zero_rated"].includes(gstTreatment)) throw new Error("Order prices are before tax: GST is added on top, or there is none.");
  const { chosen, differences } = toBill(s, lines);
  const net = chosen.reduce((a, c) => a + c.amount, 0n);
  const rate = await taxEngine.rateForDocument(client, { companyId, on: issueDate, treatment: gstTreatment, printedBp: gstRateBp });
  const split = splitTax(formatLaari(net).replace(/,/g, ""), gstTreatment, rate);
  const { rows } = await client.query(
    `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp,
                        project_id, received_by, status, order_id, currency)
     VALUES ($1,$2,$3,COALESCE($4::date, current_date),$5,$6,$7,$8::gst_t,$9,$10,$11,'draft',$12,(SELECT base_currency FROM companies WHERE id = $1))
     RETURNING *`,
    [companyId, s.order.counterparty_id, billNo || null, issueDate || null, split.net.toString(), split.tax.toString(), split.gross.toString(), gstTreatment, rate, s.order.project_id, userId, orderId]
  );
  const bill = rows[0];
  await billSplit.save(client, {
    companyId, userId, billId: bill.id,
    lines: chosen.map((c) =>
      c.line.item_id
        ? { kind: "stock", description: c.line.description, itemId: c.line.item_id, quantity: stock.unitsText(c.units), amount: formatLaari(c.amount).replace(/,/g, "") }
        : { kind: "cost", description: c.line.description, accountId: c.line.account_id, amount: formatLaari(c.amount).replace(/,/g, "") }
    ).filter((l) => toLaari(l.amount) > 0n),
  });
  for (const c of chosen) {
    await client.query("INSERT INTO order_billed (company_id, order_line_id, bill_id, quantity, amount_laari) VALUES ($1,$2,$3,$4,$5)", [companyId, c.line.id, bill.id, stock.unitsText(c.units), c.amount.toString()]);
  }
  return { bill, differences };
}

/** The customer's invoice for what went out, at the ordered prices, ready to post. */
async function invoiceFromOrder(client, { companyId, userId, orderId, issueDate, gstTreatment = "exclusive", lines }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await load(client, { companyId, orderId });
  if (s.order.kind !== "sale") throw new Error("A purchase order is billed by the supplier, not invoiced.");
  const { chosen, differences } = toBill(s, lines);
  const { invoice, lines: made } = await sales.raise(client, {
    companyId, userId, counterpartyId: s.order.counterparty_id, issueDate, gstTreatment, projectId: s.order.project_id,
    subject: `Order ${s.order.number}`,
    lines: chosen.map((c) => ({
      description: c.line.description,
      quantity: Number(stock.unitsText(c.units)),
      uom: c.line.unit,
      unitPrice: formatLaari(c.price).replace(/,/g, ""),
      itemId: c.line.item_id,
      accountId: c.line.account_id,
    })),
  });
  await client.query("UPDATE sales_invoices SET order_id = $2 WHERE id = $1", [invoice.id, orderId]);
  for (const [i, c] of chosen.entries()) {
    await client.query("INSERT INTO order_billed (company_id, order_line_id, invoice_id, quantity, amount_laari) VALUES ($1,$2,$3,$4,$5)", [companyId, c.line.id, invoice.id, stock.unitsText(c.units), made[i].netLaari.toString()]);
  }
  return { invoice, differences };
}

/** A quote the customer accepted becomes a sales order with the same lines; one they declined is kept, marked so. */
async function answerQuote(client, { companyId, userId, orderId, accepted }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await load(client, { companyId, orderId });
  if (s.order.kind !== "quote") throw new Error("Only a quote is accepted or declined.");
  if (s.status !== "quoted" && s.status !== "expired") throw new Error("That quote has been answered already.");
  if (!accepted) {
    await client.query("UPDATE orders SET declined_at = now() WHERE id = $1", [orderId]);
    return {};
  }
  const made = await create(client, {
    companyId, userId, kind: "sale", counterpartyId: s.order.counterparty_id, projectId: s.order.project_id,
    note: `From quote ${s.order.number}`,
    lines: s.lines.map((l) => ({ description: l.description, itemId: l.item_id, accountId: l.account_id, quantity: stock.unitsText(l.units), unit: l.unit, unitPrice: formatLaari(l.price).replace(/,/g, "") })),
  });
  await client.query("UPDATE orders SET accepted_at = now(), became_order_id = $2 WHERE id = $1", [orderId, made.id]);
  return made;
}

async function finish(client, { companyId, userId, orderId, how }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await load(client, { companyId, orderId });
  if (s.status === "cancelled") throw new Error("That order is cancelled already.");
  if (how === "cancel" && s.lines.some((l) => l.deliveredUnits > 0n)) throw new Error("Something has been delivered against it. Close it instead: what is still to come will not be expected.");
  await client.query(`UPDATE orders SET ${how === "cancel" ? "cancelled_at" : "closed_at"} = now() WHERE id = $1`, [orderId]);
}

function show(s) {
  const f = formatLaari;
  return {
    id: s.order.id,
    kind: s.order.kind,
    number: s.order.number,
    party: s.order.party,
    partyId: s.order.counterparty_id,
    project: s.order.project,
    projectId: s.order.project_id,
    orderedOn: s.order.ordered_on,
    validUntil: s.order.valid_until,
    becameOrderId: s.order.became_order_id,
    expectedOn: s.order.expected_on,
    note: s.order.note,
    status: s.status,
    orderer: s.order.orderer,
    approver: s.order.approver,
    supplierConfirmed: s.order.supplier_confirmed_at ? { at: s.order.supplier_confirmed_at, by: s.order.supplier_confirmed_by, expected: s.order.supplier_expected_on, note: s.order.supplier_note } : null,
    total: f(s.total),
    delivered: f(s.lines.reduce((a, l) => a + times(l.price, l.deliveredUnits), 0n)),
    billed: f(s.lines.reduce((a, l) => a + times(l.price, l.billedUnits), 0n)),
    lines: s.lines.map((l) => ({
      id: l.id, description: l.description, item: l.item_name, account: l.account_name, unit: l.unit,
      quantity: stock.unitsText(l.units), delivered: stock.unitsText(l.deliveredUnits), billed: stock.unitsText(l.billedUnits),
      price: f(l.price), amount: f(times(l.price, l.units)),
    })),
  };
}

async function list(client, { companyId, kind }) {
  const { rows } = await client.query("SELECT id FROM orders WHERE company_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY created_at DESC LIMIT 200", [companyId, kind || null]);
  const out = [];
  for (const r of rows) out.push(show(await load(client, { companyId, orderId: r.id })));
  return out;
}

/**
 * What approved purchase orders on a project still commit it to: each line's
 * ordered value not yet billed, by kind of cost (stock items count as materials).
 */
async function committedOn(client, { companyId, projectId }) {
  const { rows } = await client.query(
    "SELECT id FROM orders WHERE company_id = $1 AND project_id = $2 AND kind = 'purchase' AND cancelled_at IS NULL AND closed_at IS NULL AND (NOT needs_approval OR approved_at IS NOT NULL)",
    [companyId, projectId]
  );
  const out = [];
  for (const r of rows) {
    const s = await load(client, { companyId, orderId: r.id });
    for (const l of s.lines) {
      const open = l.units > l.billedUnits ? times(l.price, l.units - l.billedUnits) : 0n;
      if (open > 0n) out.push({ orderId: s.order.id, number: s.order.number, supplier: s.order.party, description: l.description, accountId: l.account_id, open, amount: times(l.price, l.units), billed: times(l.price, l.billedUnits) });
    }
  }
  return out;
}

module.exports = { times, answerQuote, create, load, approve, deliver, billFromOrder, invoiceFromOrder, finish, show, list, committedOn, nextNumber };
