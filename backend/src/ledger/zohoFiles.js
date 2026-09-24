/**
 * The files behind a Zoho Books backup (its separate attachments zip), filed
 * against what was brought in. Zoho names each file by what it hangs off
 * (bill_, purchaseorder_, customer_payment_) and then the name it was uploaded
 * under, which usually carries the document's number: a file goes to the one
 * document whose number its name contains. A name that carries none (a phone's
 * IMG_7569, a random id) is listed, not guessed.
 *
 * Stored the same way as any attachment: the bytes once per company by their
 * hash, and a reference to the entry or order. Bringing the same zip in twice
 * files nothing twice.
 */
const crypto = require("crypto");

const TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp" };
const KIND = [
  [/^purchaseorder_/i, "purchase order"],
  [/^bill_/i, "bill"],
  [/^customer_payment_/i, "customer payment"],
  [/^vendor_payment_/i, "vendor payment"],
  [/^invoice_/i, "invoice"],
  [/^expense_/i, "expense"],
];

async function file(client, { companyId, userId, files, system = "zoho" }) {
  // What could be matched: purchase orders by number, imported entries by the number in their narrative.
  const { rows: orders } = await client.query("SELECT id, number FROM orders WHERE company_id = $1 AND kind = 'purchase'", [companyId]);
  const { rows: entries } = await client.query(
    `SELECT e.id, e.narrative FROM imported_records r JOIN journal_entries e ON e.id = r.entry_id WHERE r.company_id = $1 AND r.system = $2`,
    [companyId, system]
  );
  const numberOf = (narrative) => {
    const m = /^From \w+: (Bill|Customer payment|Vendor payment|Invoice|Expense) (\S+)/.exec(narrative || "");
    return m ? { type: m[1].toLowerCase(), number: m[2] } : null;
  };
  const byType = {};
  for (const e of entries) {
    const n = numberOf(e.narrative);
    if (n && n.number.length >= 3) (byType[n.type] ||= []).push({ id: e.id, number: n.number });
  }

  const filed = [];
  const unmatched = [];
  for (const [name, bytes] of Object.entries(files)) {
    const kind = (KIND.find(([re]) => re.test(name)) || [null, "file"])[1];
    const rest = name.replace(/^[a-z_]+?_(?=[^_])/i, "");
    const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();
    // Compared as parts, ignoring punctuation and leading zeros: EN/PO-00050
    // in the books is EN.PO.0050 in a file name, and never EN.PO.00501.
    const parts = (v) => String(v).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p));
    const fileParts = "-" + parts(rest.replace(/\.[a-z0-9]+$/i, "")).join("-") + "-";
    const contains = (n) => n && parts(n).length > 0 && fileParts.includes("-" + parts(n).join("-") + "-");
    // The longest number found wins, so INV-1 never claims INV-12's file.
    const pick = (list) => list.filter((x) => contains(x.number)).sort((a, b) => b.number.length - a.number.length)[0];
    let target = null;
    if (kind === "purchase order") target = pick(orders) && { orderId: pick(orders).id };
    else if (byType[kind]) target = pick(byType[kind]) && { entryId: pick(byType[kind]).id };
    // A bill's file often names the purchase order it came from.
    if (!target && kind === "bill") target = pick(orders) && { orderId: pick(orders).id };
    if (!target) {
      unmatched.push({ name, kind });
      continue;
    }
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "binary");
    const sha = crypto.createHash("sha256").update(buf).digest();
    const type = TYPES[ext] || "application/octet-stream";
    const { rows: had } = await client.query(
      "SELECT 1 FROM attachments WHERE company_id = $1 AND sha256 = $2 AND (entry_id = $3 OR order_id = $4)",
      [companyId, sha, target.entryId || null, target.orderId || null]
    );
    if (had.length) continue;
    await client.query(
      "INSERT INTO attachment_blobs (company_id, sha256, bytes, byte_size, content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id, sha256) DO NOTHING",
      [companyId, sha, buf, buf.length, type]
    );
    await client.query(
      "INSERT INTO attachments (company_id, entry_id, order_id, filename, content_type, byte_size, sha256, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [companyId, target.entryId || null, target.orderId || null, rest || name, type, buf.length, sha, `pg:${sha.toString("hex")}`, userId]
    );
    filed.push({ name, kind });
  }
  return { filed: filed.length, unmatched };
}

module.exports = { file };
