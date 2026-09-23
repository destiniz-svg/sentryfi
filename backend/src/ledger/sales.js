const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");
const taxEngine = require("./tax");
const fx = require("./fx");

/**
 * Money owed to us.
 *
 * The mirror of bills, and the direction matters more than it looks. A bill
 * creates tax we can claim; an invoice creates tax we owe. Getting the sign
 * wrong on that does not merely misstate a figure, it understates a return to
 * the tax authority, which is a different kind of problem from a wrong number
 * on a screen.
 *
 * Nothing here holds a balance. What a customer owes is the sum of journal
 * lines on the receivable account, and what is left on one invoice is its
 * gross less what receipts have been allocated to it. Both are read every
 * time they are asked, because an invoice with a paid_at column and an entry
 * in the books is two records of one fact.
 */

const AR = "1300"; // Money owed to us
const OUTPUT_TAX = "2200"; // GST we owe
const DEFAULT_INCOME = "4100"; // Work invoiced

async function accountByCode(client, { companyId, code }) {
  const { rows } = await client.query(
    `SELECT id, name FROM accounts WHERE company_id = $1 AND code = $2`,
    [companyId, code]
  );
  return rows[0] || null;
}

// Splitting a figure the way it was quoted is the same arithmetic for an
// invoice as for a bill: one function, so the two cannot drift.
const { splitTax } = require("./bills");
const stock = require("./stock");

/** A laari amount times a quantity held to four decimal places, half up. */
function timesQuantity(unitLaari, quantity) {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("A line's quantity has to be a number, and not below zero.");
  }
  const scaled = BigInt(Math.round(quantity * 10000));
  const product = unitLaari * scaled;
  return (product + 5000n) / 10000n;
}

/**
 * The next invoice number.
 *
 * Altura's own run "ALT/INV-000026". The prefix is whatever the company has
 * been using, and the number after it is one more than the highest issued —
 * read from the invoices themselves rather than from a counter, so importing
 * history does not leave a gap or a collision. Gaplessness is a rule for
 * journal entries, not for invoice numbers: a customer's invoice number is a
 * label on a document, and cancelling a draft should not burn one.
 */
async function nextInvoiceNo(client, { companyId, prefix }) {
  // With no prefix given, carry on in whatever the company has been using —
  // Altura's is "ALT/INV-" — read off its most recent invoice. A fresh
  // company starts at INV-000001.
  let use = prefix ? String(prefix).trim() : null;
  if (!use) {
    const { rows: latest } = await client.query(
      `SELECT invoice_no FROM sales_invoices WHERE company_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [companyId]
    );
    const found = latest[0]?.invoice_no?.match(/^(.*?)(\d+)\s*$/);
    use = found ? found[1] : "INV-";
  }
  const { rows } = await client.query(
    `SELECT invoice_no FROM sales_invoices
      WHERE company_id = $1 AND invoice_no LIKE $2
      ORDER BY length(invoice_no) DESC, invoice_no DESC
      LIMIT 1`,
    [companyId, `${use}%`]
  );

  const last = rows[0]?.invoice_no || null;
  const digits = last ? last.slice(use.length).match(/^(\d+)/) : null;
  const next = digits ? Number(digits[1]) + 1 : 1;
  const width = digits ? digits[1].length : 6;
  return `${use}${String(next).padStart(width, "0")}`;
}

/**
 * Raises an invoice. Records it; does not put it in the books.
 *
 * Drafting and issuing are separate acts here, unlike a cash spend. The money
 * has not moved and nothing has been promised until it is sent, so there is a
 * real moment where correcting it costs nothing.
 */
async function raise(client, {
  companyId,
  userId,
  counterpartyId,
  invoiceNo,
  purchaseOrder,
  subject,
  issueDate,
  dueDate,
  gstTreatment = "exclusive",
  gstRateBp,
  projectId,
  dimensionIds,
  clientRef,
  currency,
  fxRate,
  lines = [],
}) {
  if (!lines.length) throw new Error("An invoice needs at least one line.");

  // An invoice in another currency: its lines are in that currency, and its
  // own-currency figures are those at the rate it was raised at.
  const base = await fx.baseCurrency(client, { companyId });
  const cur = currency && String(currency).toUpperCase() !== base ? String(currency).toUpperCase() : null;
  if (cur) {
    if (!fxRate) throw new Error(`At what rate? How many ${base} one ${cur} buys on the invoice date.`);
    fx.scaledRate(fxRate);
  }

  // The rate in force on the invoice date, unless one was given. Kept on the
  // invoice, so a later rate change never reaches it.
  const rateBp = await taxEngine.rateForDocument(client, { companyId, on: issueDate, treatment: gstTreatment, printedBp: gstRateBp });

  const income = await accountByCode(client, { companyId, code: DEFAULT_INCOME });

  // A line can sell a stock item; the item must be this company's.
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  const items = new Map();
  if (itemIds.length) {
    const { rows: found } = await client.query(
      "SELECT id, name, unit FROM stock_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL",
      [companyId, itemIds]
    );
    if (found.length !== itemIds.length) throw new Error("One of those items is not in these books.");
    for (const r of found) items.set(r.id, r);
  }

  let net = 0n;
  let tax = 0n;
  const prepared = lines.map((line, index) => {
    const quantity = Number(line.quantity ?? 1);
    const unit = toLaari(line.unitPrice ?? 0);
    // The line total is quantity times unit price, in whole laari, rounded
    // once, here. It used to round the quantity first, so two and a half days
    // at 3,000 invoiced three days: 9,000 instead of 7,500. Half-days are
    // ordinary on a rental invoice. The quantity is carried to four places
    // (the column holds four) and the product rounded half up.
    const amount =
      line.amount !== undefined
        ? toLaari(line.amount)
        : timesQuantity(unit, quantity);
    const split = splitTax(amount, gstTreatment, rateBp);
    net += split.net;
    tax += split.tax;
    const item = line.itemId ? items.get(line.itemId) : null;
    if (item && !(quantity > 0)) throw new Error(`Say how many ${item.name} were sold.`);
    return {
      itemId: item ? item.id : null,
      description: String(line.description || "").trim() || (item ? item.name : ""),
      quantity,
      uom: line.uom ? String(line.uom).trim() : item ? item.unit : null,
      unitPriceLaari: unit,
      netLaari: split.net,
      taxLaari: split.tax,
      accountId: line.accountId || income?.id || null,
      projectId: line.projectId || projectId || null,
      position: index,
    };
  });

  // Foreign: keep each line's own figure, and turn the whole into ours at the
  // rate once, giving any laari of rounding to the last line so the lines
  // always add up to the invoice.
  let fcNet = null;
  let fcTax = null;
  if (cur) {
    fcNet = net;
    fcTax = tax;
    net = fx.toBase(fcNet, fxRate);
    tax = fx.toBase(fcTax, fxRate);
    let netLeft = net;
    let taxLeft = tax;
    prepared.forEach((line, i) => {
      line.fcNet = line.netLaari;
      const last = i === prepared.length - 1;
      line.netLaari = last ? netLeft : fx.toBase(line.fcNet, fxRate);
      const lineTax = last ? taxLeft : fx.toBase(line.taxLaari, fxRate);
      line.taxLaari = lineTax;
      netLeft -= line.netLaari;
      taxLeft -= lineTax;
    });
  }

  const number = String(invoiceNo || "").trim() || (await nextInvoiceNo(client, { companyId }));

  const { rows } = await client.query(
    `INSERT INTO sales_invoices
       (company_id, counterparty_id, invoice_no, purchase_order, subject,
        issue_date, due_date, net_laari, tax_laari, gross_laari,
        gst_treatment, gst_rate_bp, project_id, client_ref, raised_by, status, dimension_ids,
        currency, fx_rate, fc_net, fc_tax, fc_gross)
     VALUES ($1,$2,$3,$4,$5,
             COALESCE($6::date, current_date), $7::date, $8,$9,$10,
             $11::gst_t,$12,$13,$14,$15,'draft',$16,
             COALESCE($17, $18), $19, $20, $21, $22)
     RETURNING *`,
    [
      companyId,
      counterpartyId || null,
      number,
      purchaseOrder ? String(purchaseOrder).trim() : null,
      subject ? String(subject).trim() : null,
      issueDate || null,
      dueDate || null,
      net.toString(),
      tax.toString(),
      (net + tax).toString(),
      gstTreatment,
      rateBp,
      projectId || null,
      clientRef || null,
      userId,
      dimensionIds?.length ? dimensionIds : null,
      cur,
      base,
      cur ? String(fxRate) : null,
      cur ? fcNet.toString() : null,
      cur ? fcTax.toString() : null,
      cur ? (fcNet + fcTax).toString() : null,
    ]
  );
  const invoice = rows[0];

  for (const line of prepared) {
    await client.query(
      `INSERT INTO sales_invoice_lines
         (invoice_id, company_id, description, quantity, uom, unit_price_laari,
          net_laari, tax_laari, account_id, project_id, position, fc_net, item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        invoice.id,
        companyId,
        line.description,
        line.quantity,
        line.uom,
        line.unitPriceLaari.toString(),
        line.netLaari.toString(),
        line.taxLaari.toString(),
        line.accountId,
        line.projectId,
        line.position,
        line.fcNet === undefined ? null : line.fcNet.toString(),
        line.itemId,
      ]
    );
  }

  return { invoice, lines: prepared };
}

/**
 * Puts an invoice into the books.
 *
 * Debit what the customer owes; credit the income, line by line so a project
 * and a kind of income keep their own figures; credit the tax we now owe.
 * That last line is the one that matters at return time, and it is why an
 * invoice with an unknown treatment cannot be posted at all.
 */
async function post(client, { companyId, userId, invoiceId }) {
  const { rows } = await client.query(
    `SELECT s.*, c.name AS customer_name
       FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.id = $1 AND s.company_id = $2`,
    [invoiceId, companyId]
  );
  const invoice = rows[0];
  if (!invoice) throw new Error("No such invoice.");
  if (invoice.voided_at) throw new Error("That invoice was voided.");
  if (invoice.entry_id) throw new Error("That invoice is already in the books.");
  if (invoice.gst_treatment === "unknown") {
    throw new Error("Say how this invoice's GST is quoted before putting it in the books.");
  }
  if (!invoice.counterparty_id) {
    throw new Error("An invoice needs a customer before it can go into the books.");
  }

  const receivable = await accountByCode(client, { companyId, code: AR });
  const outputTax = await accountByCode(client, { companyId, code: OUTPUT_TAX });
  if (!receivable) throw new Error("This company has no receivable account in its chart.");

  const { rows: lines } = await client.query(
    `SELECT l.*, COALESCE(l.account_id, a.id) AS use_account
       FROM sales_invoice_lines l
       LEFT JOIN accounts a ON a.company_id = l.company_id AND a.code = $2
      WHERE l.invoice_id = $1 ORDER BY l.position`,
    [invoiceId, DEFAULT_INCOME]
  );
  if (!lines.length) throw new Error("That invoice has no lines.");

  const gross = BigInt(invoice.gross_laari);
  const tax = BigInt(invoice.tax_laari);
  if (tax > 0n && !outputTax) {
    throw new Error("This company has no account for the GST it owes.");
  }

  // A foreign invoice keeps its own figures on what is owed and what was
  // earned. The GST line does not: GST is owed in our own currency, at the
  // invoice rate, and must never be revalued.
  const foreign = invoice.fc_gross !== null && invoice.fc_gross !== undefined;
  const fcOf = (amount) =>
    foreign ? { currency: invoice.currency.trim(), amount: BigInt(amount), rate: String(invoice.fx_rate) } : undefined;

  const entryLines = [
    {
      accountId: receivable.id,
      debit: gross,
      fc: fcOf(invoice.fc_gross),
      counterpartyId: invoice.counterparty_id,
      memo: `${invoice.invoice_no} to ${invoice.customer_name || "customer"}`,
    },
    ...lines.map((line) => ({
      accountId: line.use_account,
      credit: BigInt(line.net_laari),
      fc: foreign && line.fc_net !== null ? fcOf(line.fc_net) : undefined,
      projectId: line.project_id,
      dimensionIds: invoice.dimension_ids,
      counterpartyId: invoice.counterparty_id,
      memo: line.description || invoice.subject || invoice.invoice_no,
    })),
  ];
  if (tax > 0n) {
    entryLines.push({
      accountId: outputTax.id,
      credit: tax,
      counterpartyId: invoice.counterparty_id,
      memo: `GST on ${invoice.invoice_no}`,
    });
  }

  // Items sold leave stock at their average cost, in the same entry, so the
  // sale and what it cost can never be in the books apart.
  const sold = await stock.invoiceCost(client, { companyId, userId, invoice, lines });
  entryLines.push(...sold.entryLines);

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: invoice.issue_date,
    source: "sales_invoice",
    sourceId: invoice.id,
    narrative: `${invoice.invoice_no} to ${invoice.customer_name || "a customer"}`,
    lines: entryLines,
  });

  await sold.record(entry.id);

  await client.query(
    `UPDATE sales_invoices SET status = 'posted', entry_id = $1, updated_at = now()
      WHERE id = $2 AND company_id = $3`,
    [entry.id, invoiceId, companyId]
  );

  // What the customer was sent, kept as it was: a later template change never reaches it.
  await require("./documents").keepCopy(client, { companyId, userId, kind: "invoice", documentId: invoiceId });

  return { entry, invoice };
}

/** What is still owed on one invoice. */
async function outstanding(client, { companyId, invoiceId }) {
  const { rows } = await client.query(
    `SELECT s.gross_laari,
            COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a
                       JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                      WHERE a.invoice_id = s.id), 0) AS paid,
            COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n
                      WHERE n.invoice_id = s.id), 0) AS credited
       FROM sales_invoices s WHERE s.id = $1 AND s.company_id = $2`,
    [invoiceId, companyId]
  );
  if (!rows.length) throw new Error("No such invoice.");
  const r = rows[0];
  return BigInt(r.gross_laari) - BigInt(r.paid) - BigInt(r.credited);
}

/**
 * Money in, against one or more invoices.
 *
 * What it settles is recorded as its own rows, because one transfer pays
 * several invoices and sometimes part of one — which is what the bank
 * statements show. Anything not allocated is still received: it sits against
 * the customer as money on account rather than being refused, because the
 * money genuinely arrived and a books that cannot say so is wrong.
 */
async function receive(client, args) {
  // Money against invoices is from their customer: said on the receipt, so a
  // statement or a portal asking "what has this customer paid" finds it.
  if (!args.counterpartyId && args.allocations?.length) {
    const { rows } = await client.query(
      "SELECT DISTINCT counterparty_id FROM sales_invoices WHERE company_id = $1 AND id = ANY($2::uuid[])",
      [args.companyId, args.allocations.map((a) => a.invoiceId)]
    );
    if (rows.length === 1 && rows[0].counterparty_id) args = { ...args, counterpartyId: rows[0].counterparty_id };
  }
  const base = await fx.baseCurrency(client, { companyId: args.companyId });
  if (args.currency && String(args.currency).toUpperCase() !== base) return receiveForeign(client, args);
  return receiveOwn(client, args);
}

const GAIN = ["4920", "Exchange gains", "income"];
const LOSS = ["5850", "Exchange losses", "expense"];

async function exchangeAccount(client, companyId, [code, name, type]) {
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t) ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId, code, name, type]
  );
  return accountByCode(client, { companyId, code });
}

/**
 * Money in another currency, against invoices in that currency.
 *
 * The bank gets the money at the day's rate. Each invoice is settled at the
 * rate it was raised at, so what it said is owed goes down by exactly its own
 * figure. The difference between the two rates is a realised exchange gain or
 * loss, on its own line, never hidden in the income. All of it has to be said
 * against invoices: money on account in another currency comes later.
 */
async function receiveForeign(client, { companyId, userId, counterpartyId, accountId, receivedOn, reference, currency, amountFc, rate, allocations = [] }) {
  const cur = String(currency).toUpperCase();
  const totalFc = toLaari(amountFc);
  if (totalFc <= 0n) throw new Error(`How many ${cur} came in?`);
  if (!accountId) throw new Error("Which account did it land in?");
  if (!rate) throw new Error(`At what rate? How many of ours one ${cur} bought that day.`);
  const inBase = fx.toBase(totalFc, rate);

  const receivable = await accountByCode(client, { companyId, code: AR });
  let fcAllocated = 0n;
  let carried = 0n;
  const checked = [];
  for (const one of allocations) {
    const part = toLaari(one.amountFc ?? one.amount);
    if (part <= 0n) continue;
    const { rows } = await client.query(
      `SELECT s.id, s.invoice_no, s.currency, s.fx_rate::text AS rate, s.gross_laari, s.fc_gross,
              COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id), 0) AS paid,
              COALESCE((SELECT SUM(a.amount_fc) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id), 0) AS paid_fc
         FROM sales_invoices s WHERE s.id = $1 AND s.company_id = $2`,
      [one.invoiceId, companyId]
    );
    const inv = rows[0];
    if (!inv) throw new Error("No such invoice.");
    if (!inv.fc_gross || inv.currency.trim() !== cur) throw new Error(`${inv.invoice_no} is not in ${cur}.`);
    const leftFc = BigInt(inv.fc_gross) - BigInt(inv.paid_fc);
    if (part > leftFc) throw new Error(`That is more than ${inv.invoice_no} has left: ${cur} ${formatLaari(leftFc)}.`);
    // Settled at the invoice's own rate; the last of it takes exactly what is left.
    const leftBase = BigInt(inv.gross_laari) - BigInt(inv.paid);
    const atInvoiceRate = part === leftFc ? leftBase : fx.toBase(part, inv.rate);
    fcAllocated += part;
    carried += atInvoiceRate;
    checked.push({ invoiceId: inv.id, amount: atInvoiceRate, amountFc: part, rate: inv.rate });
  }
  if (fcAllocated !== totalFc) {
    throw new Error(`Say which invoices the ${cur} ${formatLaari(totalFc)} pays: ${cur} ${formatLaari(totalFc - fcAllocated)} is not against any.`);
  }

  const { rows } = await client.query(
    `INSERT INTO receipts (company_id, counterparty_id, amount_laari, received_on, account_id, reference, received_by, currency, amount_fc, fx_rate)
     VALUES ($1,$2,$3,COALESCE($4::date, current_date),$5,$6,$7,$8,$9,$10) RETURNING *`,
    [companyId, counterpartyId || null, inBase.toString(), receivedOn || null, accountId, reference ? String(reference).trim() : null, userId, cur, totalFc.toString(), String(rate)]
  );
  const receipt = rows[0];
  for (const one of checked) {
    await client.query(
      `INSERT INTO receipt_allocations (company_id, receipt_id, invoice_id, amount_laari, amount_fc) VALUES ($1,$2,$3,$4,$5)`,
      [companyId, receipt.id, one.invoiceId, one.amount.toString(), one.amountFc.toString()]
    );
  }

  const lines = [
    { accountId, debit: inBase, fc: { currency: cur, amount: totalFc, rate: String(rate) }, counterpartyId: counterpartyId || null, memo: "Money in" },
    ...checked.map((one) => ({
      accountId: receivable.id,
      credit: one.amount,
      fc: { currency: cur, amount: one.amountFc, rate: one.rate },
      counterpartyId: counterpartyId || null,
      memo: "Against what was owed to us",
    })),
  ];
  const diff = inBase - carried;
  if (diff !== 0n) {
    const acct = await exchangeAccount(client, companyId, diff > 0n ? GAIN : LOSS);
    lines.push(diff > 0n ? { accountId: acct.id, credit: diff, memo: `${cur} rate moved` } : { accountId: acct.id, debit: -diff, memo: `${cur} rate moved` });
  }
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: receipt.received_on,
    source: "payment",
    sourceId: receipt.id,
    narrative: reference ? `Received: ${String(reference).trim()}` : `Money in, ${cur}`,
    lines,
  });
  await client.query(`UPDATE receipts SET entry_id = $1 WHERE id = $2`, [entry.id, receipt.id]);
  return { receipt: { ...receipt, entry_id: entry.id }, entry, allocated: carried, onAccount: 0n, exchange: diff };
}

async function receiveOwn(client, {
  companyId,
  userId,
  counterpartyId,
  amount,
  accountId,
  receivedOn,
  reference,
  allocations = [],
}) {
  const total = toLaari(amount);
  if (total <= 0n) throw new Error("How much came in?");
  if (!accountId) throw new Error("Which account did it land in?");

  const receivable = await accountByCode(client, { companyId, code: AR });
  if (!receivable) throw new Error("This company has no receivable account in its chart.");

  let allocated = 0n;
  const checked = [];
  for (const one of allocations) {
    const part = toLaari(one.amount);
    if (part <= 0n) continue;
    const { rows: cur } = await client.query("SELECT invoice_no, currency, fc_gross FROM sales_invoices WHERE id = $1 AND company_id = $2", [one.invoiceId, companyId]);
    if (cur[0]?.fc_gross) {
      throw new Error(`${cur[0].invoice_no} is in ${cur[0].currency.trim()}. Record what came in as ${cur[0].currency.trim()} at the rate the bank used, so the invoice is settled in its own currency.`);
    }
    const left = await outstanding(client, { companyId, invoiceId: one.invoiceId });
    if (part > left) {
      throw new Error(
        `That is more than invoice has left on it: ${formatLaari(left)} outstanding, ` +
          `${formatLaari(part)} being applied.`
      );
    }
    allocated += part;
    checked.push({ invoiceId: one.invoiceId, amount: part });
  }

  if (allocated > total) {
    throw new Error("More has been applied to invoices than actually came in.");
  }

  const { rows } = await client.query(
    `INSERT INTO receipts
       (company_id, counterparty_id, amount_laari, received_on, account_id, reference, received_by)
     VALUES ($1,$2,$3,COALESCE($4::date, current_date),$5,$6,$7)
     RETURNING *`,
    [
      companyId,
      counterpartyId || null,
      total.toString(),
      receivedOn || null,
      accountId,
      reference ? String(reference).trim() : null,
      userId,
    ]
  );
  const receipt = rows[0];

  for (const one of checked) {
    await client.query(
      `INSERT INTO receipt_allocations (company_id, receipt_id, invoice_id, amount_laari)
       VALUES ($1,$2,$3,$4)`,
      [companyId, receipt.id, one.invoiceId, one.amount.toString()]
    );
  }

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: receipt.received_on,
    source: "payment",
    sourceId: receipt.id,
    narrative: reference ? `Received: ${String(reference).trim()}` : "Money in",
    lines: [
      { accountId, debit: total, counterpartyId: counterpartyId || null, memo: "Money in" },
      {
        accountId: receivable.id,
        credit: total,
        counterpartyId: counterpartyId || null,
        memo: "Against what was owed to us",
      },
    ],
  });

  await client.query(`UPDATE receipts SET entry_id = $1 WHERE id = $2`, [entry.id, receipt.id]);

  return {
    receipt: { ...receipt, entry_id: entry.id },
    entry,
    allocated,
    onAccount: total - allocated,
  };
}

/**
 * Taking an invoice back, in whole or in part.
 *
 * A credit note, not a negative invoice: the customer needs a reference for
 * their own books and the return reports the two apart. It reverses the
 * income and the tax rather than the receivable alone, or the return would
 * still show output tax on work that was credited.
 */
async function creditNote(client, {
  companyId,
  userId,
  invoiceId,
  noteNo,
  reason,
  amount,
  issueDate,
}) {
  const said = String(reason || "").trim();
  if (!said) throw new Error("Say why this is being credited.");

  const { rows } = await client.query(
    `SELECT s.*, c.name AS customer_name
       FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.id = $1 AND s.company_id = $2`,
    [invoiceId, companyId]
  );
  const invoice = rows[0];
  if (!invoice) throw new Error("No such invoice.");
  if (!invoice.entry_id) throw new Error("That invoice is not in the books, so nothing is credited.");
  // ponytail: a credit note in another currency needs its own rate and its own
  // exchange line; refused until it has them rather than posted half right.
  if (invoice.fc_gross) throw new Error(`${invoice.invoice_no} is in ${invoice.currency.trim()}. Crediting an invoice in another currency is not in Sentryfi yet; raise an adjustment with your accountant.`);

  const left = await outstanding(client, { companyId, invoiceId });
  const asked = amount === undefined || amount === null ? left : toLaari(amount);
  if (asked <= 0n) throw new Error("How much is being credited?");
  if (asked > left) {
    throw new Error(
      `Only ${formatLaari(left)} is left on that invoice; ${formatLaari(asked)} cannot be credited.`
    );
  }

  // Split the credit the way the invoice was quoted, so the tax comes back out
  // in the same proportion it went in.
  const gross = BigInt(invoice.gross_laari);
  const tax = BigInt(invoice.tax_laari);
  const creditTax = gross === 0n ? 0n : (tax * asked) / gross;
  const creditNet = asked - creditTax;

  const receivable = await accountByCode(client, { companyId, code: AR });
  const outputTax = await accountByCode(client, { companyId, code: OUTPUT_TAX });
  const income = await accountByCode(client, { companyId, code: DEFAULT_INCOME });

  const number = String(noteNo || "").trim() || (await nextNoteNo(client, { companyId }));

  const lines = [
    { accountId: income.id, debit: creditNet, counterpartyId: invoice.counterparty_id, memo: said },
  ];
  if (creditTax > 0n) {
    lines.push({
      accountId: outputTax.id,
      debit: creditTax,
      counterpartyId: invoice.counterparty_id,
      memo: `GST credited on ${invoice.invoice_no}`,
    });
  }
  lines.push({
    accountId: receivable.id,
    credit: asked,
    counterpartyId: invoice.counterparty_id,
    memo: `${number} against ${invoice.invoice_no}`,
  });

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: issueDate || new Date(),
    source: "adjustment",
    narrative: `${number}: ${said} (against ${invoice.invoice_no})`,
    lines,
  });

  const { rows: noteRows } = await client.query(
    `INSERT INTO credit_notes
       (company_id, counterparty_id, invoice_id, note_no, reason, issue_date,
        net_laari, tax_laari, gross_laari, entry_id, raised_by)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, current_date),$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      companyId,
      invoice.counterparty_id,
      invoiceId,
      number,
      said,
      issueDate || null,
      creditNet.toString(),
      creditTax.toString(),
      asked.toString(),
      entry.id,
      userId,
    ]
  );

  await require("./documents").keepCopy(client, { companyId, userId, kind: "credit_note", documentId: noteRows[0].id });

  return { note: noteRows[0], entry, creditedNet: creditNet, creditedTax: creditTax };
}

async function nextNoteNo(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT note_no FROM credit_notes WHERE company_id = $1
      ORDER BY length(note_no) DESC, note_no DESC LIMIT 1`,
    [companyId]
  );
  const last = rows[0]?.note_no || null;
  const digits = last ? last.match(/(\d+)\s*$/) : null;
  const next = digits ? Number(digits[1]) + 1 : 1;
  return `CN-${String(next).padStart(4, "0")}`;
}

/**
 * Who owes what, and for how long.
 *
 * A ledger query, not a stored list. The buckets are the ones a Maldivian
 * contractor's customers actually pay on: thirty days is the common term, and
 * anything past ninety is a conversation rather than a follow-up.
 */
async function aged(client, { companyId, asOf }) {
  const { rows } = await client.query(
    `WITH settled AS (
       SELECT a.invoice_id, SUM(a.amount_laari) AS paid
         FROM receipt_allocations a
         JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
        WHERE a.company_id = $1
        GROUP BY a.invoice_id
     ), credited AS (
       SELECT n.invoice_id, SUM(n.gross_laari) AS credited
         FROM credit_notes n WHERE n.company_id = $1 GROUP BY n.invoice_id
     )
     SELECT s.id, s.invoice_no, s.issue_date, s.due_date, s.gross_laari,
            c.name AS customer, c.id AS customer_id,
            COALESCE(settled.paid, 0) AS paid,
            COALESCE(credited.credited, 0) AS credited,
            ($2::date - COALESCE(s.due_date, s.issue_date + 30)) AS days_over
       FROM sales_invoices s
       LEFT JOIN counterparties c ON c.id = s.counterparty_id
       LEFT JOIN settled ON settled.invoice_id = s.id
       LEFT JOIN credited ON credited.invoice_id = s.id
      WHERE s.company_id = $1
        AND s.status = 'posted'
        AND s.voided_at IS NULL
        AND s.gross_laari - COALESCE(settled.paid, 0) - COALESCE(credited.credited, 0) > 0
      ORDER BY days_over DESC, s.issue_date`,
    [companyId, asOf || new Date()]
  );

  const buckets = { current: 0n, thirty: 0n, sixty: 0n, ninety: 0n, older: 0n };
  const invoices = rows.map((r) => {
    const left = BigInt(r.gross_laari) - BigInt(r.paid) - BigInt(r.credited);
    const over = Number(r.days_over);
    const bucket =
      over <= 0 ? "current" : over <= 30 ? "thirty" : over <= 60 ? "sixty" : over <= 90 ? "ninety" : "older";
    buckets[bucket] += left;
    return {
      id: r.id,
      invoiceNo: r.invoice_no,
      customer: r.customer,
      customerId: r.customer_id,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      gross: formatLaari(BigInt(r.gross_laari)),
      paid: formatLaari(BigInt(r.paid) + BigInt(r.credited)),
      outstanding: formatLaari(left),
      outstandingLaari: left.toString(),
      daysOver: over > 0 ? over : 0,
      bucket,
    };
  });

  return {
    invoices,
    buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, formatLaari(v)])
    ),
    total: formatLaari(Object.values(buckets).reduce((a, b) => a + b, 0n)),
  };
}

module.exports = {
  splitTax,
  nextInvoiceNo,
  raise,
  post,
  outstanding,
  receive,
  creditNote,
  aged,
  accountByCode,
};
