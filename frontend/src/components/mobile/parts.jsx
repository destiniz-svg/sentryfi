
/**
 * The parts the main app's phone screens are built from, built once
 * (DESIGN.md, "Patterns both apps share"). The standing pill is Badge and the
 * undo strip is UndoContext; these are the rest.
 */

/** A segmented control: two or three views of one list, never navigation. */
export function Segments({ value, onChange, options, label }) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-full bg-[var(--surface)] lift">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-full text-[14px] font-medium transition-colors ${
            value === o.value ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An empty list that teaches: what goes here, and the one way to start. */
export function EmptyState({ title, body, action }) {
  return (
    <div className="rounded-[20px] bg-[var(--surface)] lift px-5 py-7 text-center">
      <div className="text-[17px] font-semibold tracking-[-0.01em]">{title}</div>
      <p className="mt-1.5 text-[14px] leading-[1.45] text-[var(--ink-muted)]">{body}</p>
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
