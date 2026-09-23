import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * The name of the screen, what it is for, and what can be done on it.
 *
 * On a phone these stack: the title had been sharing a row with the buttons,
 * which squeezed "Bank and cash" into a three-line column beside them. The
 * row only returns when there is width for it.
 */
export function PageHeader({ title, description, actions, className }) {
  const { t } = useT();
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 mb-6", className)}>
      <div className="min-w-0">
        {/* The page's own name is its heading. This used to be an h2 sitting
            under the topbar's greeting, so every screen's h1 was "Hello". */}
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-[var(--ink)]">
          {typeof title === "string" ? t(title) : title}
        </h1>
        {description && (
          <p className="text-sm text-[var(--ink-muted)] mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
