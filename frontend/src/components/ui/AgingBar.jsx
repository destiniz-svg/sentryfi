import { cn } from "@/lib/utils";

/**
 * How old what is owed is, as one bar: each age a share of the whole, darker
 * the older it gets, with the words and figures beneath. One bar reads in a
 * glance where five figures in a grid had to be read one by one, and on a
 * phone the grid ran to five rows.
 *
 * Greys, not reds: an age is not money at risk until someone says so, and the
 * money colours are for amounts (the Grey Print Rule: the words carry it).
 */
export const AGES = [
  { key: "current", label: "Not yet due" },
  { key: "thirty", label: "1–30 days over" },
  { key: "sixty", label: "31–60" },
  { key: "ninety", label: "61–90" },
  { key: "older", label: "Over 90" },
];
// Lightest for what is not due yet, ink for the oldest; on the black card, the same ramp in white.
const SHADE = {
  light: ["bg-[var(--border)]", "bg-[var(--ink)]/35", "bg-[var(--ink)]/55", "bg-[var(--ink)]/75", "bg-[var(--ink)]"],
  dark: ["bg-white/20", "bg-white/45", "bg-white/65", "bg-white/85", "bg-[var(--accent)]"],
};

export function AgingBar({ amounts, laari, tone = "light", className }) {
  const values = AGES.map((a) => Number(laari?.[a.key] || 0));
  const total = values.reduce((s, v) => s + v, 0);
  const shade = SHADE[tone];
  const muted = tone === "dark" ? "text-white/65" : "text-[var(--ink-muted)]";
  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full gap-[2px]", tone === "dark" ? "bg-white/10" : "bg-[var(--surface-2)]")} role="img" aria-label={AGES.map((a, i) => `${a.label} ${amounts?.[a.key]}`).join(", ")}>
        {total > 0 &&
          values.map((v, i) =>
            v > 0 ? <span key={AGES[i].key} className={cn("h-full first:rounded-l-full last:rounded-r-full", shade[i])} style={{ width: `${Math.max(2, (v / total) * 100)}%` }} /> : null
          )}
      </div>
      {/* Only the ages that hold money: five labels of which three read 0.00 said nothing. */}
      <dl className="mt-3 grid grid-cols-2 min-[520px]:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-x-4 gap-y-2">
        {AGES.map((a, i) => (total > 0 && values[i] === 0 ? null : (
          <div key={a.key} className="min-w-0">
            <dt className={cn("flex items-center gap-1.5 text-[12px] whitespace-nowrap", muted)}>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", shade[i])} aria-hidden="true" />
              {a.label}
            </dt>
            <dd className={cn("tabular text-[14px] font-semibold mt-0.5", values[i] === 0 && muted)}>{amounts?.[a.key] ?? "0.00"}</dd>
          </div>
        )))}
      </dl>
    </div>
  );
}
