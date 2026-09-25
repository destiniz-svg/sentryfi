import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Bell, AlertTriangle, Clock, CircleDashed, ShieldAlert, Check, Sunrise, AtSign, CircleHelp, MessagesSquare } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconButton } from "@/components/ui/IconButton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";
import { PushSwitch } from "@/components/PushSwitch";

/**
 * The bell.
 *
 * It used to read the purchased product's dashboard, which counted "overdue"
 * from the purchased invoice table — so the dot on it described invoices that
 * were never in the books, and none of the ones that were. It now shows the
 * same list as "What needs you", which is read from the ledger: a possible
 * duplicate, a bill that cannot be posted, one waiting too long, a customer
 * who is late. One source, so the bell and the page can never disagree.
 *
 * Under it, what happened: a claim waiting, an order approved, a customer
 * opening their link, the morning brief. The same things are pushed to every
 * device a person turns notifications on for, from the switch at the foot.
 */

const LOOK = {
  money_at_risk: { icon: ShieldAlert, tone: "bg-[var(--danger)]/12 text-[var(--danger)]" },
  blocked: { icon: AlertTriangle, tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  waiting: { icon: CircleDashed, tone: "bg-[var(--surface-2)] text-[var(--ink-muted)]" },
  ageing: { icon: Clock, tone: "bg-[var(--warning)]/14 text-[var(--warning)]" },
  done: { icon: Check, tone: "bg-[var(--success-soft)] text-[var(--success)]" },
  brief: { icon: Sunrise, tone: "bg-[var(--surface-2)] text-[var(--ink)]" },
  release: { icon: Sparkles, tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  mention: { icon: AtSign, tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  ask: { icon: CircleHelp, tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  comment: { icon: MessagesSquare, tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
};

const ago = (at) => {
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function NotificationsPopover() {
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const { data } = useQuery({
    queryKey: ["attention", companyId],
    queryFn: () => apiClient.get("/attention").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const qc = useQueryClient();
  const { data: inbox } = useQuery({
    queryKey: ["notifications", companyId],
    queryFn: () => apiClient.get("/notifications").then((r) => r.data),
    enabled: Boolean(companyId),
    refetchInterval: 120_000,
  });
  const recent = inbox?.notifications || [];
  const unread = inbox?.unread || 0;
  const items = data?.items || [];
  const urgent = items.filter((i) => i.kind === "money_at_risk" || i.kind === "blocked").length;

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        onClick={() => {
          setOpen((v) => !v);
          // Seen once the bell is opened.
          if (!open && unread > 0) apiClient.post("/notifications/read", {}).then(() => qc.invalidateQueries({ queryKey: ["notifications", companyId] }));
        }}
        title="What needs you"
        dot={items.length > 0 || unread > 0}
        aria-label={
          items.length === 0
            ? "What needs you: nothing"
            : `What needs you: ${items.length} ${items.length === 1 ? "thing" : "things"}`
        }
      >
        <Bell size={16} />
      </IconButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[52px] z-40 w-[380px] max-w-[calc(100vw-2rem)] rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-hover overflow-hidden"
            role="dialog"
            aria-label="What needs you"
          >
            <div className="flex items-center justify-between px-5 h-12 border-b border-[var(--border)]">
              <div className="text-sm font-semibold text-[var(--ink)]">What needs you</div>
              {urgent > 0 && (
                <span className="text-[11px] font-semibold text-[var(--danger)] tabular-nums">
                  {urgent} urgent
                </span>
              )}
            </div>

            <div className="max-h-[min(460px,60vh)] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[var(--ink)]">Nothing is waiting on you.</p>
                  <p className="text-[13px] text-[var(--ink-muted)] mt-1">
                    Every bill is in the books and nobody is late.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {items.slice(0, 8).map((item, i) => {
                    const look = LOOK[item.kind] || LOOK.waiting;
                    const Icon = look.icon;
                    return (
                      <li key={`${item.kind}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            navigate(item.href || "/dashboard");
                          }}
                          className="w-full text-left flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--surface-2)]"
                        >
                          <span
                            className={cn(
                              "mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center",
                              look.tone
                            )}
                          >
                            <Icon size={15} aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--ink)]">{item.title}</span>
                            <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5 leading-snug">
                              {item.detail}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {recent.length > 0 && (
                <div data-testid="inbox">
                  <div className="flex items-center justify-between px-5 pt-3 pb-1 border-t border-[var(--border)]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">What happened</span>
                    <button type="button" onClick={() => (setOpen(false), navigate("/inbox"))} className="h-8 -mr-2 px-2 rounded-full text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">
                      Open inbox
                    </button>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {recent.slice(0, 10).map((n) => {
                      const look = LOOK[n.kind] || LOOK.waiting;
                      const Icon = look.icon;
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate(n.href || "/dashboard");
                            }}
                            className="w-full text-left flex items-start gap-3 px-5 py-3 hover:bg-[var(--surface-2)]"
                          >
                            <span className={cn("mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center", look.tone)}>
                              <Icon size={13} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block text-[13px] text-[var(--ink)]", !n.read_at && "font-semibold")}>{n.title}</span>
                              {n.body && <span className="block text-[12px] text-[var(--ink-muted)] mt-0.5 leading-snug line-clamp-2">{n.body}</span>}
                            </span>
                            <span className="text-[11px] text-[var(--ink-muted)] shrink-0 mt-0.5">{ago(n.created_at)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/dashboard");
                }}
                className="w-full h-11 border-t border-[var(--border)] text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]"
              >
                {items.length > 8 ? `See all ${items.length}` : "Open What needs you"}
              </button>
            )}
            <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
              <PushSwitch compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
