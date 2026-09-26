/**
 * Counting sessions, blind.
 *
 * Three kinds, one flow. A full count takes every item at a place; a cycle
 * count takes the items due, by how much of the value they carry (A monthly,
 * B quarterly, C yearly); a spot check takes a few at random, leaning to value
 * and to what was short before, counted by someone other than the place's
 * person in charge. The counter enters what is there; the books' figure at
 * that place is kept at that moment and shown to nobody until the count is
 * submitted. Differences within the company's tolerance post at once, as a
 * count does; any beyond it waits for a second person.
 */
const { randomInt } = require("node:crypto");
const { assumeIdentity } = require("./post");
const { formatLaari } = require("./money");
const { today: localToday } = require("./today");
const stock = require("./stock");

const { fromDb, unitsText, toUnitsOrNone, placeKey, MAIN } = stock;
const EVERY = { A: 30, B: 90, C: 365 }; // days between counts, by value class
const SPOT = 5; // items in a spot check
const CYCLE = 12; // at most, in one cycle count
const KINDS = { full: "Full count", cycle: "Cycle count", spot: "Spot check" };
const addDays = (d, n) => new Date(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function tolerance(client, companyId) {
  const { rows } = await client.query("SELECT count_tolerance_laari AS t FROM companies WHERE id = $1", [companyId]);
  return BigInt(rows[0]?.t ?? 50000);
}

/** Each item's value class: A for the items making the first 80% of the value, B the next 15%, C the rest. */
async function classes(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT item_id, SUM(value_laari) AS v FROM stock_moves WHERE company_id = $1 GROUP BY item_id HAVING SUM(value_laari) > 0 ORDER BY SUM(value_laari) DESC",
    [companyId]
  );
  const total = rows.reduce((a, r) => a + BigInt(r.v), 0n);
  const out = new Map();
  let before = 0n;
  for (const r of rows) {
    out.set(r.item_id, before * 100n < total * 80n ? "A" : before * 100n < total * 95n ? "B" : "C");
    before += BigInt(r.v);
  }
  return out;
}

/** What is at each place now (or at the end of `on`), keyed "item|place". */
async function held(client, { companyId, on }) {
  const { rows } = await client.query(`SELECT item, place, SUM(q) AS q FROM (${stock.WHERE({ on: "$2" })}) x GROUP BY item, place`, [companyId, on]);
  return new Map(rows.map((r) => [`${r.item}|${placeKey(r.place)}`, fromDb(r.q)]));
}

/**
 * Items at each place and when each is next due a count: from its last count
 * there (a posted line, or a counted move), or from when it first came there.
 */
async function due(client, { companyId, on = localToday() }) {
  const cls = await classes(client, { companyId });
  const at = await held(client, { companyId, on });
  const { rows: items } = await client.query("SELECT id, name, unit FROM stock_items WHERE company_id = $1 AND counted", [companyId]);
  const names = new Map(items.map((i) => [i.id, i]));
  const { rows: last } = await client.query(
    `SELECT item, place, MAX(d)::text AS d FROM (
       SELECT l.item_id AS item, c.place_id::text AS place, (l.counted_at AT TIME ZONE 'Indian/Maldives')::date AS d
         FROM stock_count_lines l JOIN stock_counts c ON c.id = l.count_id WHERE l.company_id = $1 AND c.status = 'posted' AND l.counted IS NOT NULL
       UNION ALL SELECT item_id, place_id::text, moved_on FROM stock_moves WHERE company_id = $1 AND kind = 'counted'
     ) x WHERE d <= $2 GROUP BY item, place`,
    [companyId, on]
  );
  const { rows: first } = await client.query(
    `SELECT item, place, MIN(d)::text AS d FROM (
       SELECT item_id AS item, place_id::text AS place, moved_on AS d FROM stock_moves WHERE company_id = $1
       UNION ALL SELECT item_id, to_place_id::text, moved_on FROM stock_transfers WHERE company_id = $1
     ) x GROUP BY item, place`,
    [companyId]
  );
  const lastAt = new Map(last.map((r) => [`${r.item}|${placeKey(r.place)}`, r.d]));
  const firstAt = new Map(first.map((r) => [`${r.item}|${placeKey(r.place)}`, r.d]));
  const out = [];
  for (const [key, q] of at) {
    if (q <= 0n) continue;
    const [itemId, place] = key.split("|");
    const it = names.get(itemId);
    if (!it || place === "transit") continue;
    const c = cls.get(itemId) || "C";
    const counted = lastAt.get(key) || null;
    const dueOn = addDays(counted || firstAt.get(key) || on, EVERY[c]);
    out.push({ itemId, name: it.name, unit: it.unit, place, class: c, quantity: unitsText(q), lastCounted: counted, dueOn, overdue: dueOn <= on });
  }
  return out.sort((a, b) => (a.class < b.class ? -1 : a.class > b.class ? 1 : a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

async function member(client, { companyId, userId }) {
  const { rows } = await client.query("SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 AND m.user_id = $2 LIMIT 1", [companyId, userId]);
  if (!rows[0]) throw new Error("The counter must be someone in this company.");
  return rows[0];
}

/** Picks `n` of `list` at random without putting any back, each as likely as its weight. */
function pick(list, n) {
  // Scaled to whole shares of a million, each at least one, so any value can be drawn and none is never picked.
  const sum = list.reduce((a, x) => a + x.weight, 0) || 1;
  const left = list.map((x) => ({ x, w: Math.max(1, Math.round((x.weight / sum) * 1e6)) }));
  const out = [];
  while (out.length < n && left.length) {
    let r = randomInt(left.reduce((a, x) => a + x.w, 0));
    let i = 0;
    while (r >= left[i].w) r -= left[i++].w;
    out.push(left.splice(i, 1)[0].x);
  }
  return out;
}

/** A new count at a place: every item there, the items due, or a spot check. */
async function create(client, { companyId, userId, kind, placeId, counterId, note }) {
  await assumeIdentity(client, { companyId, userId });
  if (!KINDS[kind]) throw new Error("What kind of count is it?");
  const place = placeId ? await stock.place(client, { companyId, placeId }) : { id: null, name: "Main store" };
  const key = placeKey(placeId);
  const counter = await member(client, { companyId, userId: counterId });
  if (kind === "spot" && placeId) {
    const { rows } = await client.query("SELECT in_charge FROM stock_places WHERE id = $1", [placeId]);
    if (rows[0]?.in_charge === counterId) throw new Error(`${counter.name} looks after ${place.name}. A spot check is counted by someone else.`);
  }
  const on = localToday();
  let itemIds;
  if (kind === "cycle") {
    itemIds = (await due(client, { companyId, on })).filter((d) => d.place === key && d.overdue).slice(0, CYCLE).map((d) => d.itemId);
    if (!itemIds.length) throw new Error(`Nothing at ${place.name} is due a count.`);
  } else {
    const at = await held(client, { companyId, on });
    const here = [...at].filter(([k, q]) => k.endsWith(`|${key}`) && (kind === "full" ? q !== 0n : q > 0n)).map(([k, q]) => ({ itemId: k.split("|")[0], q }));
    if (!here.length) throw new Error(`The books show nothing at ${place.name} to count.`);
    if (kind === "full") itemIds = here.map((h) => h.itemId);
    else {
      // Leaning to value, and doubly to anything short there in the last half year.
      const { rows: v } = await client.query("SELECT item_id, SUM(value_laari) AS v, SUM(quantity) AS q FROM stock_moves WHERE company_id = $1 GROUP BY item_id", [companyId]);
      const avg = new Map(v.map((r) => [r.item_id, Number(fromDb(r.q)) > 0 ? Number(r.v) / Number(fromDb(r.q)) : 0]));
      const { rows: short } = await client.query(
        "SELECT DISTINCT item_id FROM stock_moves WHERE company_id = $1 AND kind = 'counted' AND quantity < 0 AND place_id IS NOT DISTINCT FROM $2 AND moved_on > $3",
        [companyId, placeId || null, addDays(on, -180)]
      );
      const wasShort = new Set(short.map((r) => r.item_id));
      const weighted = here.map((h) => ({ ...h, weight: (1 + (avg.get(h.itemId) || 0) * Number(h.q)) * (wasShort.has(h.itemId) ? 2 : 1) }));
      itemIds = pick(weighted, SPOT).map((h) => h.itemId);
    }
  }
  // Asked first: a refusal from the unique index would end the whole transaction. The index stays as the backstop.
  const { rows: open } = await client.query(
    "SELECT 1 FROM stock_counts WHERE company_id = $1 AND place_id IS NOT DISTINCT FROM $2 AND status IN ('counting','submitted')",
    [companyId, placeId || null]
  );
  if (open.length) throw new Error(`${place.name} already has a count open. Finish or cancel it first.`);
  const { rows: [row] } = await client.query(
    "INSERT INTO stock_counts (company_id, place_id, kind, counter, note, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [companyId, placeId || null, kind, counterId, note ? String(note).trim() : null, userId]
  );
  for (const itemId of itemIds) {
    await client.query("INSERT INTO stock_count_lines (company_id, count_id, item_id) VALUES ($1,$2,$3)", [companyId, row.id, itemId]);
  }
  return { id: row.id, kind, place: place.name, counter: counter.name, items: itemIds.length };
}

async function session(client, { companyId, countId, lock = false }) {
  const { rows } = await client.query(
    `SELECT c.*, COALESCE(p.name, 'Main store') AS place, u.name AS counter_name, d.name AS decided_name
       FROM stock_counts c LEFT JOIN stock_places p ON p.id = c.place_id JOIN users u ON u.id = c.counter LEFT JOIN users d ON d.id = c.decided_by
      WHERE c.id = $1 AND c.company_id = $2 ${lock ? "FOR UPDATE OF c" : ""}`,
    [countId, companyId]
  );
  if (!rows[0]) throw new Error("That count is not in these books.");
  return rows[0];
}

function mustCount(s, userId) {
  if (s.status !== "counting") throw new Error("That count has been submitted.");
  if (s.counter !== userId) throw new Error(`${s.counter_name} is counting this one.`);
}

/**
 * A count as a person sees it. Until it is submitted nobody sees what the
 * books said or the difference: the count stays blind. After, those who read
 * the books see each line's difference, its value, and whether it is beyond
 * the tolerance.
 */
async function view(client, { companyId, userId, countId, reads }) {
  const s = await session(client, { companyId, countId });
  if (!reads && s.counter !== userId) throw new Error("That count is not yours.");
  const open = s.status !== "counting" && reads;
  const tol = await tolerance(client, companyId);
  const { rows } = await client.query(
    `SELECT l.item_id, i.name, i.unit, l.counted, l.book, l.counted_at, l.reason, l.value_laari, e.entry_no
       FROM stock_count_lines l JOIN stock_items i ON i.id = l.item_id LEFT JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.count_id = $1 ORDER BY lower(i.name)`,
    [countId]
  );
  const lines = rows.map((r) => {
    const line = { itemId: r.item_id, name: r.name, unit: r.unit, counted: r.counted === null ? null : unitsText(fromDb(r.counted)), reason: r.reason };
    if (!open || r.counted === null) return line;
    const diff = fromDb(r.counted) - fromDb(r.book);
    const v = r.value_laari === null ? null : BigInt(r.value_laari);
    return { ...line, book: unitsText(fromDb(r.book)), difference: unitsText(diff), value: v === null ? null : formatLaari(v), over: v !== null && (v < 0n ? -v : v) > tol, entryNo: r.entry_no === null ? null : String(r.entry_no) };
  });
  return {
    id: s.id, kind: s.kind, kindName: KINDS[s.kind], status: s.status, place: s.place, placeId: placeKey(s.place_id), counterId: s.counter, counter: s.counter_name,
    note: s.note, createdAt: s.created_at, submittedAt: s.submitted_at, decidedBy: s.decided_name, decidedAt: s.decided_at,
    tolerance: open ? formatLaari(tol) : null, blind: !open, lines,
  };
}

/** The counter says how many are there. What the books say there is kept now, unseen. */
async function saveLine(client, { companyId, userId, countId, itemId, counted, reason }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await session(client, { companyId, countId, lock: true });
  mustCount(s, userId);
  const h = await stock.holding(client, { companyId, itemId });
  const units = toUnitsOrNone(counted);
  const book = (await stock.atPlaces(client, { companyId, itemId })).get(placeKey(s.place_id)) || 0n;
  if (units > book && h.units <= 0n) throw new Error(`None of ${h.item.name} is in the books, so there is no cost to take it in at. Count it on Items, where you can say what it cost.`);
  const { rowCount } = await client.query(
    "UPDATE stock_count_lines SET counted = $3, book = $4, counted_at = now(), reason = $5 WHERE count_id = $1 AND item_id = $2",
    [countId, itemId, unitsText(units), unitsText(book), reason ? String(reason).trim().slice(0, 300) : null]
  );
  if (!rowCount) throw new Error(`${h.item.name} is not on this count. Add it first.`);
  return { itemId, counted: unitsText(units) };
}

/** Something found at the place that is not on the list. */
async function addLine(client, { companyId, userId, countId, itemId }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await session(client, { companyId, countId, lock: true });
  mustCount(s, userId);
  const h = await stock.holding(client, { companyId, itemId });
  if (!h.item.counted) throw new Error(`${h.item.name} is not counted as stock.`);
  await client.query("INSERT INTO stock_count_lines (company_id, count_id, item_id) VALUES ($1,$2,$3) ON CONFLICT (count_id, item_id) DO NOTHING", [companyId, countId, itemId]);
  return { itemId, name: h.item.name, unit: h.item.unit };
}

/** Each counted difference into the books, at average cost, dated today. */
async function post(client, { companyId, userId, s }) {
  const on = localToday();
  const { rows } = await client.query("SELECT id, item_id, counted, book, reason FROM stock_count_lines WHERE count_id = $1 AND counted IS NOT NULL", [s.id]);
  for (const l of rows) {
    const diff = fromDb(l.counted) - fromDb(l.book);
    if (diff === 0n) continue;
    const h = await stock.holding(client, { companyId, itemId: l.item_id });
    const memo = `${KINDS[s.kind]} at ${s.place}: counted ${unitsText(fromDb(l.counted))} ${h.item.unit} ${h.item.name}; the books said ${unitsText(fromDb(l.book))}`;
    const { entry, value } = await stock.postDifference(client, { companyId, userId, held: h, itemId: l.item_id, placeId: s.place_id, diff, on, note: l.reason || `${KINDS[s.kind]} at ${s.place}`, memo });
    await client.query("UPDATE stock_count_lines SET entry_id = $2, value_laari = $3 WHERE id = $1", [l.id, entry.id, value.toString()]);
  }
  await client.query("UPDATE stock_counts SET status = 'posted', decided_by = $2, decided_at = now() WHERE id = $1", [s.id, userId]);
}

/**
 * The counter is done. Each difference is valued at average cost; if none is
 * beyond the tolerance it all posts now, otherwise it waits for a second person.
 */
async function submit(client, { companyId, userId, countId }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await session(client, { companyId, countId, lock: true });
  mustCount(s, userId);
  const { rows } = await client.query("SELECT id, item_id, counted, book FROM stock_count_lines WHERE count_id = $1 AND counted IS NOT NULL", [countId]);
  if (!rows.length) throw new Error("Nothing has been counted yet.");
  const tol = await tolerance(client, companyId);
  let over = 0;
  for (const l of rows) {
    const diff = fromDb(l.counted) - fromDb(l.book);
    const v = diff === 0n ? 0n : stock.differenceValue(await stock.holding(client, { companyId, itemId: l.item_id }), diff);
    if ((v < 0n ? -v : v) > tol) over += 1;
    await client.query("UPDATE stock_count_lines SET value_laari = $2 WHERE id = $1", [l.id, v.toString()]);
  }
  await client.query("UPDATE stock_counts SET status = 'submitted', submitted_at = now() WHERE id = $1", [countId]);
  if (!over) await post(client, { companyId, userId, s });
  return { status: over ? "submitted" : "posted", over };
}

/** A second person accepts differences beyond the tolerance, and they post. */
async function approve(client, { companyId, userId, countId }) {
  await assumeIdentity(client, { companyId, userId });
  const s = await session(client, { companyId, countId, lock: true });
  if (s.status !== "submitted") throw new Error("That count is not waiting for approval.");
  if (s.counter === userId) throw new Error("Someone other than the counter approves differences this size.");
  await post(client, { companyId, userId, s });
  return { status: "posted" };
}

/** Back to the counter to count again; what they entered stays for them to change. */
async function reopen(client, { companyId, userId, countId }) {
  const s = await session(client, { companyId, countId, lock: true });
  if (s.status !== "submitted") throw new Error("Only a count waiting for approval can go back to be counted again.");
  if (s.counter === userId) throw new Error("Someone other than the counter sends it back.");
  await client.query("UPDATE stock_counts SET status = 'counting', submitted_at = NULL WHERE id = $1", [countId]);
  await client.query("UPDATE stock_count_lines SET value_laari = NULL WHERE count_id = $1", [countId]);
  return { status: "counting" };
}

async function cancel(client, { companyId, userId, countId }) {
  const s = await session(client, { companyId, countId, lock: true });
  if (!["counting", "submitted"].includes(s.status)) throw new Error("That count is finished.");
  await client.query("UPDATE stock_counts SET status = 'cancelled', decided_by = $2, decided_at = now() WHERE id = $1", [countId, userId]);
  return { status: "cancelled" };
}

/** Counts, open first, then the latest finished. */
async function list(client, { companyId, counter }) {
  const { rows } = await client.query(
    `SELECT c.id, c.kind, c.status, c.created_at, c.submitted_at, c.decided_at, COALESCE(p.name, 'Main store') AS place, u.name AS counter_name, c.counter,
            COUNT(l.id) AS lines, COUNT(l.counted) AS counted
       FROM stock_counts c LEFT JOIN stock_places p ON p.id = c.place_id JOIN users u ON u.id = c.counter LEFT JOIN stock_count_lines l ON l.count_id = c.id
      WHERE c.company_id = $1 ${counter ? "AND c.counter = $2 AND c.status = 'counting'" : ""}
      GROUP BY c.id, p.name, u.name
      ORDER BY (c.status IN ('counting','submitted')) DESC, c.created_at DESC LIMIT 60`,
    counter ? [companyId, counter] : [companyId]
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, kindName: KINDS[r.kind], status: r.status, place: r.place, counterId: r.counter, counter: r.counter_name,
    createdAt: r.created_at, submittedAt: r.submitted_at, decidedAt: r.decided_at, lines: Number(r.lines), counted: Number(r.counted),
  }));
}

/** How close each place's counts came to the books over the 90 days to `on`: lines within the tolerance, of lines counted. */
async function accuracy(client, { companyId, on = localToday() }) {
  const tol = await tolerance(client, companyId);
  const { rows } = await client.query(
    `SELECT c.place_id, l.value_laari FROM stock_count_lines l JOIN stock_counts c ON c.id = l.count_id
      WHERE l.company_id = $1 AND c.status = 'posted' AND l.counted IS NOT NULL
        AND (l.counted_at AT TIME ZONE 'Indian/Maldives')::date BETWEEN $2 AND $3`,
    [companyId, addDays(on, -89), on]
  );
  const out = new Map();
  for (const r of rows) {
    const k = placeKey(r.place_id);
    const a = out.get(k) || { lines: 0, within: 0 };
    const v = BigInt(r.value_laari || 0);
    a.lines += 1;
    if ((v < 0n ? -v : v) <= tol) a.within += 1;
    out.set(k, a);
  }
  for (const a of out.values()) a.percent = Math.round((a.within * 100) / a.lines);
  return out;
}

module.exports = { create, view, saveLine, addLine, submit, approve, reopen, cancel, list, due, classes, accuracy, KINDS, EVERY, MAIN };
