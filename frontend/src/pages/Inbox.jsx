import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bell, CheckCheck, CircleHelp, MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";
import { FieldFrame } from "@/components/phone/FieldFrame";

/**
 * Everything said to this person, in one place: mentions, asks and comments
 * on records they follow, and what the app itself told them. Two more views
 * keep asks from getting lost: the ones waiting on me, and the ones I am
 * waiting on. The same things arrive as a push, and as one email a day for
 * whatever was not seen here.
 */

const ICON = { mention: AtSign, ask: CircleHelp, comment: MessagesSquare };
const TALK = ["mention", "ask", "comment"];
const ago = (at) => {
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const due = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function Inbox() {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const inbox = useQuery({ queryKey: ["notifications", companyId], queryFn: () => apiClient.get("/notifications").then((r) => r.data), enabled: Boolean(companyId), refetchInterval: 60_000 });
  const waiting = useQuery({ queryKey: ["asks", companyId, "waiting"], queryFn: () => apiClient.get("/comments/asks?view=waiting").then((r) => r.data.asks), enabled: Boolean(companyId) });
  const asked = useQuery({ queryKey: ["asks", companyId, "asked"], queryFn: () => apiClient.get("/comments/asks?view=asked").then((r) => r.data.asks), enabled: Boolean(companyId) });

  const all = inbox.data?.notifications || [];
  const shown = tab === "mentions" ? all.filter((n) => n.kind === "mention" || n.kind === "ask") : all;
  const read = async (ids) => {
    await apiClient.post("/notifications/read", ids ? { ids } : {});
    qc.invalidateQueries({ queryKey: ["notifications", companyId] });
  };
  const openWaiting = (waiting.data || []).filter((a) => a.status === "open").length;

  return (
    <FieldFrame figure="Inbox" position={openWaiting ? `${openWaiting} waiting on you` : "Nothing waiting on you"}>
    <div className="max-w-[860px]">
      {can("read") && <PageHeader
        title="Inbox"
        description="What your team said to you, and what is waiting on whom."
        actions={
          inbox.data?.unread > 0 && (
            <Button variant="outline" onClick={() => read()}>
              <CheckCheck size={15} /> Mark all read
            </Button>
          )
        }
      />}
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All{inbox.data?.unread ? ` · ${inbox.data.unread} new` : ""}</TabsTrigger>
          <TabsTrigger value="mentions">Mentions</TabsTrigger>
          <TabsTrigger value="waiting">Waiting on me{openWaiting ? ` · ${openWaiting}` : ""}</TabsTrigger>
          <TabsTrigger value="asked">I asked</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "waiting" || tab === "asked" ? (
        <Asks q={tab === "waiting" ? waiting : asked} mine={tab === "asked"} />
      ) : inbox.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !shown.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">{tab === "mentions" ? "Nobody has mentioned you yet" : "Nothing here yet"}</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">When someone types @ and your name on an invoice, a bill or a pay run, it comes here, to your phone, and in a daily email if you missed it.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]" data-testid="inbox-list">
            {shown.map((n) => {
              const Icon = ICON[n.kind] || Bell;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read_at) read([n.id]);
                      navigate(n.href || "/dashboard");
                    }}
                    className="w-full text-left flex items-start gap-3 px-5 py-4 hover:bg-[var(--surface-2)]"
                  >
                    <span className={cn("mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center", TALK.includes(n.kind) ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]")}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug", !n.read_at && "font-semibold")}>{n.title}</span>
                      {n.body && <span className="block text-[14px] text-[var(--ink-muted)] mt-0.5 line-clamp-2">{n.body}</span>}
                      <span className="block text-[12px] text-[var(--ink-muted)] mt-1">{ago(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" aria-label="New" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
    </FieldFrame>
  );
}

function Asks({ q, mine }) {
  const today = new Date().toISOString().slice(0, 10);
  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!q.data?.length)
    return (
      <Card padding="lg">
        <p className="text-[16px] font-semibold">{mine ? "You are not waiting on anyone" : "Nothing is waiting on you"}</p>
        <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">On any record, write a comment and press Ask to make it a question someone has to answer. It stays here until one of you marks it done.</p>
      </Card>
    );
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-[var(--border)]" data-testid="asks">
        {q.data.map((a) => {
          const late = a.dueOn && a.dueOn < today && a.status === "open";
          return (
            <li key={a.id}>
              <Link to={a.href} className="flex items-start gap-3 px-5 py-4 hover:bg-[var(--surface-2)]">
                <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-[var(--surface-2)] text-[var(--ink-muted)]">
                  <CircleHelp size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-[var(--ink-muted)] font-semibold uppercase tracking-wider">{a.title}</span>
                  <span className="block text-[15px] mt-0.5 line-clamp-2">{a.body}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)] mt-1">
                    {mine ? `Asked ${a.of}` : `From ${a.by}`} · {ago(a.at)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn("px-2 py-0.5 rounded-full text-[12px] font-semibold", a.status === "answered" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--warning)]/14 text-[var(--warning)]")}>{a.status === "answered" ? "Answered" : "Open"}</span>
                  {a.dueOn && <span className={cn("text-[12px]", late ? "text-[var(--danger)] font-semibold" : "text-[var(--ink-muted)]")}>{late ? `Was due ${due(a.dueOn)}` : `By ${due(a.dueOn)}`}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
