import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, Package, Plus, Search, UserRound, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { usePhone } from "@/lib/phone";
import { UnitInput } from "@/components/ui/UnitInput";
import { cn, toDateInput } from "@/lib/utils";

/**
 * The parts every "new document" form is made of, so a quote, an order, an
 * invoice or a bill all ask in the same order: who it is for, what it is for,
 * on which terms, then anything else. A phone gets a sheet from the bottom;
 * anything wider gets a dialog.
 */

const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const termsLabel = (d) => (d == null ? null : d === 0 ? "On receipt" : `${d} days`);

/** One numbered step. Done shows a tick and a one-line summary beside the title. */
export function Step({ n, title, done, active, summary, id, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-24 rounded-[20px] bg-[var(--surface)] lift p-4 sm:p-5 transition-shadow", active && "ring-2 ring-[var(--accent)]")}>
      <header className="flex items-center gap-3 min-w-0">
        <span aria-hidden="true" className={cn("h-7 w-7 shrink-0 rounded-full grid place-items-center text-[13px] font-semibold tabular", done ? "bg-[var(--ink)] text-[var(--bg)]" : active ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]")}>
          {done ? <Check size={15} strokeWidth={3} /> : n}
        </span>
        <h2 id={`${id}-h`} className="text-[16px] font-semibold shrink-0">{title}</h2>
        {done && summary && <span className="ml-auto min-w-0 truncate text-[13px] text-[var(--ink-muted)]">{summary}</span>}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A searchable list in a sheet (phone) or dialog (wider). */
function PickList({ open, onClose, title, ...rest }) {
  const phone = usePhone();
  // The list mounts with the dialog, so each opening starts with an empty search.
  return (
    <Modal open={open} onClose={onClose} title={title} variant={phone ? "sheet" : "card"} size="lg">
      <PickBody title={title} {...rest} />
    </Modal>
  );
}

function PickBody({ title, placeholder, rows, render, onPick, create, loading, top, footer, empty = "Nobody here yet. Type a name to add them." }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const shown = useMemo(() => (words ? rows.filter((r) => r.name.toLowerCase().includes(words)) : rows).slice(0, 60), [rows, words]);
  const exact = rows.some((r) => r.name.toLowerCase() === words);
  return (
    <>
      {top}
      <label className="relative block">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (shown[0]) onPick(shown[0]); else if (words && create) create.onCreate(q.trim()); } }}
          className="w-full h-12 pl-11 pr-4 rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[16px] outline-none focus:border-[var(--ink)] focus:bg-[var(--surface)]" />
      </label>
      <ul className="mt-3 -mx-2 max-h-[min(56dvh,440px)] overflow-y-auto" role="listbox" aria-label={title}>
        {create && words && !exact && (
          <li>
            <button type="button" onClick={() => create.onCreate(q.trim())} disabled={create.busy} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-[var(--surface-2)]">
              <span className="h-10 w-10 shrink-0 rounded-full grid place-items-center bg-[var(--accent)] text-[var(--on-accent)]">{create.busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}</span>
              <span className="min-w-0"><span className="block text-[15px] font-semibold truncate">Add “{q.trim()}”</span><span className="block text-[13px] text-[var(--ink-muted)]">{create.label}</span></span>
            </button>
          </li>
        )}
        {loading && <li className="px-2 py-6 text-center text-[14px] text-[var(--ink-muted)]">Loading…</li>}
        {shown.map((r) => (
          <li key={r.id} role="option" aria-selected="false">
            <button type="button" onClick={() => onPick(r)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] outline-none">
              {render(r)}
              <ChevronRight size={16} className="ml-auto shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!loading && !shown.length && !words && <li className="px-2 py-6 text-center text-[14px] text-[var(--ink-muted)]">{empty}</li>}
      </ul>
      {footer}
    </>
  );
}

/**
 * Who the document is for: a customer or a supplier from the list, or a new
 * one added on the spot. The choice carries their usual terms.
 */
export function PartyPicker({ kind = "customer", value, onChange, open, setOpen }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["contacts", companyId], queryFn: () => apiClient.get("/contacts").then((r) => r.data), enabled: Boolean(companyId) });
  const rows = (data?.contacts || []).filter((c) => !c.archived && c[kind]);
  const [busy, setBusy] = useState(false);
  const [like, setLike] = useState(null);
  const word = kind === "customer" ? "customer" : "supplier";
  const pick = (c) => (onChange({ id: c.id, name: c.name, termsDays: c.termsDays ?? null, email: c.email || null }), setOpen(false), setLike(null));
  async function add(name, force = false) {
    setBusy(true);
    try {
      const r = await apiClient.post("/contacts", { name, [kind]: true, force });
      qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      pick({ id: r.data.id, name, termsDays: null });
    } catch (ex) {
      if (ex.status === 409 && ex.details?.lookalikes) setLike({ name, list: ex.details.lookalikes });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-3" data-testid="party-chosen">
          <span className="h-11 w-11 shrink-0 rounded-full grid place-items-center bg-[var(--ink)] text-[var(--accent)] font-display font-bold">{initials(value.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold truncate">{value.name}</span>
            <span className="block text-[13px] text-[var(--ink-muted)] truncate">{value.termsDays != null ? `Usually pays ${value.termsDays === 0 ? "on receipt" : `in ${value.termsDays} days`}` : "No usual terms yet"}{value.email ? ` · ${value.email}` : ""}</span>
          </span>
          <button type="button" onClick={() => setOpen(true)} className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px] font-medium hover:border-[var(--ink)]">Change</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid="party-open" className="w-full flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] p-3 text-left hover:border-[var(--ink)] hover:bg-[var(--surface-2)]">
          <span className="h-11 w-11 shrink-0 rounded-full grid place-items-center bg-[var(--surface-2)]"><UserRound size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Choose a {word}</span>
            <span className="block text-[13px] text-[var(--ink-muted)]">Search the list, or add a new one</span>
          </span>
          <Search size={17} className="text-[var(--ink-muted)]" aria-hidden="true" />
        </button>
      )}
      <PickList
        open={open}
        onClose={() => (setOpen(false), setLike(null))}
        title={like ? `Is “${like.name}” one of these?` : `Choose a ${word}`}
        placeholder={`Search ${word}s`}
        loading={isLoading}
        rows={like ? like.list.map((l) => ({ ...l, ...(rows.find((r) => r.id === l.id) || {}) })) : rows}
        onPick={pick}
        create={like ? { label: "No, it's someone new", busy, onCreate: () => add(like.name, true) } : { label: `A new ${word}. Their details can be filled in later.`, busy, onCreate: (n) => add(n) }}
        render={(c) => (
          <>
            <span className="h-10 w-10 shrink-0 rounded-full grid place-items-center bg-[var(--surface-2)] text-[13px] font-semibold">{initials(c.name)}</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium truncate">{c.name}</span>
              <span className="block text-[13px] text-[var(--ink-muted)] truncate">
                {[termsLabel(c.termsDays), c.overdue ? `${c.overdue} overdue` : kind === "customer" && c.receivable && c.receivable !== "0.00" ? `${c.receivable} owed` : null].filter(Boolean).join(" · ") || "No usual terms"}
              </span>
            </span>
          </>
        )}
      />
    </>
  );
}

/**
 * Saved items, products and services, to add as lines. One that is not there
 * yet is added on the spot, kept in the item list, and put on the line.
 */
export function ItemPicker({ open, setOpen, items, onPick, onAdd, basket, side = "sale" }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);
  // With onAdd, the list stays open: an item asks how many and at what rate,
  // goes on, and the list comes back for the next one.
  const [chosen, setChosen] = useState(null);
  const [kind, setKind] = useState("all");
  const close = () => (setOpen(false), setDraft(null), setChosen(null));
  const phone = usePhone();
  // An item nobody has classed for GST is worked out while its quantity is typed.
  const classify = (it) => !it.tax && apiClient.post(`/stock/${it.id}/tax`).then((r) => r.data.tax && qc.invalidateQueries({ queryKey: ["stock", companyId] }), () => {});
  const take = (it) => (classify(it), onAdd ? setChosen(it) : (onPick(it), close()));
  if (chosen) {
    return (
      <Modal open={open} onClose={close} title={chosen.name} description={chosen.kind === "service" ? "A service" : chosen.kind === "bundle" ? "A bundle" : "A product"} variant={phone ? "sheet" : "card"} size="md">
        <QtyRate item={chosen} side={side} onBack={() => setChosen(null)} onAdd={(line) => (onAdd(chosen, line), setChosen(null))} />
      </Modal>
    );
  }
  if (draft) {
    return (
      <Modal open={open} onClose={close} title={`Add “${draft}”`} description="Kept in your items, so next time it is one tap." variant={phone ? "sheet" : "card"} size="lg">
        <NewItem name={draft} side={side} onBack={() => setDraft(null)} onSaved={(it) => (setDraft(null), take(it))} />
      </Modal>
    );
  }
  const both = items.some((i) => i.kind === "service") && items.some((i) => i.kind !== "service");
  const rows = kind === "all" ? items : items.filter((i) => (kind === "service") === (i.kind === "service"));
  return (
    <PickList
      open={open}
      onClose={close}
      title={onAdd ? "What goes on it?" : "Add an item or service"}
      placeholder="Search items and services"
      rows={rows}
      top={
        both && (
          <div role="radiogroup" aria-label="Which kind" className="grid grid-cols-3 gap-1 p-1 mb-3 rounded-full bg-[var(--surface-2)]">
            {[["all", "All"], ["product", "Products"], ["service", "Services"]].map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cn("h-9 rounded-full text-[14px] font-medium", kind === k ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)]")}>
                {label}
              </button>
            ))}
          </div>
        )
      }
      footer={basket}
      create={{ label: "A new item or service, kept for next time", onCreate: setDraft }}
      empty="No items yet. Type what it is to add it."
      onPick={take}
      render={(it) => (
        <>
          <span className="h-10 w-10 shrink-0 rounded-full overflow-hidden grid place-items-center bg-[var(--surface-2)]">{it.photo ? <img src={it.photo} alt="" className="h-full w-full object-cover" /> : <Package size={17} />}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium truncate">{it.name}</span>
            <span className="block text-[13px] text-[var(--ink-muted)] truncate">
              {[(side === "purchase" ? it.buyPrice : it.salePrice) ? `${side === "purchase" ? it.buyPrice : it.salePrice} a ${it.unit || "unit"}` : null, it.counted ? `${it.onHand} on hand` : it.kind === "service" ? "Service" : it.kind === "bundle" ? "Bundle" : null, it.tax !== "standard" && TAX_WORD[it.tax]].filter(Boolean).join(" · ")}
            </span>
          </span>
        </>
      )}
    />
  );
}

const FIELD = "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)]";

function NewItem({ name, side, onBack, onSaved }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [f, setF] = useState({ name, kind: "service", unit: "", price: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const priceKey = side === "purchase" ? "buyPrice" : "salePrice";
  async function save() {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const price = f.price.replace(/,/g, "").trim() || null;
      const unit = f.unit.trim() || (f.kind === "service" ? "job" : "pcs");
      // ponytail: a new product starts uncounted; counting is turned on in Items once stock is taken in.
      const r = await apiClient.post("/stock", { name: f.name.trim(), kind: f.kind, unit, counted: false, [priceKey]: price });
      qc.invalidateQueries({ queryKey: ["stock", companyId] });
      qc.invalidateQueries({ queryKey: ["units", companyId] });
      onSaved({ ...r.data.item, [priceKey]: price });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }
  return (
    // Not a <form>: this sits inside the document's own form, and a nested form would submit that one.
    <div className="grid gap-4" data-testid="new-item" onKeyDown={(e) => e.key === "Enter" && e.target.tagName === "INPUT" && (e.preventDefault(), save())}>
      <label className="grid gap-1.5">
        <span className="text-[13px] font-medium">Name</span>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={160} className={FIELD} />
      </label>
      <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-2">
        {[["service", "A service", "Work or time"], ["product", "A product", "A thing"]].map(([k, t, s]) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })}
            className={cn("rounded-2xl border p-3 text-left", f.kind === k ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink)]")}>
            <span className="block text-[15px] font-semibold">{t}</span>
            <span className={cn("block text-[13px]", f.kind === k ? "opacity-75" : "text-[var(--ink-muted)]")}>{s}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 min-w-0">
          <span className="text-[13px] font-medium">Counted in</span>
          <UnitInput label="Unit" value={f.unit} onChange={(unit) => setF({ ...f, unit })} placeholder={f.kind === "service" ? "job, day, hr" : "pcs, bag, m³"} className={FIELD} />
        </label>
        <label className="grid gap-1.5 min-w-0">
          <span className="text-[13px] font-medium">{side === "purchase" ? "Usual cost" : "Usual price"}</span>
          <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} inputMode="decimal" placeholder="0.00" className={cn(FIELD, "tabular")} />
        </label>
      </div>
      {err && <p role="alert" className="text-[14px] text-[var(--danger)]">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onBack} className="h-11 px-5 rounded-full border border-[var(--border)] text-[15px] font-medium hover:border-[var(--ink)]">Back</button>
        <button type="button" onClick={save} disabled={busy || !f.name.trim()} data-testid="new-item-save" className="h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {busy && <Loader2 size={16} className="animate-spin" />} Save and add
        </button>
      </div>
    </div>
  );
}

export const TAX_WORD = { standard: "Standard GST", zero_rated: "Zero-rated", exempt: "Exempt" };

/**
 * The GST treatment a document's items call for. One class across the items
 * sets it; standard keeps the inclusive or exclusive already chosen, and an
 * unregistered supplier charges none whatever the items are. Items of
 * different classes cannot share one document, and one nobody has classed
 * is left to the person.
 */
export function taxFromItems(items, current, standard = "exclusive") {
  const known = items.filter((i) => i?.tax);
  const classes = [...new Set(known.map((i) => i.tax))];
  const out = { treatment: current, mixed: classes.length > 1 ? known : null, unknown: items.filter((i) => i && !i.tax), known };
  if (classes.length !== 1 || current === "none_unregistered") return out;
  const c = classes[0];
  out.treatment = c !== "standard" ? c : ["inclusive", "exclusive"].includes(current) ? current : standard;
  return out;
}

/** What the items say about GST, under the choice on the Tax step. */
export function ItemsTaxNote({ from, doc = "invoice" }) {
  if (!from.known.length && !from.unknown.length) return null;
  const names = (list) => list.map((i) => i.name).join(", ");
  return (
    <div className="mt-3 grid gap-1 text-[13px]" data-testid="items-tax">
      {from.mixed ? (
        <p role="alert" className="text-[var(--danger)]">
          {Object.entries(TAX_WORD).map(([k, w]) => ({ w, list: from.mixed.filter((i) => i.tax === k) })).filter((g) => g.list.length).map((g) => `${g.w}: ${names(g.list)}`).join(". ")}. One {doc} carries one GST class: put them on separate ones.
        </p>
      ) : (
        from.known.length > 0 && (
          <p className="text-[var(--ink-muted)]">
            The items are {TAX_WORD[from.known[0].tax].toLowerCase()}
            {from.known.some((i) => i.taxBy === "ai") && ` (suggested: ${from.known.find((i) => i.taxBy === "ai").taxWhy || "from the item names"})`}.
          </p>
        )
      )}
      {from.unknown.length > 0 && <p className="text-[var(--ink-muted)]">Not yet classed for GST: {names(from.unknown)}. Set it in Items.</p>}
    </div>
  );
}

/**
 * What is on the document so far, under the item list: each line with a way
 * off, and the one way on. Shared by every guided "new document" flow.
 */
export function Basket({ lines, onRemove, onNext, nextLabel }) {
  if (!lines.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]" data-testid="basket">
      <ul className="grid gap-1 max-h-[22dvh] overflow-y-auto">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate">
              {l.label} <span className="text-[var(--ink-muted)] tabular">· {l.detail}</span>
            </span>
            <span className="tabular">{l.amount}</span>
            <button type="button" onClick={() => onRemove(l.key)} aria-label={`Take ${l.label} off`} className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onNext} data-testid="flow-next" className="w-full mt-3 h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold">
        {nextLabel}
      </button>
    </div>
  );
}

/** Back and on, at the foot of each step of a guided flow. */
export function FlowButtons({ back, next, label, disabled, busy, testid = "flow-next" }) {
  return (
    <div className="flex gap-2 justify-end mt-5">
      <button type="button" onClick={back} className="h-11 px-5 rounded-full border border-[var(--border)] text-[15px] font-medium hover:border-[var(--ink)]">
        Back
      </button>
      <button type="button" onClick={next} disabled={disabled || busy} data-testid={testid} className="h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
        {busy && <Loader2 size={16} className="animate-spin" />}
        {label}
      </button>
    </div>
  );
}

/**
 * How many, and at what rate: one item on its way onto a document. The rate
 * starts at the item's usual price; the amount is worked out as it is typed.
 */
function QtyRate({ item, side, onBack, onAdd }) {
  const usual = (side === "purchase" ? item.buyPrice : item.salePrice) || "";
  const [f, setF] = useState({ quantity: "1", uom: item.unit || "", rate: String(usual).replace(/,/g, "") });
  const qty = Number(String(f.quantity).replace(/,/g, ""));
  const rate = Number(String(f.rate).replace(/,/g, ""));
  const ok = qty > 0 && f.rate !== "" && rate >= 0;
  const step = (d) => setF((x) => ({ ...x, quantity: String(Math.max(1, (Number(x.quantity) || 0) + d)) }));
  const add = () => ok && onAdd({ quantity: String(qty), uom: f.uom.trim(), rate: f.rate.trim() });
  return (
    // Not a <form>, for the same reason as NewItem.
    <div className="grid gap-4" data-testid="qty-rate" onKeyDown={(e) => e.key === "Enter" && e.target.tagName === "INPUT" && (e.preventDefault(), add())}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-3">
        <div className="grid gap-1.5 min-w-0">
          <span className="text-[13px] font-medium" aria-hidden="true">Quantity</span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => step(-1)} aria-label="One less" className="h-11 w-11 shrink-0 rounded-full border border-[var(--border)] text-[18px] hover:border-[var(--ink)]">−</button>
            <input autoFocus value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} onFocus={(e) => e.target.select()} inputMode="decimal" aria-label="Quantity" className={cn(FIELD, "px-2 text-center tabular")} />
            <button type="button" onClick={() => step(1)} aria-label="One more" className="h-11 w-11 shrink-0 rounded-full border border-[var(--border)] text-[18px] hover:border-[var(--ink)]">+</button>
          </span>
        </div>
        <label className="grid gap-1.5 min-w-0">
          <span className="text-[13px] font-medium">Unit</span>
          <UnitInput label="Unit" value={f.uom} onChange={(uom) => setF({ ...f, uom })} placeholder="day" className={FIELD} />
        </label>
      </div>
      <label className="grid gap-1.5">
        <span className="text-[13px] font-medium">{side === "purchase" ? "Cost" : "Rate"}{f.uom ? ` a ${f.uom}` : ""}</span>
        <input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label="Rate" className={cn(FIELD, "tabular")} />
      </label>
      <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[14px] text-[var(--ink-muted)]">Amount</span>
        <span className="text-[20px] font-semibold tabular">{ok ? (qty * rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onBack} className="h-11 px-5 rounded-full border border-[var(--border)] text-[15px] font-medium hover:border-[var(--ink)]">Back</button>
        <button type="button" onClick={add} disabled={!ok} data-testid="qty-add" className="h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold disabled:opacity-50">Add to it</button>
      </div>
    </div>
  );
}

const TERMS = [[0, "On receipt"], [7, "7 days"], [15, "15 days"], [30, "30 days"], [45, "45 days"], [60, "60 days"], ["eom", "End of month"]];
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateInput(d);
};
export const dueFrom = (issued, t) => {
  if (!issued || t == null || t === "date") return null;
  if (t === "eom") {
    const d = new Date(`${issued}T00:00:00`);
    return toDateInput(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  return addDays(issued, t);
};

/**
 * On which terms: one tap, and the due date follows from the issue date.
 * The party's usual terms come chosen and are marked; when they have none,
 * it asks, and offers to keep the answer as theirs.
 */
export function TermsPicker({ issued, terms, due, onChange, party, keep, onKeep, question = "On which terms?" }) {
  const usual = party?.termsDays ?? null;
  const ask = party && usual == null && terms == null;
  return (
    <div className="grid gap-3">
      {ask && <p className="text-[14px] font-medium">{party.name} has no usual terms. {question}</p>}
      <div role="radiogroup" aria-label="Payment terms" className="flex flex-wrap gap-2">
        {[...TERMS, ["date", "Pick a date"]].map(([t, label]) => {
          const on = terms === t;
          return (
            <button key={String(t)} type="button" role="radio" aria-checked={on} onClick={() => onChange({ terms: t, due: t === "date" ? due || issued : dueFrom(issued, t) })}
              className={cn("h-10 px-4 rounded-full border text-[14px] whitespace-nowrap inline-flex items-center gap-1.5", on ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)]", ask && "border-[var(--accent)]")}>
              {label}
              {usual === t && <span className={cn("text-[11px] font-semibold uppercase tracking-wide", on ? "text-[var(--accent)]" : "text-[var(--ink-muted)]")}>Usual</span>}
            </button>
          );
        })}
      </div>
      {terms === "date" && (
        <label className="grid gap-1.5 max-w-[220px]">
          <span className="text-[13px] font-medium">Due on</span>
          <input type="date" value={due || ""} min={issued} onChange={(e) => onChange({ terms: "date", due: e.target.value })} className="h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] tabular outline-none focus:border-[var(--ink)]" />
        </label>
      )}
      {due && terms !== "date" && <p className="text-[13px] text-[var(--ink-muted)] tabular" data-testid="due-said">Due {new Date(`${due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>}
      {party?.id && typeof terms === "number" && terms !== usual && onKeep && (
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} className="h-4 w-4" />
          Keep “{termsLabel(terms)}” as {party.name}'s usual terms
        </label>
      )}
    </div>
  );
}
