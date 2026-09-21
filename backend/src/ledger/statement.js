const crypto = require("crypto");
const { toLaari } = require("./money");

/**
 * Reading a bank's statement file.
 *
 * Pure: text in, rows out, nothing touches the database. That keeps the traps
 * in one place where they can be tested with no company and no connection.
 *
 * The traps are the real Bank of Maldives export's, not imagined ones
 * (docs/real-world-samples/bml-csv-import.md):
 *
 *   - There is no header row, so the first line is a transaction.
 *   - Excel-protected cells arrive as ="BLAZ525729582342": quotes inside quotes.
 *   - Two date orders in one row, and other rows use a third: the ATM deposit rows'
 *     timestamp is year first, and Favara and fee rows have no timestamp at all.
 *   - Amounts have one, two or no decimal places. Never assume two.
 *   - Direction is which of debit and credit is filled, not a sign.
 *   - Some rows are malformed. A bad row is kept and flagged, or skipped and
 *     named. It never rejects the file, because a statement with one odd line
 *     is still a statement and the other 1,093 are still money.
 *
 * The column layout is data, so another bank is another object, not more code.
 */

const BML = {
  columns: 11,
  postedOn: 0,
  valueOn: 1,
  kind: 2,
  bankRef: 3,
  internalRef: 4,
  happenedAt: 5,
  who: 6,
  channel: 7,
  debit: 8,
  credit: 9,
  balance: 10,
};

/** RFC 4180: quoted fields, "" for a quote, commas and line breaks allowed inside quotes. */
function tokenise(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let started = false; // has this row seen anything, so a blank line can be told from an empty cell

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
      started = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      if (started || cell) {
        row.push(cell);
        rows.push(row);
      }
      row = [];
      cell = "";
      started = false;
    } else {
      cell += c;
      started = true;
    }
  }
  if (started || cell) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** ="BLAZ123" is Excel keeping a number as text. The value is what is inside. */
const unwrap = (s) => {
  const t = String(s ?? "").trim();
  const m = /^="(.*)"$/.exec(t);
  return (m ? m[1] : t).trim();
};

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;
}

/** 2026/01/04, the posting and value dates. */
function slashDate(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s).trim());
  return m ? isoDate(+m[1], +m[2], +m[3]) : null;
}

/**
 * The moment it happened. Three shapes turn up in one file: day first, year
 * first (the ATM deposit rows), and day first with the time run together (the
 * card purchases). They are told apart by shape and never by guessing, because
 * 04-05-2026 is not the same day either way round.
 */
function stamp(s) {
  const t = String(s).trim().replace(/^(\S+) (\d{2})-?(\d{2})-?(\d{2})$/, "$1 $2:$3:$4");
  const m = /^(?:(\d{2})-(\d{2})-(\d{4})|(\d{4})-(\d{2})-(\d{2})) (\d{2}):(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const [y, mo, d] = m[1] ? [+m[3], +m[2], +m[1]] : [+m[4], +m[5], +m[6]];
  const [h, mi, se] = [+m[7], +m[8], +m[9]];
  const day = isoDate(y, mo, d);
  return day && h < 24 && mi < 60 && se < 60 ? `${day} ${m[7]}:${m[8]}:${m[9]}` : null;
}

/** Whole laari from "800", "426.5" or "19,605.23". null when blank, undefined when it is not a number. */
function amount(s) {
  const t = String(s ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return toLaari(t);
}

/**
 * One line of the statement as it will be kept. The hash is what makes
 * importing the same file twice, or two exports that overlap, land each row
 * once. The channel is left out of it: it is the field that arrives malformed,
 * and a corrected re-export must not look like a new transaction.
 */
function rowHash(r) {
  const parts = [r.postedOn, r.valueOn, r.kind, r.bankRef, r.internalRef, r.happenedAt, r.remark, r.who, r.debitLaari, r.creditLaari, r.balanceLaari];
  return crypto.createHash("sha256").update(parts.map((p) => String(p ?? "")).join("\u001f")).digest("hex");
}

function parse(text, layout = BML) {
  const body = String(text || "").replace(/^﻿/, "");
  const rows = [];
  const skipped = [];

  tokenise(body).forEach((cells, index) => {
    const rowNo = index + 1;
    if (cells.length < layout.columns) {
      return skipped.push({ rowNo, why: `only ${cells.length} of ${layout.columns} columns` });
    }
    const c = (k) => unwrap(cells[layout[k]]);
    const flags = [];

    const postedOn = slashDate(c("postedOn"));
    if (!postedOn) return skipped.push({ rowNo, why: `the posting date "${c("postedOn")}" is not a date` });

    const debit = amount(c("debit"));
    const credit = amount(c("credit"));
    if (debit === undefined || credit === undefined) {
      return skipped.push({ rowNo, why: "an amount is not a number" });
    }
    if (debit === null && credit === null) flags.push("no amount on either side");
    else if (debit !== null && credit !== null && debit > 0n && credit > 0n) flags.push("both a debit and a credit");

    const balance = amount(c("balance"));
    if (balance === undefined) flags.push("the running balance is not a number");

    const valueOn = slashDate(c("valueOn"));
    if (!valueOn) flags.push("the value date is not a date");

    // Not every kind of row has a timestamp there. Favara remittances and bank
    // fees put a description in that column, so it is kept as a remark rather
    // than called malformed.
    const happenedAt = stamp(c("happenedAt"));
    const remark = happenedAt ? null : c("happenedAt") || null;

    const channel = c("channel");
    // The known malformed rows: the channel column holds a timestamp.
    if (stamp(channel)) flags.push("the channel holds a timestamp");

    const row = {
      rowNo,
      postedOn,
      valueOn,
      kind: c("kind"),
      bankRef: c("bankRef") || null,
      internalRef: c("internalRef") || null,
      happenedAt,
      remark,
      who: c("who") || null,
      channel: channel || null,
      debitLaari: debit ?? 0n,
      creditLaari: credit ?? 0n,
      balanceLaari: balance ?? null,
      flag: flags.join("; ") || null,
    };
    row.hash = rowHash(row);
    rows.push(row);
  });

  return { rows, skipped, ...checkBalances(rows) };
}

/**
 * Does the file agree with itself? Each row's balance should be the one before
 * it plus what came in less what went out. This is the proof that the columns
 * were read right: get one date, sign or decimal wrong and the running balance
 * stops adding up within a few rows.
 *
 * Tried in file order and reversed, because banks export oldest first or
 * newest first and nothing in the file says which.
 */
function checkBalances(rows) {
  const measure = (list) => {
    let breaks = 0;
    let firstBreak = null;
    for (let i = 1; i < list.length; i += 1) {
      const p = list[i - 1];
      const r = list[i];
      if (p.balanceLaari === null || r.balanceLaari === null) continue;
      if (p.balanceLaari + r.creditLaari - r.debitLaari !== r.balanceLaari) {
        breaks += 1;
        if (firstBreak === null) firstBreak = r.rowNo;
      }
    }
    const first = list[0];
    const last = list[list.length - 1];
    return {
      breaks,
      firstBreak,
      opening: first && first.balanceLaari !== null ? first.balanceLaari - first.creditLaari + first.debitLaari : null,
      closing: last ? last.balanceLaari : null,
    };
  };
  const forward = measure(rows);
  const backward = measure([...rows].reverse());
  const best = backward.breaks < forward.breaks ? backward : forward;
  return { balance: { ...best, newestFirst: best === backward && backward.breaks < forward.breaks } };
}

module.exports = { parse, tokenise, unwrap, stamp, amount, BML };
