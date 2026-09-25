import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowLeftRight, ArrowUp, Box, Camera, ChevronRight, ClipboardList, FileSignature, FileText, HandCoins, Mic, Minus, Plus, Receipt, ShoppingCart, Truck, UserPlus, Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/api/client";

/**
 * Everything that puts money in the books, one tap from anywhere.
 *
 * Opens over wherever the person is rather than taking them somewhere, and
 * nothing it starts is recorded until they confirm. Photographing and saying
 * a bill are always there; below them are each person's own shortcuts, which
 * they choose and order on the sheet itself, and which follow them to any
 * device. A shortcut they may not use is not shown at all.
 */

// Every shortcut the sheet can carry. `to` goes there; `bill` opens the bill sheet.
const SHORTCUTS = [
  { key: "invoice", icon: FileText, name: "Raise an invoice", sub: "To a customer, with GST added", to: "/invoices/new", may: ["record"] },
  { key: "bill", icon: Receipt, name: "Type in a bill", sub: "Item by item, or just the total", bill: true, may: ["record"] },
  { key: "quote", icon: FileSignature, name: "Make a quote", sub: "Prices a customer can say yes to", to: "/orders?kind=quote&new=1", may: ["record"] },
  { key: "sales-order", icon: ClipboardList, name: "Sales order", sub: "What a customer has ordered", to: "/orders?kind=sale&new=1", may: ["record"] },
  { key: "purchase-order", icon: ShoppingCart, name: "Purchase order", sub: "What you are ordering from a supplier", to: "/orders?new=1", may: ["record"] },
  { key: "claim", icon: HandCoins, name: "Claim expenses", sub: "Money you spent for the company", to: "/claims?new=1", may: ["record"] },
  { key: "customer", icon: UserPlus, name: "Add a customer", sub: "Name, TIN and usual terms", to: "/contacts?side=customers&new=1", may: ["record"] },
  { key: "supplier", icon: Truck, name: "Add a supplier", sub: "Name, TIN and bank details", to: "/contacts?side=suppliers&new=1", may: ["record"] },
  { key: "item", icon: Box, name: "Add an item", sub: "A product or service you sell or buy", to: "/stock?new=1", may: ["record"] },
  { key: "move", icon: ArrowLeftRight, name: "Move money", sub: "Between banks, tins and currencies", to: "/bank?move=1", may: ["approve", "adjust"] },
  { key: "tin", icon: Wallet, name: "Give cash to a tin", sub: "Held until the holder confirms", to: "/bank", may: ["approve", "adjust"] },
];
const USUAL = ["invoice", "move", "tin"];

export function RecordSheet({ open, onClose, onBill }) {
  const navigate = useNavigate();
  const { can } = useCompany();
  const { user, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");

  const allowed = SHORTCUTS.filter((s) => s.may.some((m) => can(m)));
  const keys = (draft ?? user?.shortcuts ?? USUAL).filter((k) => allowed.some((s) => s.key === k));
  const chosen = keys.map((k) => allowed.find((s) => s.key === k));
  const more = allowed.filter((s) => !keys.includes(s.key));

  const close = () => (setEditing(false), setDraft(null), setErr(""), onClose());
  const run = (s) => (close(), s.bill ? onBill(true) : navigate(s.to));
  const move = (i, d) => setDraft(keys.map((k, j) => (j === i ? keys[i + d] : j === i + d ? keys[i] : k)));
  async function save() {
    if (draft) {
      try {
        await apiClient.patch("/auth/shortcuts", { shortcuts: draft });
        await refresh();
      } catch (ex) {
        return setErr(ex.message);
      }
    }
    setDraft(null);
    setEditing(false);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      variant="sheet"
      title={editing ? "Your shortcuts" : "Record"}
      description={editing ? "Photograph and Say it always stay. Choose what sits under them, and in what order." : "Nothing is in the books until you confirm."}
      className="rounded-t-[22px] border-t-0 bg-[var(--bg)]"
    >
      <input
        id="record-camera"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="record-camera"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (!files.length) return;
          close();
          onBill({ files });
        }}
      />

      {editing ? (
        <div data-testid="shortcuts-edit">
          <List label="On the sheet" empty="Nothing under Photograph and Say it. Add one below.">
            {chosen.map((s, i) => (
              <Row key={s.key} s={s} i={i}>
                <Small label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></Small>
                <Small label={`Move ${s.name} down`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></Small>
                <Small label={`Take ${s.name} off`} onClick={() => setDraft(keys.filter((k) => k !== s.key))} danger><Minus size={16} /></Small>
              </Row>
            ))}
          </List>
          {more.length > 0 && (
            <List label="Add more">
              {more.map((s, i) => (
                <Row key={s.key} s={s} i={i}>
                  <Small label={`Add ${s.name}`} onClick={() => setDraft([...keys, s.key])} accent><Plus size={16} /></Small>
                </Row>
              ))}
            </List>
          )}
          {err && <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">{err}</p>}
          <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-[var(--bg)] shadow-[0_40px_0_0_var(--bg)] flex items-center gap-2">
            <button type="button" onClick={() => setDraft(USUAL)} className="mr-auto text-[14px] font-medium text-[var(--ink-muted)] underline underline-offset-4">
              Back to the usual
            </button>
            <button type="button" onClick={() => (setDraft(null), setEditing(false))} className="h-11 px-5 rounded-full border border-[var(--border)] bg-[var(--surface)] font-semibold">
              Cancel
            </button>
            <button type="button" onClick={save} data-testid="shortcuts-done" className="h-11 px-6 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-semibold">
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {can("record") && (
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <Tile icon={Camera} name="Photograph a bill" sub="Read, checked by you" onClick={() => document.getElementById("record-camera")?.click()} primary />
              <Tile icon={Mic} name="Say it" sub="Dhivehi or English" onClick={() => (close(), onBill({ say: true }))} />
            </div>
          )}
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Shortcuts</h3>
            <button type="button" onClick={() => setEditing(true)} data-testid="shortcuts-edit-open" className="h-9 px-3 -mr-2 rounded-full text-[14px] font-semibold text-[var(--deep)]">
              Edit
            </button>
          </div>
          {chosen.length ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {chosen.map((s, i) => (
                <button key={s.key} type="button" onClick={() => run(s)} className={`w-full flex items-center gap-3.5 min-h-[60px] px-3.5 py-2 text-left ${i ? "border-t border-[var(--border)]" : ""}`}>
                  <Icon s={s} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{s.name}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)] truncate">{s.sub}</span>
                  </span>
                  <ChevronRight size={18} className="text-[var(--ink-muted)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="w-full rounded-2xl border border-dashed border-[var(--border)] p-4 text-[14px] text-[var(--ink-muted)]">
              No shortcuts. Tap to add the ones you use.
            </button>
          )}
          <button type="button" onClick={close} className="w-full mt-3 h-[52px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] font-semibold">
            Cancel
          </button>
        </>
      )}
    </Modal>
  );
}

function Tile({ icon: I, name, sub, onClick, primary }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl p-3.5 text-left min-h-[104px] flex flex-col justify-between ${primary ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface)] border border-[var(--border)]"}`}>
      <I size={24} aria-hidden="true" />
      <span>
        <span className="block text-[16px] font-semibold leading-tight">{name}</span>
        <span className={`block text-[12px] ${primary ? "opacity-75" : "text-[var(--ink-muted)]"}`}>{sub}</span>
      </span>
    </button>
  );
}

const Icon = ({ s }) => (
  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--surface-2)] text-[var(--ink)]">
    <s.icon size={20} aria-hidden="true" />
  </span>
);

function List({ label, empty, children }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="mb-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)] mb-2 px-1">{label}</h3>
      {has ? <ul className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">{children}</ul> : <p className="text-[14px] text-[var(--ink-muted)] px-1">{empty}</p>}
    </section>
  );
}

function Row({ s, i, children }) {
  return (
    <li className={`flex items-center gap-3 min-h-[56px] px-3 py-1.5 ${i ? "border-t border-[var(--border)]" : ""}`}>
      <Icon s={s} />
      <span className="min-w-0 flex-1 text-[15px] font-semibold truncate">{s.name}</span>
      {children}
    </li>
  );
}

function Small({ label, onClick, disabled, danger, accent, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`h-10 w-10 shrink-0 rounded-full grid place-items-center disabled:opacity-30 ${danger ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]" : accent ? "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"}`}
    >
      {children}
    </button>
  );
}
