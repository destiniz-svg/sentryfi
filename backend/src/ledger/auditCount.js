/**
 * The auditor at the year-end count (ISA 501).
 *
 * The auditor attends one of the company's blind counts. On arrival the
 * cut-off is captured from what the books hold at that moment: the last goods
 * received and despatched, the last bill and invoice, the last stock move.
 * The auditor makes their own test counts, both ways: sheet to floor, from
 * items the system picks off the count sheet (the most valuable, and some at
 * random from a kept seed), to test that what is recorded exists; and floor
 * to sheet, from items seen on the floor, to test that what exists is
 * recorded. The test counts are the auditor's alone (a database policy), so
 * nobody counting can copy them; once the company's count is submitted, each
 * is set against what the counter found and what the books said.
 */
const crypto = require("crypto");
const { assumeIdentity } = require("./post");
const { formatLaari } = require("./money");
const stock = require("./stock");
const { today } = require("./today");

const f = (laari) => formatLaari(BigInt(laari));
const rank = (seed, id) => crypto.createHash("sha256").update(`${seed}:${id}`).digest("hex");

async function periodRow(client, companyId, periodId) {
  const { rows } = await client.query("SELECT *, from_date::text AS from_text, to_date::text AS to_text FROM audit_periods WHERE id = $1 AND company_id = $2", [periodId, companyId]);
  if (!rows[0]) throw new Error("No such period under audit here.");
  return rows[0];
}

/** The company's counts around the period end, to attend. */
async function near(client, { companyId, periodId }) {
  const p = await periodRow(client, companyId, periodId);
  const { rows } = await client.query(
    `SELECT c.id, c.kind, c.status, c.created_at, c.submitted_at, COALESCE(pl.name, 'Main store') AS place, u.name AS counter,
            (SELECT COUNT(*)::int FROM stock_count_lines l WHERE l.count_id = c.id) AS lines,
            o.id AS observation_id
       FROM stock_counts c LEFT JOIN stock_places pl ON pl.id = c.place_id JOIN users u ON u.id = c.counter
       LEFT JOIN audit_observations o ON o.count_id = c.id AND o.period_id = $2
      WHERE c.company_id = $1 AND c.status <> 'cancelled'
        AND (c.created_at AT TIME ZONE 'Indian/Maldives')::date BETWEEN $3::date - 21 AND $3::date + 21
      ORDER BY c.created_at DESC`,
    [companyId, periodId, p.to_text]
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, place: r.place, counter: r.counter, lines: r.lines, createdAt: r.created_at, submittedAt: r.submitted_at, observationId: r.observation_id }));
}

/** What the books held when the auditor arrived: the documents to test the cut-off against. */
async function captureCutoff(client, companyId) {
  const one = async (sql) => (await client.query(sql, [companyId])).rows[0] || null;
  return {
    at: new Date().toISOString(),
    goodsIn: await one("SELECT o.number AS order_no, d.delivered_on::text AS day, d.created_at FROM order_deliveries d JOIN orders o ON o.id = d.order_id WHERE d.company_id = $1 AND o.kind = 'purchase' ORDER BY d.created_at DESC LIMIT 1"),
    goodsOut: await one("SELECT o.number AS order_no, d.delivered_on::text AS day, d.created_at FROM order_deliveries d JOIN orders o ON o.id = d.order_id WHERE d.company_id = $1 AND o.kind = 'sale' ORDER BY d.created_at DESC LIMIT 1"),
    bill: await one("SELECT bill_no AS no, COALESCE(issue_date, received_at::date)::text AS day, received_at AS created_at FROM bills WHERE company_id = $1 AND voided_at IS NULL ORDER BY received_at DESC LIMIT 1"),
    invoice: await one("SELECT invoice_no AS no, issue_date::text AS day, created_at FROM sales_invoices WHERE company_id = $1 AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1"),
    move: await one("SELECT m.kind, i.name AS item, m.moved_on::text AS day, m.created_at FROM stock_moves m JOIN stock_items i ON i.id = m.item_id WHERE m.company_id = $1 ORDER BY m.created_at DESC LIMIT 1"),
  };
}

/**
 * Attends a count: captures the cut-off and picks the sheet-to-floor tests,
 * half the most valuable items on the sheet at the place and half at random.
 */
async function observe(client, { companyId, userId, periodId, countId, picks = 10 }) {
  await assumeIdentity(client, { companyId, userId });
  await periodRow(client, companyId, periodId);
  const { rows: c } = await client.query("SELECT id, place_id, status FROM stock_counts WHERE id = $1 AND company_id = $2", [countId, companyId]);
  if (!c[0]) throw new Error("That count is not in these books.");
  if (c[0].status === "cancelled") throw new Error("That count was cancelled.");
  const { rows: seen } = await client.query("SELECT id FROM audit_observations WHERE period_id = $1 AND count_id = $2", [periodId, countId]);
  if (seen[0]) return { id: seen[0].id, again: true };
  const seed = crypto.randomBytes(8).toString("hex");
  const { rows } = await client.query(
    "INSERT INTO audit_observations (company_id, period_id, count_id, observed_by, cutoff, seed) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id",
    [companyId, periodId, countId, userId, JSON.stringify(await captureCutoff(client, companyId)), seed]
  );
  const id = rows[0].id;
  const { rows: sheet } = await client.query("SELECT item_id FROM stock_count_lines WHERE count_id = $1", [countId]);
  const onSheet = new Set(sheet.map((l) => l.item_id));
  const snap = await stock.snapshot(client, { companyId, on: today(), from: today() });
  const here = (snap.places.find((pl) => pl.id === stock.placeKey(c[0].place_id))?.items || []).filter((i) => onSheet.has(i.itemId));
  const byValue = [...here].sort((a, b) => Number(b.value.replace(/,/g, "")) - Number(a.value.replace(/,/g, "")));
  const top = byValue.slice(0, Math.ceil(picks / 2));
  const rest = here.filter((i) => !top.includes(i)).sort((a, b) => (rank(seed, a.itemId) < rank(seed, b.itemId) ? -1 : 1)).slice(0, picks - top.length);
  for (const [i, why] of [...top.map((i) => [i, "Among the most valuable on the sheet"]), ...rest.map((i) => [i, "At random from the sheet"])]) {
    await client.query("INSERT INTO audit_test_counts (company_id, observation_id, item_id, direction, picked_why) VALUES ($1,$2,$3,'sheet_to_floor',$4)", [companyId, id, i.itemId, why]);
  }
  return { id, picked: top.length + rest.length };
}

/** A test count: a picked sheet item counted on the floor, or an item seen on the floor added. */
async function record(client, { companyId, userId, observationId, itemId, direction, qty, note }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows: o } = await client.query("SELECT id, concluded_at FROM audit_observations WHERE id = $1 AND company_id = $2", [observationId, companyId]);
  if (!o[0]) throw new Error("No such count attended here.");
  if (o[0].concluded_at) throw new Error("The count's conclusion is written; it is kept as it was.");
  const q = stock.toUnitsOrNone(qty);
  if (q === null || q < 0n) throw new Error("Say how many you counted.");
  if (!["sheet_to_floor", "floor_to_sheet"].includes(direction)) throw new Error("Sheet to floor, or floor to sheet.");
  const { rows: it } = await client.query("SELECT id FROM stock_items WHERE id = $1 AND company_id = $2", [itemId, companyId]);
  if (!it[0]) throw new Error("That item is not in these books.");
  await client.query(
    `INSERT INTO audit_test_counts (company_id, observation_id, item_id, direction, qty, recorded_by, recorded_at, note)
     VALUES ($1,$2,$3,$4,$5,$6,now(),$7)
     ON CONFLICT (observation_id, item_id, direction) DO UPDATE SET qty = EXCLUDED.qty, recorded_by = EXCLUDED.recorded_by, recorded_at = now(), note = EXCLUDED.note`,
    [companyId, observationId, itemId, direction, stock.unitsText(q), userId, String(note || "").trim().slice(0, 300) || null]
  );
  return { ok: true };
}

/**
 * The attended count as the auditor reads it: cut-off, each test count, and,
 * once the company's count is submitted, what the counter and the books said
 * for the same item, with the difference and its value; and the documents
 * dated before the count but entered after the auditor arrived.
 */
async function view(client, { companyId, observationId }) {
  const { rows } = await client.query(
    `SELECT o.*, c.status AS count_status, c.place_id, COALESCE(pl.name, 'Main store') AS place, u.name AS counter, ob.name AS observer,
            (c.created_at AT TIME ZONE 'Indian/Maldives')::date::text AS count_day
       FROM audit_observations o JOIN stock_counts c ON c.id = o.count_id LEFT JOIN stock_places pl ON pl.id = c.place_id
       JOIN users u ON u.id = c.counter JOIN users ob ON ob.id = o.observed_by
      WHERE o.id = $1 AND o.company_id = $2`,
    [observationId, companyId]
  );
  const o = rows[0];
  if (!o) throw new Error("No such count attended here.");
  const counted = o.count_status === "submitted" || o.count_status === "posted";
  const { rows: tests } = await client.query(
    `SELECT t.*, i.name, i.unit, l.counted, l.book, (l.item_id IS NOT NULL) AS on_sheet
       FROM audit_test_counts t JOIN stock_items i ON i.id = t.item_id
       LEFT JOIN stock_count_lines l ON l.count_id = $3 AND l.item_id = t.item_id
      WHERE t.observation_id = $1 AND t.company_id = $2
      ORDER BY t.direction DESC, lower(i.name)`,
    [observationId, companyId, o.count_id]
  );
  const costs = new Map((await stock.list(client, { companyId })).map((i) => [i.id, i]));
  const unitCost = (itemId) => {
    const i = costs.get(itemId);
    const q = i ? Number(i.onHand.replace(/,/g, "")) : 0;
    return q > 0 ? Number(i.value.replace(/,/g, "")) / q : 0;
  };
  let wrong = 0;
  let wrongValue = 0;
  const out = tests.map((t) => {
    const mine = t.qty === null ? null : stock.fromDb(t.qty);
    const theirs = counted && t.counted !== null ? stock.fromDb(t.counted) : null;
    let finding = null;
    if (mine !== null && counted) {
      if (!t.on_sheet) finding = { kind: "missing", said: "On the floor but not on the count sheet: the count is incomplete." };
      else if (theirs === null) finding = { kind: "uncounted", said: "On the sheet but the counter did not count it." };
      else if (theirs !== mine) {
        const diff = Number(stock.unitsText(theirs - mine));
        finding = { kind: "differs", said: `The counter found ${stock.unitsText(theirs)}, the auditor ${stock.unitsText(mine)}: ${diff > 0 ? "over" : "under"}counted by ${stock.unitsText(theirs > mine ? theirs - mine : mine - theirs)} ${t.unit}.`, value: Math.abs(diff) * unitCost(t.item_id) };
      } else finding = { kind: "agrees", said: "Agrees with the count." };
      if (finding.kind !== "agrees") {
        wrong += 1;
        wrongValue += finding.value || 0;
      }
    }
    return {
      id: t.id, itemId: t.item_id, name: t.name, unit: t.unit, direction: t.direction, why: t.picked_why,
      qty: mine === null ? null : stock.unitsText(mine), note: t.note, recordedAt: t.recorded_at,
      counted: theirs === null ? null : stock.unitsText(theirs), book: counted && t.book !== null ? stock.unitsText(stock.fromDb(t.book)) : null,
      finding: finding ? { ...finding, value: finding.value ? finding.value.toFixed(2) : null } : null,
    };
  });
  // Dated before the count, entered after the auditor arrived: the cut-off to look at.
  const { rows: late } = await client.query(
    `SELECT 'Bill' AS what, bill_no AS no, COALESCE(issue_date, received_at::date)::text AS day, received_at AS entered FROM bills
      WHERE company_id = $1 AND voided_at IS NULL AND COALESCE(issue_date, received_at::date) <= $2 AND received_at > $3
     UNION ALL
     SELECT 'Invoice', invoice_no, issue_date::text, created_at FROM sales_invoices WHERE company_id = $1 AND voided_at IS NULL AND issue_date <= $2 AND created_at > $3
     UNION ALL
     SELECT CASE o.kind WHEN 'purchase' THEN 'Goods received' ELSE 'Goods despatched' END, o.number, d.delivered_on::text, d.created_at
       FROM order_deliveries d JOIN orders o ON o.id = d.order_id WHERE d.company_id = $1 AND d.delivered_on <= $2 AND d.created_at > $3
     ORDER BY entered`,
    [companyId, o.count_day, o.started_at]
  );
  const done = out.filter((t) => t.qty !== null).length;
  return {
    id: o.id, periodId: o.period_id, countId: o.count_id, place: o.place, counter: o.counter, observer: o.observer, countStatus: o.count_status, countDay: o.count_day,
    startedAt: o.started_at, cutoff: o.cutoff, seed: o.seed, instructions: o.instructions, conclusion: o.conclusion, concludedAt: o.concluded_at,
    tests: out, summary: { tests: out.length, done, wrong, wrongValue: wrongValue.toFixed(2), counted },
    cutoffExceptions: late.map((r) => ({ what: r.what, no: r.no, day: r.day, entered: r.entered })),
  };
}

/** The auditor's notes on the count instructions, and the conclusion. Once concluded, the tests stand as they are. */
async function conclude(client, { companyId, userId, observationId, instructions, conclusion }) {
  await assumeIdentity(client, { companyId, userId });
  const done = String(conclusion || "").trim();
  if (done && done.length < 3) throw new Error("Say what the count showed.");
  const { rowCount } = await client.query(
    "UPDATE audit_observations SET instructions = COALESCE($3, instructions), conclusion = COALESCE($4, conclusion), concluded_at = CASE WHEN $4 IS NULL THEN concluded_at ELSE now() END WHERE id = $1 AND company_id = $2 AND concluded_at IS NULL",
    [observationId, companyId, String(instructions || "").trim().slice(0, 2000) || null, done.slice(0, 2000) || null]
  );
  if (!rowCount) throw new Error("That count's conclusion is written already.");
  return { ok: true };
}

/** The period's attended counts. The company sees that the auditor attended; the tests stay with the auditor. */
async function list(client, { companyId, periodId }) {
  const { rows } = await client.query(
    `SELECT o.id, o.started_at, o.concluded_at, c.status AS count_status, COALESCE(pl.name, 'Main store') AS place, u.name AS observer,
            (SELECT COUNT(*)::int FROM audit_test_counts t WHERE t.observation_id = o.id) AS tests,
            (SELECT COUNT(*)::int FROM audit_test_counts t WHERE t.observation_id = o.id AND t.qty IS NOT NULL) AS done
       FROM audit_observations o JOIN stock_counts c ON c.id = o.count_id LEFT JOIN stock_places pl ON pl.id = c.place_id JOIN users u ON u.id = o.observed_by
      WHERE o.company_id = $1 AND o.period_id = $2 ORDER BY o.started_at DESC`,
    [companyId, periodId]
  );
  return rows.map((r) => ({ id: r.id, place: r.place, observer: r.observer, startedAt: r.started_at, concludedAt: r.concluded_at, countStatus: r.count_status, tests: r.tests, done: r.done }));
}

module.exports = { near, observe, record, view, conclude, list };
