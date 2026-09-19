import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NOT_READY } from "@/config/readiness";

/**
 * A section that is not on the books yet.
 *
 * Reached only by someone typing the address or following an old link, since
 * these are out of the navigation. It exists so that lands somewhere honest
 * rather than on a screen of figures that do not come from the ledger.
 */
export default function NotReady() {
  const { pathname } = useLocation();
  const section = NOT_READY[pathname] || {
    name: "This section",
    why: "It has not moved onto the books yet.",
    instead: null,
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-[var(--ink)]">
        {section.name} is not on the books yet
      </h1>

      <Card padding="lg" className="mt-6">
        <p className="text-[15px] leading-relaxed text-[var(--ink)]">{section.why}</p>

        <p className="text-[15px] leading-relaxed text-[var(--ink-muted)] mt-4">
          The old screen is still in the code but is not reachable, because a screen that
          looks right and is not is worse than one that is missing — especially about money.
        </p>

        {section.instead && (
          <Link
            to={section.instead}
            className="inline-flex items-center gap-2 mt-6 h-11 px-5 rounded-[var(--radius-pill)] bg-[var(--accent)] text-[var(--on-accent)] text-[15px] font-semibold"
          >
            Go to {section.insteadName}
            <ArrowRight size={16} />
          </Link>
        )}
      </Card>
    </div>
  );
}
