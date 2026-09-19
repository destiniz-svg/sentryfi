function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function computeTotals(items, taxRate = 0, discount = 0) {
  const normItems = (items || []).map((it, i) => {
    const quantity = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    return {
      description: (it.description || "").toString(),
      quantity,
      rate,
      amount: round2(quantity * rate),
      position: it.position ?? i,
    };
  });

  const subtotal = round2(normItems.reduce((s, it) => s + it.amount, 0));
  const disc = Math.min(round2(Number(discount) || 0), subtotal);
  const taxableBase = round2(subtotal - disc);
  const taxAmount = round2((taxableBase * (Number(taxRate) || 0)) / 100);
  const total = round2(taxableBase + taxAmount);

  return { items: normItems, subtotal, discount: disc, taxAmount, total };
}

function effectiveStatus(invoice) {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "sent" && invoice.due_date) {
    const due = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return "overdue";
  }
  return invoice.status;
}

function serializeInvoice(row, items) {
  const num = (v) => (v == null ? 0 : Number(v));
  const base = {
    ...row,
    tax_rate: num(row.tax_rate),
    discount: num(row.discount),
    subtotal: num(row.subtotal),
    tax_amount: num(row.tax_amount),
    total: num(row.total),
  };
  base.effective_status = effectiveStatus(base);
  if (items) {
    base.items = items.map((it) => ({
      ...it,
      quantity: num(it.quantity),
      rate: num(it.rate),
      amount: num(it.amount),
    }));
  }
  return base;
}

module.exports = { round2, computeTotals, effectiveStatus, serializeInvoice };
