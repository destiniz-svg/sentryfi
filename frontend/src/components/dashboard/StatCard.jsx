import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  suffix,
  delta,
  icon: Icon,
  accent = false,
}) {
  const positive = delta == null ? null : delta >= 0;
  const color = accent ? "#FFFFFF" : "var(--accent)";
  const displayValue = value == null || value === "" ? "—" : value;

  return (
    <Card
      variant={accent ? "accent" : "default"}
      className={cn(
        "relative overflow-hidden",
        accent && "text-[var(--bg)]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {Icon && (
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center",
                  accent
                    ? "bg-white/15 text-[var(--bg)]"
                    : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                )}
              >
                <Icon size={14} />
              </div>
            )}
            <span
              className={cn(
                "text-xs",
                accent ? "text-[var(--bg)]/75" : "text-[var(--ink-muted)]"
              )}
            >
              {label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-display tabular text-3xl font-semibold tracking-tight">
              {displayValue}
            </span>
            {suffix && (
              <span
                className={cn(
                  "text-sm font-medium",
                  accent ? "text-[var(--bg)]/75" : "text-[var(--ink-muted)]"
                )}
              >
                {suffix}
              </span>
            )}
          </div>
          {delta != null && (
            <Badge
              tone={accent ? "ink" : positive ? "success" : "danger"}
              className={cn(accent && "bg-white/15 text-[var(--bg)]")}
            >
              {positive ? "+" : ""}
              {delta}%
            </Badge>
          )}
        </div>

              </div>
    </Card>
  );
}
