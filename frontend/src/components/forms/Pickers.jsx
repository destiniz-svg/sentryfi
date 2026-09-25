import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, Package, Plus, Search, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { usePhone } from "@/lib/phone";
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

function PickBody({ title, placeholder, rows, render, onPick, create, loading }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const shown = useMemo(() => (words ? rows.filter((r) => r.name.toLowerCase().includes(words)) : rows).slice(0, 60), [rows, words]);
  const exact = rows.some((r) => r.name.toLowerCase() === words);
  return (
    <>
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
        {!loading && !shown.length && !words && <li className="px-2 py-6 text-center text-[14px] text-[var(--ink-muted)]">Nobody here yet. Type a name to add them.</li>}
      </ul>
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

/** Saved items, products and services, to add as lines. */
export function ItemPicker({ open, setOpen, items, onPick }) {
  return (
    <PickList
      open={open}
      onClose={() => setOpen(false)}
      title="Add an item or service"
      placeholder="Search items and services"
      rows={items}
      onPick={(it) => (onPick(it), setOpen(false))}
      render={(it) => (
        <>
          <span className="h-10 w-10 shrink-0 rounded-full overflow-hidden grid place-items-center bg-[var(--surface-2)]">{it.photo ? <img src={it.photo} alt="" className="h-full w-full object-cover" /> : <Package size={17} />}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium truncate">{it.name}</span>
            <span className="block text-[13px] text-[var(--ink-muted)] truncate">
              {[it.salePrice ? `${it.salePrice} a ${it.unit || "unit"}` : null, it.counted ? `${it.onHand} on hand` : it.kind === "service" ? "Service" : it.kind === "bundle" ? "Bundle" : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </>
      )}
    />
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
