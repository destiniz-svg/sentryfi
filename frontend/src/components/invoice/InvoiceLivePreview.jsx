import { formatMoney, formatDate } from "@/lib/utils";

/**
 * The invoice as it will be sent, drawn live while you type. Site Board: ink on
 * board white, square corners, condensed display type, tabular figures. It is a
 * document, so it stays monochrome and carries no signal yellow — the yellow
 * belongs on the action that sends it.
 */

const Rule = ({ heavy = false }) => (
  <div
    aria-hidden="true"
    style={{
      height: heavy ? 2 : 1,
      background: heavy ? "var(--ink)" : "var(--border)",
    }}
  />
);

const Label = ({ children }) => (
  <div className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
    {children}
  </div>
);

export default function InvoiceLivePreview({
  form,
  totals,
  settings,
  client,
  invoiceNumber,
}) {
  const currency = form.currency || "MVR";
  const items = (form.items || []).filter(
    (it) => (it.description || "").trim() || Number(it.quantity) || Number(it.rate)
  );
  const taxRate = Number(form.tax_rate) || 0;

  return (
    <div className="bg-[var(--surface)] border-2 border-[var(--ink)] p-6 text-[var(--ink)]">
      <div className="flex items-start justify-between gap-4 pb-5">
        <div className="min-w-0">
          <div className="font-display text-[26px] font-bold uppercase leading-none tracking-tight">
            {settings?.company_name?.trim() || "Your company"}
          </div>
          {settings?.address ? (
            <div className="text-[12px] leading-snug text-[var(--ink-muted)] mt-1 whitespace-pre-line">
              {settings.address}
            </div>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-[22px] font-bold uppercase leading-none">Invoice</div>
          <div className="text-[12px] text-[var(--ink-muted)] mt-1 tabular">
            {invoiceNumber || "Number on save"}
          </div>
        </div>
      </div>

      <Rule heavy />

      <div className="grid grid-cols-2 gap-5 py-5">
        <div className="min-w-0">
          <Label>Billed to</Label>
          <div className="font-semibold text-[15px] mt-1 truncate">
            {client?.name || "Choose a customer"}
          </div>
          {client?.company ? (
            <div className="text-[12px] text-[var(--ink-muted)] truncate">{client.company}</div>
          ) : null}
          {client?.address ? (
            <div className="text-[12px] text-[var(--ink-muted)] whitespace-pre-line">
              {client.address}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label>Issued</Label>
            <span className="text-[13px] tabular">
              {form.issue_date ? formatDate(form.issue_date) : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <Label>Due</Label>
            <span className="text-[13px] tabular">
              {form.due_date ? formatDate(form.due_date) : "—"}
            </span>
          </div>
        </div>
      </div>

      <div
        className="grid items-center gap-3 pb-2"
        style={{ gridTemplateColumns: "minmax(0,1fr) 54px 84px 96px" }}
      >
        <Label>Item</Label>
        <div className="text-right">
          <Label>Qty</Label>
        </div>
        <div className="text-right">
          <Label>Rate</Label>
        </div>
        <div className="text-right">
          <Label>Amount</Label>
        </div>
      </div>
      <Rule heavy />

      {items.length === 0 ? (
        <div className="py-6 text-[13px] text-[var(--ink-muted)]">
          Nothing on the invoice yet. Add a line and it appears here.
        </div>
      ) : (
        items.map((it, i) => (
          <div key={i}>
            <div
              className="grid items-center gap-3 py-3"
              style={{ gridTemplateColumns: "minmax(0,1fr) 54px 84px 96px" }}
            >
              <div className="text-[14px] truncate">
                {(it.description || "").trim() || <span className="text-[var(--ink-muted)]">Untitled line</span>}
              </div>
              <div className="text-right text-[13px] tabular">{Number(it.quantity) || 0}</div>
              <div className="text-right text-[13px] tabular">
                {formatMoney(Number(it.rate) || 0, currency)}
              </div>
              <div className="text-right text-[14px] font-semibold tabular">
                {formatMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0), currency)}
              </div>
            </div>
            <Rule />
          </div>
        ))
      )}

      <div className="flex justify-end pt-4">
        <div className="w-full max-w-[280px] space-y-2">
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-[var(--ink-muted)]">Subtotal</span>
            <span className="tabular">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex items-baseline justify-between gap-4 text-[13px]">
              <span className="text-[var(--ink-muted)]">Discount</span>
              <span className="tabular">− {formatMoney(totals.discount, currency)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-[var(--ink-muted)]">
              {taxRate > 0 ? `GST ${taxRate}%` : "GST"}
            </span>
            <span className="tabular">{formatMoney(totals.taxAmount, currency)}</span>
          </div>
          <Rule heavy />
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em]">
              Amount due
            </span>
            <span className="font-display text-[26px] font-bold leading-none tabular">
              {formatMoney(totals.total, currency)}
            </span>
          </div>
        </div>
      </div>

      {(form.notes || "").trim() || (form.terms || "").trim() ? (
        <div className="pt-6 space-y-4">
          {(form.notes || "").trim() ? (
            <div>
              <Label>Notes</Label>
              <div className="text-[12px] leading-relaxed text-[var(--ink-muted)] mt-1 whitespace-pre-line">
                {form.notes}
              </div>
            </div>
          ) : null}
          {(form.terms || "").trim() ? (
            <div>
              <Label>Terms</Label>
              <div className="text-[12px] leading-relaxed text-[var(--ink-muted)] mt-1 whitespace-pre-line">
                {form.terms}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
