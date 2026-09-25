/**
 * Finding who a document is from, and learning more about them from it.
 *
 * Two jobs that belong together: recognising a party you have dealt with
 * before, and getting better at recognising them next time.
 */

const { assumeIdentity } = require("./post");

/**
 * Fields a document can teach us. Split by what happens when one disagrees
 * with what is already on file.
 *
 * `quiet` fields fill in when empty and are simply corrected when they change:
 * a supplier moving office is not an event anybody needs to approve.
 *
 * `guarded` fields never change silently. A TIN or a GST number that suddenly
 * differs means a misread, a different company with a similar name, or a wrong
 * claim on a return. A bank account that differs is the one that costs real
 * money: invoice-redirection fraud works by sending a genuine supplier's next
 * bill with a new account number.
 */
const QUIET = ["address", "phone", "email", "notes"];
const GUARDED = ["tin", "gst_number", "bank_account"];

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const same = (a, b) =>
  String(a || "").replace(/\s+/g, "").toLowerCase() ===
  String(b || "").replace(/\s+/g, "").toLowerCase();

/**
 * Finds who this is, or makes them.
 *
 * A name with nothing else is a perfectly good counterparty. Getting the
 * document recorded matters more than knowing everything about who sent it,
 * and merging two records later is cheap while losing the bill is not.
 *
 * Matching runs over the name, every alias it is known by, and the TIN when
 * there is one — the TIN being the only strong key here, since names on real
 * Maldivian invoices are spelled inconsistently by their own issuers.
 */
/** A record merged into another answers as the one kept. */
async function kept(client, row) {
  if (!row.merged_into) return row;
  const { rows } = await client.query("SELECT * FROM counterparties WHERE id = $1", [row.merged_into]);
  return rows[0] || row;
}

async function findOrCreate(client, { companyId, userId, name, tin, kind = "supplier", exact = false }) {
  await assumeIdentity(client, { companyId, userId });
  const trimmed = clean(name);

  if (tin) {
    const { rows } = await client.query(
      `SELECT * FROM counterparties
        WHERE company_id = $1 AND tin IS NOT NULL
          AND replace(lower(tin),' ','') = replace(lower($2),' ','')
        LIMIT 1`,
      [companyId, tin]
    );
    if (rows.length) return { party: await kept(client, rows[0]), created: false, matchedOn: "tin" };
  }

  if (trimmed) {
    const { rows } = await client.query(
      `SELECT * FROM counterparties
        WHERE company_id = $1
          AND (lower(name) = lower($2)
               OR lower($2) = ANY (SELECT lower(x) FROM unnest(also_known_as) x))
        LIMIT 1`,
      [companyId, trimmed]
    );
    if (rows.length) {
      // Found as a supplier and now met as a customer (or the other way): it is both.
      if (exact && !(rows[0].kind || []).includes(kind)) {
        await client.query("UPDATE counterparties SET kind = array_append(kind, $3::cp_t) WHERE id = $1 AND company_id = $2", [rows[0].id, companyId, kind]);
      }
      return { party: await kept(client, rows[0]), created: false, matchedOn: "name" };
    }
  }

  // A close-but-not-exact name, using trigram similarity. Returned as a match
  // with the spelling remembered, because one real invoice spells its own
  // issuer two ways on a single page.
  // An import names its contacts exactly, each already its own in the other
  // system, so two close names there stay two here.
  if (!exact && trimmed && trimmed.length >= 4) {
    const { rows } = await client.query(
      `SELECT *, similarity(name, $2) AS score FROM counterparties
        WHERE company_id = $1 AND archived_at IS NULL AND name % $2
        ORDER BY score DESC LIMIT 1`,
      [companyId, trimmed]
    );
    if (rows.length && Number(rows[0].score) >= 0.55) {
      return { party: await kept(client, rows[0]), created: false, matchedOn: "similar-name" };
    }
  }

  const { rows } = await client.query(
    `INSERT INTO counterparties (company_id, name, tin, kind)
     VALUES ($1, $2, $3, ARRAY[$4]::cp_t[]) RETURNING *`,
    [companyId, trimmed || "Unnamed", tin || null, kind]
  );
  return { party: rows[0], created: true, matchedOn: null };
}

/**
 * Teaches the record what this document said.
 *
 * Returns what changed and what disagreed, so the caller can put the
 * disagreements in front of a person without having to work out which ones
 * matter.
 */
async function observe(client, { companyId, userId, partyId, facts, source }) {
  await assumeIdentity(client, { companyId, userId });

  const { rows: existing } = await client.query(
    "SELECT * FROM counterparties WHERE id = $1 AND company_id = $2",
    [partyId, companyId]
  );
  if (!existing.length) return { learned: [], conflicts: [] };
  const party = existing[0];

  const learned = [];
  const conflicts = [];

  const record = async (field, value, outcome) => {
    await client.query(
      `INSERT INTO counterparty_observations
         (company_id, counterparty_id, field, value, source_kind, source_id, confidence, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        companyId, partyId, field, String(value),
        source?.kind || "bill", source?.id || null,
        source?.confidence || "medium", outcome,
      ]
    );
  };

  for (const [field, raw] of Object.entries(facts || {})) {
    const value = clean(raw);
    if (!value) continue;

    // A new spelling of a name it already answers to. Always worth keeping:
    // it is how the same supplier is recognised next time, and how a truncated
    // bank statement line is matched later.
    if (field === "name" || field === "name_alias") {
      const known = [party.name, ...(party.also_known_as || [])];
      if (!known.some((k) => same(k, value))) {
        await client.query(
          `UPDATE counterparties
              SET also_known_as = array_append(also_known_as, $3), last_seen = now()
            WHERE id = $1 AND company_id = $2`,
          [partyId, companyId, value]
        );
        await record("also_known_as", value, "applied");
        learned.push({ field: "also_known_as", value });
      }
      continue;
    }

    if (field === "bank_account") {
      const accounts = party.bank_accounts || [];
      if (accounts.some((a) => same(a, value))) continue;
      if (accounts.length === 0) {
        await client.query(
          `UPDATE counterparties
              SET bank_accounts = array_append(bank_accounts, $3), last_seen = now()
            WHERE id = $1 AND company_id = $2`,
          [partyId, companyId, value]
        );
        await record("bank_account", value, "applied");
        learned.push({ field: "bank_account", value });
      } else {
        // The expensive one. A known supplier's bill arriving with an account
        // nobody has seen is how invoice redirection works, so it is never
        // applied and never silently added — it waits for a person.
        await record("bank_account", value, "conflict");
        conflicts.push({
          field: "bank_account",
          was: accounts,
          now: value,
          why:
            "This supplier's bank details have changed on this bill. " +
            "Confirm it with them by phone, on a number you already had, before paying.",
        });
      }
      continue;
    }

    const current = party[field];
    const isKnownField = QUIET.includes(field) || GUARDED.includes(field);
    if (!isKnownField) continue;

    if (!current) {
      await client.query(
        `UPDATE counterparties SET ${field} = $3, last_seen = now()
          WHERE id = $1 AND company_id = $2`,
        [partyId, companyId, value]
      );
      await record(field, value, "applied");
      learned.push({ field, value });
      continue;
    }

    if (same(current, value)) continue;

    if (QUIET.includes(field)) {
      await client.query(
        `UPDATE counterparties SET ${field} = $3, last_seen = now()
          WHERE id = $1 AND company_id = $2`,
        [partyId, companyId, value]
      );
      await record(field, value, "applied");
      learned.push({ field, value, replaced: current });
      continue;
    }

    // Guarded and different: a TIN or GST number that has changed is a
    // misread, a different company, or a wrong claim on a return. The old
    // value stays until somebody says otherwise.
    await record(field, value, "conflict");
    conflicts.push({
      field,
      was: current,
      now: value,
      why:
        field === "tin"
          ? "The tax number on this bill is not the one on file for this supplier."
          : "The GST number on this bill is not the one on file for this supplier.",
    });
  }

  await client.query(
    "UPDATE counterparties SET last_seen = now() WHERE id = $1 AND company_id = $2",
    [partyId, companyId]
  );

  return { learned, conflicts };
}

module.exports = { findOrCreate, observe, QUIET, GUARDED };
