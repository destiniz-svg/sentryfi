import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";

/**
 * The parts the main app's phone screens are built from, built once
 * (DESIGN.md, "Patterns both apps share"). The standing pill is Badge and the
 * undo strip is UndoContext; these are the rest.
 */

/** A segmented control: two or three views of one list, never navigation. */
export function Segments({ value, onChange, options, label }) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-[9px] text-[15px] font-semibold ${
            value === o.value ? "bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(20,20,19,.12)]" : "text-[var(--ink-muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "TODAY", "YESTERDAY", "19 SEP": where a run of rows begins. */
export function DayHeader({ date }) {
  return (
    <h3 className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] px-1 pt-4 pb-2">
      {dayName(date)}
    </h3>
  );
}

export function dayName(date) {
  if (!date) return "No date";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "No date";
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Rows grouped by day, newest first, for DayHeader. */
export function byDay(rows, dateOf) {
  const groups = [];
  for (const r of rows) {
    const key = dayName(dateOf(r));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, date: dateOf(r), rows: [r] });
  }
  return groups;
}

/**
 * One amount in a list: who, a line under it, the amount right with the laari
 * held back, and its standing. With `action`, a swipe to the left uncovers
 * the common next step in yellow; it is native scroll snapping, so it works
 * with a thumb, a trackpad and a screen reader (the button is always there).
 */
export function MoneyRow({ who, line, amount, pill, to, action, struck }) {
  const body = (
    <div className="flex items-center gap-3 min-h-[68px] px-4 py-3 bg-[var(--surface)] w-full shrink-0 snap-start">
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold truncate">{who}</div>
        {line && <div className="text-[13px] text-[var(--ink-muted)] truncate">{line}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className={`text-[16px] font-semibold ${struck ? "line-through text-[var(--ink-muted)]" : ""}`}>
          <Money amount={amount} />
        </div>
        {pill && (
          <Badge tone={pill.tone} className="mt-1">
            {pill.label}
          </Badge>
        )}
      </div>
      {to && <ChevronRight size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />}
    </div>
  );
  const main = to ? (
    <Link to={to} className="contents">
      {body}
    </Link>
  ) : (
    body
  );
  if (!action) return main;
  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory no-bar">
      {main}
      <button
        type="button"
        onClick={action.run}
        disabled={action.busy}
        className="snap-end shrink-0 w-[132px] bg-[var(--accent)] text-[var(--on-accent)] text-[14px] font-semibold px-3 leading-tight disabled:opacity-60"
      >
        {action.busy ? "Working…" : action.label}
      </button>
    </div>
  );
}

/** An empty list that teaches: what goes here, and the one way to start. */
export function EmptyState({ title, body, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-5 py-8 text-center">
      <div className="font-display text-[22px] font-bold">{title}</div>
      <p className="mt-2 text-[15px] leading-[1.45] text-[var(--ink-muted)]">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A thin line of the last thirty days, drawn in the signal colour. */
export function TrendLine({ points, className }) {
  if (!points || points.length < 2) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(36 - ((p - lo) / span) * 32 - 2).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Whole laari as the server writes money: "12,345.67". Exact, BigInt. */
export function laariText(laari) {
  const n = BigInt(laari || 0);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const whole = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}.${(a % 100n).toString().padStart(2, "0")}`;
}
