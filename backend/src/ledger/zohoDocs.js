/**
 * A Zoho backup's invoices, bills and payments as Sentryfi's own documents,
 * each filed against the entry its transaction already became. Nothing is
 * posted again: the books were brought in first (the history import), and
 * these are the papers that go with them, so Invoices, Bills, what customers
 * owe and what is paid read the same as the ledger.
 *
 * A document whose entry already has one is left alone, so running this twice
 * adds nothing.
 */
const { findOrCreate } = require("./counterparties");
const { reverseEntry } = require("./post");

async function bring(client, { companyId, userId, records, system = "zoho" }) {
  const done = { invoices: 0, bills: 0, receipts: 0, payments: 0, skipped: 0 };
  const { rows: imported } = await client.query("SELECT external_id, entry_id FROM imported_records WHERE company_id = $1 AND system = $2", [companyId, system]);
  const entryOf = new Map(imported.map((r) => [r.external_id, r.entry_id]));
  const { rows: map } = await client.query("SELECT their_name, account_id FROM import_account_map WHERE company_id = $1 AND system = $2", [companyId, system]);
  const accountOf = new Map(map.map((m) => [m.their_name, m.account_id]));
  const parties = new Map();
  const party = async (name, kind) => {
    const k = `${kind}|${String(name || "").toLowerCase()}`;
    if (!parties.has(k)) parties.set(k, name ? (await findOrCreate(client, { companyId, userId, name, kind, exact: true })).party.id : null);
    return parties.get(k);
  };
  const s = (v) => (v === null || v === undefined ? null : v.toString());
  const had = async (table, entryId) => (await client.query(`SELECT id FROM ${table} WHERE company_id = $1 AND entry_id = $2 LIMIT 1`, [companyId, entryId])).rows[0]?.id;

  // A payment an earlier import posted although Zoho holds it only as a draft
  // (or voided) is taken back out, with what it paid.
  for (const key of records.notPosted || []) {
    const entryId = entryOf.get(key);
    if (!entryId || (await client.query("SELECT 1 FROM journal_entries WHERE reverses_id = $1", [entryId])).rows.length) continue;
    await reverseEntry(client, { companyId, userId, entryId, reason: "A draft in Zoho, never posted there" });
    await client.query("UPDATE payment_runs SET reversed_at = now() WHERE entry_id = $1 AND company_id = $2 AND reversed_at IS NULL", [entryId, companyId]);
    await client.query("UPDATE receipts SET voided_at = now(), void_reason = 'A draft in Zoho, never posted there' WHERE entry_id = $1 AND company_id = $2 AND voided_at IS NULL", [entryId, companyId]);
    done.takenBack = (done.takenBack || 0) + 1;
  }

  // Invoices, then what paid them.
  const invoiceId = new Map();
  for (const d of records.invoices || []) {
    const entryId = entryOf.get(d.key);
    if (!entryId) { done.skipped++; continue; }
    let id = await had("sales_invoices", entryId);
    if (!id) {
      const net = d.gross - d.tax;
      const { rows } = await client.query(
        `INSERT INTO sales_invoices (company_id, counterparty_id, invoice_no, purchase_order, subject, issue_date, due_date, currency, net_laari, tax_laari, gross_laari,
                                     gst_treatment, gst_rate_bp, status, entry_id, raised_by, fx_rate, fc_net, fc_tax, fc_gross)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'posted',$14,$15,$16,$17,$18,$19)
         ON CONFLICT DO NOTHING RETURNING id`,
        [companyId, await party(d.party, "customer"), d.number, d.purchaseOrder, d.subject, d.date, d.due, d.currency, s(net), s(d.tax), s(d.gross),
          d.tax > 0n ? "exclusive" : "none_unregistered", d.tax > 0n ? 800 : null, entryId, userId,
          d.currency === "MVR" ? null : d.rate, d.fcGross === null ? null : s(d.fcGross - d.fcTax), s(d.fcTax), s(d.fcGross)]
      );
      id = rows[0]?.id;
      if (!id) { done.skipped++; continue; }
      for (const l of d.lines) {
        await client.query(
          "INSERT INTO sales_invoice_lines (company_id, invoice_id, description, quantity, unit_price_laari, net_laari, tax_laari, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [companyId, id, l.description, l.quantity, s(l.unitPrice < 0n ? 0n : l.unitPrice), s(l.net < 0n ? 0n : l.net), s(l.tax < 0n ? 0n : l.tax), l.position]
        );
      }
      done.invoices++;
    }
    invoiceId.set(d.number, id);
  }
  for (const p of records.customerPayments || []) {
    const entryId = entryOf.get(p.key);
    const account = accountOf.get(p.account);
    if (!entryId || !account || p.amount <= 0n) { done.skipped++; continue; }
    if (await had("receipts", entryId)) continue;
    const { rows } = await client.query(
      `INSERT INTO receipts (company_id, counterparty_id, amount_laari, received_on, account_id, reference, entry_id, received_by, currency, amount_fc, fx_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [companyId, await party(p.party, "customer"), s(p.amount), p.date, account, p.reference || `Zoho payment ${p.number}`, entryId, userId,
        p.currency === "MVR" ? null : p.currency, s(p.fcAmount), p.currency === "MVR" ? null : p.rate]
    );
    for (const a of p.applied) {
      const inv = invoiceId.get(a.invoice) || (await client.query("SELECT id FROM sales_invoices WHERE company_id = $1 AND invoice_no = $2 LIMIT 1", [companyId, a.invoice])).rows[0]?.id;
      if (inv && a.amount > 0n) await client.query("INSERT INTO receipt_allocations (company_id, receipt_id, invoice_id, amount_laari) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [companyId, rows[0].id, inv, s(a.amount)]);
    }
    done.receipts++;
  }

  // Bills, then what paid them.
  const billId = new Map();
  for (const d of records.bills || []) {
    const entryId = entryOf.get(d.key);
    if (!entryId) { done.skipped++; continue; }
    let id = await had("bills", entryId);
    if (!id) {
      const net = d.gross - d.tax;
      const { rows } = await client.query(
        `INSERT INTO bills (company_id, counterparty_id, bill_no, issue_date, due_date, received_at, currency, net_laari, tax_laari, gross_laari,
                            gst_treatment, gst_rate_bp, status, entry_id, fx_rate, fc_net, fc_tax, fc_gross)
         VALUES ($1,$2,$3,$4,$5,$4::date,$6,$7,$8,$9,$10,$11,'posted',$12,$13,$14,$15,$16)
         ON CONFLICT DO NOTHING RETURNING id`,
        [companyId, await party(d.party, "supplier"), d.number, d.date, d.due, d.currency, s(net), s(d.tax), s(d.gross),
          d.tax > 0n ? "exclusive" : "none_unregistered", d.tax > 0n ? d.taxBp || 800 : null, entryId,
          d.currency === "MVR" ? null : d.rate, d.fcGross === null ? null : s(d.fcGross - d.fcTax), s(d.fcTax), s(d.fcGross)]
      );
      id = rows[0]?.id;
      if (!id) { done.skipped++; continue; }
      for (const l of d.lines) {
        await client.query(
          "INSERT INTO bill_lines (company_id, bill_id, description, quantity, unit_price_laari, net_laari, tax_laari, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [companyId, id, l.description, l.quantity, s(l.unitPrice < 0n ? 0n : l.unitPrice), s(l.net < 0n ? 0n : l.net), s(l.tax < 0n ? 0n : l.tax), l.position]
        );
      }
      done.bills++;
    }
    billId.set(d.zohoId, id);
  }
  for (const p of records.vendorPayments || []) {
    const entryId = entryOf.get(p.key);
    const account = accountOf.get(p.account);
    const items = p.applied.map((a) => ({ bill: billId.get(a.bill), amount: a.amount })).filter((a) => a.bill && a.amount > 0n);
    if (!entryId || !account || !items.length) continue;
    if (await had("payment_runs", entryId)) continue;
    const { rows } = await client.query(
      "INSERT INTO payment_runs (company_id, paid_on, from_account_id, reference, entry_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [companyId, p.date, account, p.reference || `Zoho payment ${p.number}`, entryId, userId]
    );
    for (const i of items) await client.query("INSERT INTO payment_items (company_id, run_id, bill_id, amount_laari) VALUES ($1,$2,$3,$4)", [companyId, rows[0].id, i.bill, s(i.amount)]);
    done.payments++;
  }
  return done;
}

module.exports = { bring };
