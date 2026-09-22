const crypto = require("crypto");
const zlib = require("zlib");
const { Client } = require("pg");
const { ALL_SQL } = require("../config/all-schema");
const { verifyChain } = require("../ledger/verify");
const s3 = require("./s3");

/**
 * Backups, and proving they restore.
 *
 * Every night the whole database is read from one consistent snapshot, row by
 * row, into a compressed file, encrypted with BACKUP_KEY, and put in a bucket
 * that is not the database's disk. Then that same file is fetched back,
 * decrypted and loaded into an empty scratch database, and checked: every
 * company's seal verifies from the first entry to the last, and its entry
 * count, totals and last seal are exactly what they were when the backup was
 * taken. A backup nobody has restored is a hope; this restores every one.
 *
 * Rows rather than pg_dump: the database runs a newer Postgres than any
 * pg_dump the app's image would carry, and a version mismatch is the classic
 * way a backup job fails quietly. Rows are read with row_to_json, so bigints
 * and bytea travel as text and nothing passes through a float.
 *
 * ponytail: the whole file is built in memory; fine while the books are
 * megabytes, stream to the bucket when attachments make it hundreds.
 */

const MAGIC = Buffer.from("SFB1");
const SKIP = new Set(["backup_runs"]);
const ident = (name) => `"${name.replace(/"/g, '""')}"`;

function key() {
  const raw = process.env.BACKUP_KEY || "";
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("BACKUP_KEY is not set to 32 bytes of base64.");
  return k;
}

function encrypt(plain, k = key()) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, body, c.getAuthTag()]);
}

function decrypt(file, k = key()) {
  if (!file.subarray(0, 4).equals(MAGIC)) throw new Error("That is not a Sentryfi backup.");
  const iv = file.subarray(4, 16);
  const tag = file.subarray(file.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(file.subarray(16, file.length - 16)), d.final()]);
}

/** What each company's books looked like at the moment of the backup. */
async function fingerprint(client) {
  const { rows } = await client.query(
    `SELECT e.company_id,
            count(*)::text AS entries,
            max(e.entry_no)::text AS last_no,
            (SELECT encode(x.hash, 'hex') FROM journal_entries x
              WHERE x.company_id = e.company_id ORDER BY x.entry_no DESC LIMIT 1) AS last_hash,
            (SELECT COALESCE(sum(l.debit_laari), 0)::text FROM journal_lines l WHERE l.company_id = e.company_id) AS debits,
            (SELECT COALESCE(sum(l.credit_laari), 0)::text FROM journal_lines l WHERE l.company_id = e.company_id) AS credits
       FROM journal_entries e
      GROUP BY e.company_id
      ORDER BY e.company_id`
  );
  return rows;
}

/**
 * Reads every table into lines of "table<TAB>json", ending with the manifest.
 * The client must see every company: a role subject to the company walls
 * would read nothing and write an empty backup that looks like a good one.
 */
async function dump(client) {
  const { rows: who } = await client.query(
    "SELECT rolsuper OR rolbypassrls AS sees_all FROM pg_roles WHERE rolname = current_user"
  );
  if (!who[0]?.sees_all) throw new Error("A backup has to run as a role that sees every company.");

  const { rows: tables } = await client.query(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`
  );
  const parts = [];
  const rows = {};
  for (const { name } of tables) {
    if (SKIP.has(name)) continue;
    rows[name] = 0;
    for (let offset = 0; ; offset += 500) {
      const { rows: batch } = await client.query(
        `SELECT row_to_json(t)::text AS j FROM ${ident(name)} t ORDER BY ctid LIMIT 500 OFFSET ${offset}`
      );
      for (const r of batch) parts.push(`${name}\t${r.j}\n`);
      rows[name] += batch.length;
      if (batch.length < 500) break;
    }
  }
  const manifest = { version: 1, at: new Date().toISOString(), rows, books: await fingerprint(client) };
  parts.push(`#manifest\t${JSON.stringify(manifest)}\n`);
  return { data: zlib.gzipSync(Buffer.from(parts.join(""))), manifest };
}

/** Takes a backup from one consistent snapshot of the live database. */
async function dumpLive(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return await dump(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

function parse(data) {
  const byTable = new Map();
  let manifest = null;
  for (const line of zlib.gunzipSync(data).toString("utf8").split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const name = line.slice(0, tab);
    const json = line.slice(tab + 1);
    if (name === "#manifest") manifest = JSON.parse(json);
    else {
      if (!byTable.has(name)) byTable.set(name, []);
      byTable.get(name).push(json);
    }
  }
  if (!manifest) throw new Error("The backup has no manifest: it was cut short.");
  return { byTable, manifest };
}

/**
 * Loads a backup into an empty database and checks it against its manifest.
 * The target is built from the schema first, emptied of the rows the schema
 * seeds, then filled with triggers and foreign keys held off, since the rows
 * arrive table by table rather than in the order they were written.
 */
async function restoreInto(connectionString, data, { ssl } = {}) {
  const { byTable, manifest } = parse(data);
  const db = new Client({ connectionString, ssl });
  await db.connect();
  const problems = [];
  // Tables from before the current schema (the purchased product's leftovers)
  // are in the file, row for row, but have nowhere to go in a fresh database.
  // Noted, not failed: nothing reads them, and failing every night over them
  // would teach everyone to ignore the backup report.
  const notes = [];
  let here = new Set();
  try {
    for (const sql of ALL_SQL) await db.query(sql);
    const { rows: tables } = await db.query(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );
    here = new Set(tables.map((t) => t.name));
    await db.query("BEGIN");
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(`TRUNCATE ${[...here].filter((t) => !SKIP.has(t)).map(ident).join(", ")} CASCADE`);
    for (const [name, lines] of byTable) {
      if (!here.has(name)) {
        notes.push(`${name} (${lines.length} rows) kept in the file, not restored: this version has no such table.`);
        continue;
      }
      for (let i = 0; i < lines.length; i += 500) {
        await db.query(
          `INSERT INTO ${ident(name)} OVERRIDING SYSTEM VALUE
           SELECT * FROM json_populate_recordset(NULL::${ident(name)}, $1::json)`,
          [`[${lines.slice(i, i + 500).join(",")}]`]
        );
      }
    }
    // Counters that hand out the next number must carry on from the data.
    const { rows: seqs } = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`
    );
    for (const s of seqs) {
      await db.query(
        `SELECT setval(pg_get_serial_sequence($1, $2),
                       COALESCE((SELECT max(${ident(s.column_name)}) FROM ${ident(s.table_name)}), 0) + 1, false)`,
        [`public.${s.table_name}`, s.column_name]
      );
    }
    await db.query("COMMIT");

    for (const [name, count] of Object.entries(manifest.rows)) {
      if (!here.has(name)) continue;
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${ident(name)}`);
      if (rows[0].n !== count) problems.push(`${name}: ${count} rows backed up, ${rows[0].n} restored.`);
    }

    const now = await fingerprint(db);
    const byCompany = new Map(now.map((r) => [r.company_id, r]));
    for (const was of manifest.books) {
      const is = byCompany.get(was.company_id);
      const label = `Company ${was.company_id.slice(0, 8)}`;
      if (!is) {
        problems.push(`${label}: its books did not come back.`);
        continue;
      }
      for (const f of ["entries", "last_no", "last_hash", "debits", "credits"]) {
        if (is[f] !== was[f]) problems.push(`${label}: ${f} was ${was[f]}, restored as ${is[f]}.`);
      }
      await db.query("BEGIN");
      const chain = await verifyChain(db, { companyId: was.company_id, userId: null });
      await db.query("ROLLBACK");
      if (!chain.ok) problems.push(`${label}: the seal breaks at entry ${chain.problems[0].entryNo}: ${chain.problems[0].problem}`);
    }
  } finally {
    await db.end();
  }
  return { ok: problems.length === 0, problems, notes, manifest };
}

function scratchUrl(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * The nightly job: back up, store, fetch back, restore into scratch, check,
 * and write down what happened either way.
 */
async function run() {
  const { pool } = require("../config/db");
  const env = require("../config/env");
  const lock = await pool.connect();
  const { rows: got } = await lock.query("SELECT pg_try_advisory_lock(7212026) AS ok");
  if (!got[0].ok) {
    lock.release();
    return { skipped: true };
  }
  const { rows: started } = await pool.query("INSERT INTO backup_runs DEFAULT VALUES RETURNING id");
  const id = started[0].id;
  const record = (fields) =>
    pool.query(
      `UPDATE backup_runs SET finished_at = now(), object_key = $2, bytes = $3, companies = $4, entries = $5,
              restored = $6, ok = $7, problem = $8 WHERE id = $1`,
      [id, fields.key || null, fields.bytes || null, fields.companies ?? null, fields.entries ?? null,
       Boolean(fields.restored), Boolean(fields.ok), fields.problem || null]
    );
  const scratch = "sentryfi_restore_check";
  try {
    const { data, manifest } = await dumpLive(pool);
    const file = encrypt(data);
    const objectKey = `daily/${manifest.at.replace(/[:.]/g, "-")}.sfb`;
    await s3.put(objectKey, file);
    const fetched = await s3.get(objectKey);
    const plain = decrypt(fetched);

    await pool.query(`DROP DATABASE IF EXISTS ${scratch}`);
    await pool.query(`CREATE DATABASE ${scratch}`);
    let result;
    try {
      result = await restoreInto(scratchUrl(env.databaseUrl, scratch), plain, { ssl: pool.options.ssl });
    } finally {
      await pool.query(`DROP DATABASE IF EXISTS ${scratch}`).catch(() => {});
    }
    const entries = manifest.books.reduce((s, b) => s + Number(b.entries), 0);
    await record({
      key: objectKey, bytes: file.length, companies: manifest.books.length, entries,
      restored: true, ok: result.ok, problem: [...result.problems, ...result.notes].join(" ") || null,
    });
    return { ok: result.ok, problems: result.problems, key: objectKey };
  } catch (err) {
    await record({ problem: err.message }).catch(() => {});
    console.error(JSON.stringify({ at: "backup", error: err.message }));
    return { ok: false, problems: [err.message] };
  } finally {
    await lock.query("SELECT pg_advisory_unlock(7212026)").catch(() => {});
    lock.release();
  }
}

/**
 * Checks every hour whether today's backup has run, so a restart or a deploy
 * never skips a night. ponytail: in-process, which is right for one replica;
 * the advisory lock keeps two from running at once if that ever changes.
 */
function schedule() {
  if (!process.env.BACKUP_KEY) {
    console.log("Backups are off: BACKUP_KEY is not set.");
    return;
  }
  const { pool } = require("../config/db");
  const tick = async () => {
    try {
      const { rows } = await pool.query(
        "SELECT 1 FROM backup_runs WHERE ok AND started_at > now() - interval '20 hours' LIMIT 1"
      );
      if (!rows.length) await run();
    } catch (err) {
      console.error(JSON.stringify({ at: "backup-schedule", error: err.message }));
    }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}

module.exports = { encrypt, decrypt, dump, dumpLive, parse, restoreInto, run, schedule, scratchUrl };
