import { cn } from "@/lib/utils";

/**
 * An amount, set to be compared down a column.
 *
 * Tabular figures so digits line up, the minor unit held one shade back so the
 * rufiyaa reads first and the laari is still there, and a true minus sign in
 * the money-out colour — the sign, not the colour, is what says it is negative,
 * because a printed page and a colour-blind reader both lose the colour.
 *
 * It takes the string the server already formatted. Money is never formatted
 * twice: the ledger says what the figure is.
 */
export function Money({ amount, className, sign = false, muted = "opacity-60" }) {
  const text = String(amount ?? "").trim();
  const negative = /^[-−]/.test(text);
  const plain = text.replace(/^[-−+]\s*/, "");
  const dot = plain.lastIndexOf(".");
  const whole = dot === -1 ? plain : plain.slice(0, dot);
  const minor = dot === -1 ? null : plain.slice(dot);

  return (
    <span className={cn("tabular", negative && "text-[var(--danger)]", className)}>
      {negative ? "−" : sign && plain ? "+" : ""}
      {whole}
      {minor && <span className={muted}>{minor}</span>}
    </span>
  );
}
