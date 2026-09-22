import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // A standing: a word first, its colour second. The fills are the settled
  // soft tokens rather than alpha tints, so every pair is a known 4.5:1.
  "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[13px] font-semibold tracking-tight tabular whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)]",
        accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
        success: "bg-[var(--success-soft)] text-[var(--success)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
        ink: "bg-[var(--ink)] text-[var(--bg)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({ className, tone, ...props }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// Maps an invoice status → badge tone + label. Kept here so every table,
// list, and detail view renders status consistently.
export const INVOICE_STATUS = {
  draft: { tone: "neutral", label: "Draft" },
  sent: { tone: "accent", label: "Sent" },
  paid: { tone: "success", label: "Paid" },
  overdue: { tone: "danger", label: "Overdue" },
  // Voided records stay in the list. They are shown quietly rather than in a
  // warning colour, because nothing is wrong with them — they simply no longer
  // count, and the reason is on the record.
  void: { tone: "neutral", label: "Void" },
};

export function StatusBadge({ status, className }) {
  const s = INVOICE_STATUS[status] || INVOICE_STATUS.draft;
  return (
    <Badge tone={s.tone} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {s.label}
    </Badge>
  );
}

export { badgeVariants };
