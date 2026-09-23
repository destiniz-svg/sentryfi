/**
 * Shipments and landed cost. See config/shipment-schema.js for the shape.
 *
 * Every cost of landing a shipment (freight on the supplier's invoice, the
 * clearing agent's bill, Customs duty, the bank's transfer or LC charges)
 * waits on 1360 until it is shared over the shipment's goods. Sharing is by
 * value, by quantity (tons, for steel), or by container space: each
 * container's share by its CBM, then shared within it by value.
 *
 * Each item's share goes onto its stock value, raising its average cost; the
 * part belonging to units already sold goes to cost of goods sold instead,
 * because those goods are gone (IAS 2). Sharing can happen as often as costs
 * arrive: only what is still waiting is shared each time.
 *
 * ponytail: "already sold" is judged from what is on hand now against what
 * the shipment brought in, not by tracing each unit. Exact for a shipment
 * that is sold from after it lands, which is the usual order.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari, allocate: share } = require("./money");
const stock = require("./stock");

const WAITING = ["1360", "Landing costs waiting to be shared", "asset"];
const KINDS = ["freight", "clearing", "duty", "bank", "other"];

async function account(client, companyId, spec) {
  return stock.account(client, companyId, spec);
}

/** What kind of landing cost a line reads as, for the shipment's list. */
function kindOf(description) {
  const d = String(description || "").toLowerCase();
  if (/freight|shipping|ocean|sea|air ?way|cnf|c&f/.test(d)) return "freight";
  if (/duty|customs duty|tariff/.test(d)) return "duty";
  if (/clear|customs|port|handling|form|transport|labou?r|delivery order|demurrage/.test(d)) return "clearing";
  if (/bank|lc |letter of credit|swift|tt |telegraphic|remittance|commission/.test(d)) return "bank";
  return "other";
}

async function create(client, { companyId, userId, reference, description, basis = "value", arrivedOn, containers = [] }) {
  await assumeIdentity(client, { companyId, userId });
  const ref = String(reference || "").trim();
  if (!ref) throw new Error("Give it the bill of lading number, or whatever you call this shipment.");
  if (!["value", "quantity", "cbm"].includes(basis)) throw new Error("Share costs by value, by quantity, or by container space.");
  const { rows } = await client.query(
    `INSERT INTO shipments (company_id, reference, description, basis, arrived_on, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [companyId, ref, String(description || "").trim(), basis, arrivedOn || null, userId]
  );
  for (const c of containers) await addContainer(client, { companyId, shipmentId: rows[0].id, ...c });
  return rows[0].id;
}

async function addContainer(client, { companyId, shipmentId, number, size, cbm, weightKg }) {
  if (!String(number || "").trim()) throw new Error("Each container needs its number.");
  const { rows } = await client.query(
    `INSERT INTO shipment_containers (company_id, shipment_id, number, size, cbm, weight_kg) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [companyId, shipmentId, String(number).trim().toUpperCase(), size || null, cbm ? String(cbm) : null, weightKg ? String(weightKg) : null]
  );
  return rows[0].id;
}

async function shipment(client, { companyId, shipmentId }) {
  const { rows } = await client.query("SELECT * FROM shipments WHERE id = $1 AND company_id = $2", [shipmentId, companyId]);
  if (!rows[0]) throw new Error("That shipment is not in these books.");
  return rows[0];
}

/** Says a bill is part of a shipment: its stock lines are the shipment's goods. */
async function linkBill(client, { companyId, userId, shipmentId, billId }) {
  await assumeIdentity(client, { companyId, userId });
  if (shipmentId) await shipment(client, { companyId, shipmentId });
  const { rowCount } = await client.query("UPDATE bills SET shipment_id = $3, updated_at = now() WHERE id = $1 AND company_id = $2", [billId, companyId, shipmentId || null]);
  if (!rowCount) throw new Error("That bill is not in these books.");
}

/** A goods line's container, for sharing by container space. */
async function placeInContainer(client, { companyId, shipmentId, lineId, containerId }) {
  if (containerId) {
    const { rows } = await client.query("SELECT 1 FROM shipment_containers WHERE id = $1 AND shipment_id = $2 AND company_id = $3", [containerId, shipmentId, companyId]);
    if (!rows.length) throw new Error("That container is not on this shipment.");
  }
  const { rowCount } = await client.query(
    `UPDATE bill_stock_lines l SET container_id = $4 FROM bills b
      WHERE l.id = $1 AND l.company_id = $2 AND b.id = l.bill_id AND b.shipment_id = $3`,
    [lineId, companyId, shipmentId, containerId || null]
  );
  if (!rowCount) throw new Error("That line is not among this shipment's goods.");
}

/**
 * A landing cost paid straight from the bank or a cash tin: Customs duty, the
 * bank's charges. Import GST paid at Customs is claimed back by a registered
 * company, so it goes to GST we can claim; for anyone else it is a cost of
 * the goods like the duty.
 */
async function payDirect(client, { companyId, userId, shipmentId, kind, description, amount, gstAmount, fromAccountId, on }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await shipment(client, { companyId, shipmentId });
  if (!KINDS.includes(kind)) throw new Error("What kind of cost is it?");
  const value = toLaari(amount || 0);
  const gst = gstAmount ? toLaari(gstAmount) : 0n;
  if (value < 0n || gst < 0n || value + gst <= 0n) throw new Error("How much was paid?");
  const { rows: from } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND type IN ('asset','liability')", [fromAccountId, companyId]);
  if (!from[0]) throw new Error("Paid from which account?");
  const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  const claim = gst > 0n && co[0]?.gst_registered;
  const landed = value + (claim ? 0n : gst);
  const waiting = await account(client, companyId, WAITING);
  const memo = `${s.reference}: ${String(description || kind).trim()}`;
  const lines = [];
  if (landed > 0n) lines.push({ accountId: waiting, debit: landed, memo });
  if (claim) {
    const { rows: tax } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = '1400'", [companyId]);
    if (!tax[0]) throw new Error("This company has no account for GST it can claim.");
    lines.push({ accountId: tax[0].id, debit: gst, memo: `${s.reference}: GST paid at Customs` });
  }
  lines.push({ accountId: from[0].id, credit: value + gst, memo });
  const entry = await postEntry(client, { companyId, userId, date: on, source: "adjustment", narrative: memo, lines });
  if (landed > 0n) {
    await client.query(
      `INSERT INTO shipment_costs (company_id, shipment_id, kind, description, value_laari, entry_id, paid_on, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [companyId, shipmentId, kind, String(description || "").trim(), landed.toString(), entry.id, on, userId]
    );
  }
  return { entry, landed, claimed: claim ? gst : 0n };
}

/** The shipment's goods: stock lines of its bills in the books, at their own-currency value. */
async function goods(client, { companyId, shipmentId }) {
  const billSplit = require("./billSplit");
  const { rows: bills } = await client.query("SELECT * FROM bills WHERE company_id = $1 AND shipment_id = $2 AND status = 'posted'", [companyId, shipmentId]);
  const out = [];
  for (const bill of bills) {
    const { parts } = await billSplit.load(client, { companyId, bill });
    for (const p of parts.filter((x) => x.kind === "stock")) out.push({ ...p, billId: bill.id, billNo: bill.bill_no });
  }
  return out;
}

/** How a total is shared over goods lines, by the shipment's basis. */
async function shares(client, { companyId, shipment: s, lines, total }) {
  if (!lines.length) throw new Error("This shipment has no goods in the books yet. Link the supplier's bill, with its items, and put it in the books.");
  if (s.basis === "value") return share(total, lines.map((l) => l.value));
  if (s.basis === "quantity") return share(total, lines.map((l) => l.units));
  const { rows: boxes } = await client.query("SELECT id, number, cbm FROM shipment_containers WHERE shipment_id = $1 AND company_id = $2", [s.id, companyId]);
  if (!boxes.length || boxes.some((b) => !b.cbm)) throw new Error("To share by container space, every container needs its CBM.");
  const loose = lines.filter((l) => !l.containerId);
  if (loose.length) throw new Error(`Say which container ${loose[0].name} came in, to share by container space.`);
  const used = boxes.filter((b) => lines.some((l) => l.containerId === b.id));
  const perBox = share(total, used.map((b) => BigInt(Math.round(Number(b.cbm) * 1000))));
  const out = new Array(lines.length).fill(0n);
  used.forEach((b, i) => {
    const idx = lines.map((l, j) => (l.containerId === b.id ? j : -1)).filter((j) => j >= 0);
    const within = share(perBox[i], idx.map((j) => lines[j].value));
    idx.forEach((j, k) => (out[j] = within[k]));
  });
  return out;
}

/** Shares every landing cost still waiting over the goods, and posts it. */
async function allocateCosts(client, { companyId, userId, shipmentId, on }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await shipment(client, { companyId, shipmentId });
  await client.query("SELECT id FROM shipments WHERE id = $1 FOR UPDATE", [shipmentId]);
  const { rows: pending } = await client.query("SELECT id, value_laari FROM shipment_costs WHERE shipment_id = $1 AND company_id = $2 AND allocation_id IS NULL", [shipmentId, companyId]);
  const total = pending.reduce((a, c) => a + BigInt(c.value_laari), 0n);
  if (total === 0n) throw new Error("No landing costs are waiting on this shipment.");
  const lines = await goods(client, { companyId, shipmentId });
  const parts = await shares(client, { companyId, shipment: s, lines, total });

  // By item: what the shipment brought in, and its share of the costs.
  const byItem = new Map();
  lines.forEach((l, i) => {
    const e = byItem.get(l.itemId) || { itemId: l.itemId, name: l.name, unit: l.unit, units: 0n, share: 0n };
    e.units += l.units;
    e.share += parts[i];
    byItem.set(l.itemId, e);
  });

  const stockAcc = await account(client, companyId, stock.ACCOUNTS.stock);
  const cogsAcc = await account(client, companyId, stock.ACCOUNTS.cogs);
  const waiting = await account(client, companyId, WAITING);
  const entryLines = [];
  const moves = [];
  let sold = 0n;
  for (const e of byItem.values()) {
    if (e.share === 0n) continue;
    const held = await stock.holding(client, { companyId, itemId: e.itemId });
    const onHand = held.units < 0n ? 0n : held.units;
    const kept = onHand >= e.units ? e.share : (e.share * onHand) / e.units;
    if (kept > 0n) {
      entryLines.push({ accountId: stockAcc, debit: kept, memo: `${s.reference}: landing costs on ${e.name}` });
      moves.push({ itemId: e.itemId, value: kept });
    }
    sold += e.share - kept;
  }
  if (sold > 0n) entryLines.push({ accountId: cogsAcc, debit: sold, memo: `${s.reference}: landing costs on goods already sold` });
  entryLines.push({ accountId: waiting, credit: total, memo: `${s.reference}: landing costs shared by ${s.basis}` });

  const entry = await postEntry(client, { companyId, userId, date: on, source: "stock", narrative: `${s.reference}: landing costs into the goods`, lines: entryLines });
  const { rows: alloc } = await client.query(
    `INSERT INTO shipment_allocations (company_id, shipment_id, basis, amount_laari, entry_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [companyId, shipmentId, s.basis, total.toString(), entry.id, userId]
  );
  await client.query("UPDATE shipment_costs SET allocation_id = $1 WHERE id = ANY($2::uuid[])", [alloc[0].id, pending.map((p) => p.id)]);
  for (const m of moves) {
    await client.query(
      `INSERT INTO stock_moves (company_id, item_id, moved_on, kind, quantity, value_laari, entry_id, shipment_id, note, created_by)
       VALUES ($1,$2,$3,'landed',0,$4,$5,$6,$7,$8)`,
      [companyId, m.itemId, on, m.value.toString(), entry.id, shipmentId, `Landing costs, ${s.reference}`, userId]
    );
  }
  return { entry, total, soldShare: sold };
}

/** A reversed bill's landing costs come off the shipment, unless already shared out. */
async function undoBillCosts(client, { companyId, billId }) {
  const { rows } = await client.query("SELECT id, allocation_id FROM shipment_costs WHERE company_id = $1 AND bill_id = $2", [companyId, billId]);
  if (rows.some((r) => r.allocation_id)) throw new Error("Its landing costs have been shared into the goods already. Record a credit from the supplier instead.");
  await client.query("DELETE FROM shipment_costs WHERE company_id = $1 AND bill_id = $2", [companyId, billId]);
}

/** Every shipment, with its goods value, its landing costs, and the share of one on the other. */
async function list(client, { companyId }) {
  const { rows } = await client.query("SELECT * FROM shipments WHERE company_id = $1 ORDER BY created_at DESC", [companyId]);
  const out = [];
  for (const s of rows) out.push(await summary(client, { companyId, shipment: s }));
  return out;
}

async function summary(client, { companyId, shipment: s }) {
  const lines = await goods(client, { companyId, shipmentId: s.id });
  const { rows: costs } = await client.query(
    `SELECT c.*, b.bill_no FROM shipment_costs c LEFT JOIN bills b ON b.id = c.bill_id
      WHERE c.shipment_id = $1 AND c.company_id = $2 ORDER BY c.paid_on, c.created_at`,
    [s.id, companyId]
  );
  const { rows: boxes } = await client.query("SELECT id, number, size, cbm, weight_kg FROM shipment_containers WHERE shipment_id = $1 AND company_id = $2 ORDER BY number", [s.id, companyId]);
  const { rows: bills } = await client.query(
    `SELECT b.id, b.bill_no, b.status, b.gross_laari, c.name AS supplier FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.shipment_id = $2 AND b.voided_at IS NULL ORDER BY b.issue_date`,
    [companyId, s.id]
  );
  const goodsValue = lines.reduce((a, l) => a + l.value, 0n);
  const landed = costs.reduce((a, c) => a + BigInt(c.value_laari), 0n);
  const waiting = costs.filter((c) => !c.allocation_id).reduce((a, c) => a + BigInt(c.value_laari), 0n);
  const byItem = new Map();
  for (const l of lines) {
    const e = byItem.get(l.itemId) || { itemId: l.itemId, name: l.name, unit: l.unit, units: 0n, value: 0n };
    e.units += l.units;
    e.value += l.value;
    byItem.set(l.itemId, e);
  }
  // What each unit comes to with every landing cost shared by value: a guide
  // to pricing, whatever basis is chosen for the books.
  const pct = goodsValue > 0n ? Number((landed * 10000n) / goodsValue) / 100 : null;
  return {
    id: s.id,
    reference: s.reference,
    description: s.description,
    basis: s.basis,
    arrivedOn: s.arrived_on,
    closed: Boolean(s.closed_at),
    goodsValue: formatLaari(goodsValue),
    landed: formatLaari(landed),
    waiting: formatLaari(waiting),
    landedPercent: pct,
    containers: boxes.map((b) => ({ id: b.id, number: b.number, size: b.size, cbm: b.cbm === null ? null : Number(b.cbm), weightKg: b.weight_kg === null ? null : Number(b.weight_kg) })),
    bills: bills.map((b) => ({ id: b.id, billNo: b.bill_no, supplier: b.supplier, status: b.status, gross: formatLaari(BigInt(b.gross_laari)) })),
    goods: lines.map((l) => ({ lineId: l.lineId, billNo: l.billNo, itemId: l.itemId, name: l.name, unit: l.unit, quantity: stock.unitsText(l.units), value: formatLaari(l.value), containerId: l.containerId || null })),
    items: [...byItem.values()].map((e) => {
      const withCosts = goodsValue > 0n ? e.value + (landed * e.value) / goodsValue : e.value;
      return {
        itemId: e.itemId, name: e.name, unit: e.unit, quantity: stock.unitsText(e.units), value: formatLaari(e.value),
        perUnit: e.units > 0n ? formatLaari((e.value * 10000n) / e.units) : null,
        perUnitLanded: e.units > 0n ? formatLaari((withCosts * 10000n) / e.units) : null,
      };
    }),
    costs: costs.map((c) => ({ id: c.id, kind: c.kind, description: c.description, value: formatLaari(BigInt(c.value_laari)), billNo: c.bill_no, paidOn: c.paid_on, shared: Boolean(c.allocation_id) })),
  };
}

async function open(client, { companyId }) {
  const { rows } = await client.query("SELECT id, reference FROM shipments WHERE company_id = $1 AND closed_at IS NULL ORDER BY created_at DESC", [companyId]);
  return rows;
}

module.exports = { WAITING, KINDS, kindOf, create, addContainer, shipment, linkBill, placeInContainer, payDirect, goods, allocateCosts, undoBillCosts, list, summary, open, account };
