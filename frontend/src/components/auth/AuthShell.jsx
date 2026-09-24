import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import AILogo from "@/components/layout/AILogo";

/**
 * The way in.
 *
 * This screen used to belong to a different product. It carried a teal
 * gradient, two animated emerald glows, a sheen sweep, a noise overlay, a
 * scrolling marquee of invoice cards, an italic serif headline and a badge
 * reading "AI Invoice Manager" — none of which appear anywhere in Sentryfi's
 * design system, and one of which named a product this is not. Registration
 * also promised a free plan for something with no billing.
 *
 * It matters more than most screens because every session passes through it.
 * Someone arriving from the landing page had just been told this was built for
 * their construction company, and the very next thing they saw sold them a
 * generic invoicing SaaS.
 *
 * So it is now the Site Board, in the desk register that governs the web: a
 * light ground, a white card for the form, and beside it an ink panel carrying
 * the mark, one true sentence, and the ruled list the whole product is built
 * on — hairline rows, tabular figures, amounts hanging off a single rule, and
 * exactly one signal-yellow field on the thing that matters now.
 */
export function AuthShell({ children, headline, subhead }) {
  return (
    <div className="min-h-screen flex bg-[var(--bg)] p-3 sm:p-4 gap-0 lg:gap-4">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
      <BoardPanel headline={headline} subhead={subhead} />
    </div>
  );
}

/**
 * Illustrative, and labelled as such below. These are the shapes of real rows
 * — a supplier bill, a director putting money in, a deadline — not figures
 * from anyone's books.
 */
const ROWS = [
  { label: "Cement supplier", meta: "Cement, 20t · 15 Sep", amount: "−4,250.50" },
  { label: "Hotel customer", meta: "Transfer in · 14 Sep", amount: "+80,000.00" },
  { label: "Gas supplier", meta: "Bottled gas · 12 Sep", amount: "−1,120.00" },
];

function BoardPanel({ headline, subhead }) {
  const still = useReducedMotion();

  return (
    <div className="hidden lg:flex flex-1 relative rounded-[var(--radius-card)] overflow-hidden bg-[var(--ink-panel)] border border-white/10 on-ink">
      <motion.div
        initial={still ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={still ? { duration: 0 } : { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-10 w-full h-full flex flex-col justify-center px-10 xl:px-16 py-14"
      >
        <AILogo size={40} />

        <h2 className="text-[40px] xl:text-[52px] leading-[1.04] tracking-[-0.03em] font-semibold text-white mt-8 max-w-[15ch]">
          {headline}
        </h2>

        <p className="text-white/70 text-[15px] xl:text-base mt-5 max-w-[46ch] leading-relaxed">
          {subhead}
        </p>

        {/* The rule. Every amount in the product hangs off one of these. */}
        <div className="mt-12 max-w-[440px]">
          <div className="flex items-baseline justify-between pb-2 border-b-2 border-white/25">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
              Recorded this week
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
              MVR
            </span>
          </div>

          {ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 py-3 border-b border-white/12"
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-white truncate">
                  {row.label}
                </span>
                <span className="block text-[12px] text-white/55 truncate">{row.meta}</span>
              </span>
              <span
                className={`tabular text-[14px] font-semibold shrink-0 ${
                  row.amount.startsWith("+") ? "text-[#3fbf71]" : "text-[#ff6b5e]"
                }`}
              >
                {row.amount}
              </span>
            </div>
          ))}

          {/* The one yellow field: the thing with a date on it. */}
          <div className="mt-5 flex items-center justify-between gap-4 bg-[var(--accent)] text-[var(--on-accent)] px-4 py-3 rounded-[var(--radius-control)]">
            <span className="text-[13px] font-semibold">GST return · September</span>
            <span className="tabular text-[13px] font-semibold">9 days left</span>
          </div>

          {/* white/45 on ink computes to 4.52:1 — a pass, but close enough to
              the floor that a later tweak would quietly break it. /55 is 6.17:1. */}
          <p className="text-[12px] text-white/55 mt-4">Figures are illustrative.</p>
        </div>
      </motion.div>
    </div>
  );
}

export function AuthField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  extra,
  autoComplete,
  required = true,
  minLength,
}) {
  // The label used to sit beside the input rather than around it, with no
  // htmlFor, so none of these fields had an accessible name — including both
  // password fields.
  const id = useId();

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-sm font-medium text-[var(--ink)]">
          {label}
        </label>
        {extra}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full h-12 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none transition-colors duration-200 focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15"
      />
    </div>
  );
}

export function AuthPrimaryButton({ children, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className="w-full h-12 rounded-[var(--radius-control)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold text-[15px] flex items-center justify-center gap-2 transition-[filter,transform] duration-150 hover:brightness-[.97] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
      {...props}
    >
      {children}
    </button>
  );
}

export function AuthErrorBanner({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="text-[13px] text-[var(--danger)] bg-[var(--danger)]/10 rounded-[var(--radius-control)] px-4 py-2.5 leading-snug"
    >
      {children}
    </p>
  );
}
