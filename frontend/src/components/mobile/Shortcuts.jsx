import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/api/client";
import { USUAL, shortcutsFor } from "@/lib/shortcuts";

/**
 * A person's own Record shortcuts: the ones they chose, in their order, of
 * those their permissions and their roles' rules allow. Kept on the person,
 * so every device shows the same. Edited on the sheet and in Settings alike.
 */
export function useMyShortcuts() {
  const { can, roles, company } = useCompany();
  const { user } = useAuth();
  const allowed = shortcutsFor({ can, roles, rules: company?.shortcutRules });
  const pick = (keys) => keys.filter((k) => allowed.some((s) => s.key === k)).map((k) => allowed.find((s) => s.key === k));
  return { allowed, chosen: pick(user?.shortcuts ?? USUAL), pick };
}

export function ShortcutsEditor({ onDone, onCancel }) {
  const { refresh } = useAuth();
  const { allowed, chosen: saved, pick } = useMyShortcuts();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chosen = draft ? pick(draft) : saved;
  const keys = chosen.map((s) => s.key);
  const more = allowed.filter((s) => !keys.includes(s.key));
  const move = (i, d) => setDraft(keys.map((k, j) => (j === i ? keys[i + d] : j === i + d ? keys[i] : k)));

  async function save() {
    if (draft) {
      setBusy(true);
      try {
        await apiClient.patch("/auth/shortcuts", { shortcuts: draft });
        await refresh();
      } catch (ex) {
        setBusy(false);
        return setErr(ex.message);
      }
      setBusy(false);
    }
    setDraft(null);
    onDone?.();
  }

  return (
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
      {/* On the sheet the buttons stay in reach under a long list; on a page they sit at its end. */}
      <div className={`flex items-center gap-2 ${onCancel ? "sticky bottom-0 -mx-1 px-1 py-3 bg-[var(--bg)] shadow-[0_40px_0_0_var(--bg)]" : "pt-1"}`}>
        <button type="button" onClick={() => setDraft(USUAL)} className="mr-auto text-[14px] font-medium text-[var(--ink-muted)] underline underline-offset-4">
          Back to the usual
        </button>
        {onCancel && (
          <button type="button" onClick={() => (setDraft(null), onCancel())} className="h-11 px-5 rounded-full border border-[var(--border)] bg-[var(--surface)] font-semibold">
            Cancel
          </button>
        )}
        <button type="button" onClick={save} disabled={busy} data-testid="shortcuts-done" className="h-11 px-6 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-semibold disabled:opacity-50">
          {onCancel ? "Done" : "Save"}
        </button>
      </div>
    </div>
  );
}

export const ShortcutIcon = ({ s }) => (
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
    <li className={`flex items-center gap-2.5 min-h-[56px] px-2.5 py-1.5 ${i ? "border-t border-[var(--border)]" : ""}`}>
      <ShortcutIcon s={s} />
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight line-clamp-2">{s.name}</span>
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
      className={`h-10 w-9 shrink-0 rounded-full grid place-items-center disabled:opacity-30 ${danger ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]" : accent ? "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"}`}
    >
      {children}
    </button>
  );
}
