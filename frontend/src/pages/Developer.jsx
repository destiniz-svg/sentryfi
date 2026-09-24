import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/UIContext";

/**
 * The developer dashboard: Sentryfi's own customers, for the people who run
 * it. Who signed up and when, what they opened, how far into the free trial
 * each company is, and whether anyone is using it. It reads names, dates and
 * counts, never what is in anyone's books. The server answers only a platform
 * admin (routes/platform.js); for everyone else this page does not exist.
 */

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never");
function ago(iso) {
  if (!iso) return "Never";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return "Just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return d < 31 ? `${d} ${d === 1 ? "day" : "days"} ago` : day(iso);
}

const INDUSTRY = { construction: "Construction", trading: "Trading and import", tourism: "Tourism", services: "Services", retail: "Shops and restaurants", other: "Other" };
const COUNTRY = { MV: "Maldives", AE: "UAE", GENERIC: "Elsewhere" };
const ACTION = { extend_trial: "Extended the trial", set_plan: "Changed the plan" };

function standing(t) {
  if (t.plan === "paid") return { tone: "success", text: "Paying" };
  if (t.plan === "developer") return { tone: "ink", text: "Developer" };
  if (t.ended) return { tone: "danger", text: "Trial ended" };
  if (t.daysLeft <= 7) return { tone: "warning", text: `${t.daysLeft} ${t.daysLeft === 1 ? "day" : "days"} left` };
  return { tone: "neutral", text: `${t.daysLeft} days left` };
}

const FILTERS = [
  ["all", "Everyone"],
  ["trial", "On trial"],
  ["soon", "Ending this week"],
  ["ended", "Trial ended"],
  ["paid", "Paying"],
  ["developer", "Developer"],
  ["nobooks", "No books yet"],
];

export default function Developer() {
  const { data, isLoading, error } = useQuery({ queryKey: ["platform"], queryFn: () => apiClient.get("/platform").then((r) => r.data) });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const hit = (c) => !needle || [c.name, c.owner?.name, c.owner?.email].some((x) => x && x.toLowerCase().includes(needle));
    return data.companies.filter(hit).filter((c) => {
      const t = c.trial;
      if (filter === "trial") return t.plan === "trial" && !t.ended;
      if (filter === "soon") return t.plan === "trial" && !t.ended && t.daysLeft <= 7;
      if (filter === "ended") return t.plan === "trial" && t.ended;
      if (filter === "paid") return t.plan === "paid";
      if (filter === "developer") return t.plan === "developer";
      return true;
    });
  }, [data, filter, q]);

  if (error) {
    return (
      <>
        <PageHeader title="Developer" />
        <p className="text-[var(--ink-muted)]">This page is for the people who run Sentryfi.</p>
      </>
    );
  }

  const tt = data?.totals;
  const open = data?.companies.find((c) => c.id === openId) || null;

  return (
    <>
      <PageHeader title="Developer" description="Everyone who has signed up for Sentryfi, and where each company's free trial stands." />

      {isLoading ? (
        <Skeleton className="h-[220px] rounded-3xl" />
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
          <Card radius="lg" className="p-6">
            <p className="font-display text-[26px] sm:text-[30px] leading-[1.15] font-semibold tracking-tight max-w-[30ch]">
              {tt.people} {tt.people === 1 ? "person has" : "people have"} signed up. {tt.companies} opened books
              {tt.no_company ? `; ${tt.no_company} did not yet` : ""}.
            </p>
            <p className="mt-3 text-[15px] leading-[1.55] text-[var(--ink-muted)]">
              {tt.on_trial} on the free trial, {tt.ending_soon} ending within a week, {tt.ended} ended, {tt.paid} paying. {tt.active_week} people were here in
              the last seven days, and {tt.verified} of {tt.people} have confirmed their email.
            </p>
          </Card>
          <Card radius="lg" className="p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Sign-ups, last 30 days</h2>
              <span className="text-[13px] text-[var(--ink-muted)] tabular">{data.signups.reduce((a, d) => a + d.signups, 0)} in all</span>
            </div>
            <Bars days={data.signups} />
          </Card>
        </div>
      )}

      <div className="mt-8 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {FILTERS.map(([k, label]) => (
              <TabsTrigger key={k} value={k}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label className="relative w-full lg:w-[280px]">
          <span className="sr-only">Find a company or person</span>
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Company, name or email"
            className="w-full h-11 pl-10 pr-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px] outline-none focus:border-[var(--ink)]"
          />
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="mt-5 h-[320px] rounded-3xl" />
      ) : filter === "nobooks" ? (
        <NoBooks people={data.noCompany.filter((u) => !q.trim() || [u.name, u.email].some((x) => x?.toLowerCase().includes(q.trim().toLowerCase())))} />
      ) : (
        <Card radius="lg" padding="none" className="mt-5 overflow-hidden">
          <div className="hidden xl:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_110px_130px_140px_120px] gap-4 px-6 h-11 items-center border-b border-[var(--border)] text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">
            <span>Company</span>
            <span>Signed up by</span>
            <span>Opened</span>
            <span>Last here</span>
            <span>Trial</span>
            <span className="text-right">Entries</span>
          </div>
          {rows.length === 0 && <p className="px-6 py-10 text-[15px] text-[var(--ink-muted)]">Nobody here.</p>}
          {rows.map((c) => {
            const s = standing(c.trial);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenId(c.id)}
                className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_110px_130px_140px_120px] gap-x-4 gap-y-1 px-6 py-4 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] items-center"
              >
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{c.name}</span>
                  <span className="block text-[13px] text-[var(--ink-muted)] truncate">
                    {[INDUSTRY[c.industry], COUNTRY[c.country], c.currency].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="xl:hidden justify-self-end">
                  <Badge tone={s.tone}>{s.text}</Badge>
                </span>
                <span className="min-w-0 col-span-2 xl:col-span-1">
                  <span className="flex items-center gap-1.5 text-[14px] truncate">
                    {c.owner?.name || "Nobody"}
                    {c.owner?.verified && <BadgeCheck size={15} className="text-[var(--success)] shrink-0" aria-label="Email confirmed" />}
                  </span>
                  <span className="block text-[13px] text-[var(--ink-muted)] truncate">{c.owner?.email}</span>
                </span>
                <span className="hidden xl:block text-[14px] tabular">{day(c.openedAt)}</span>
                <span className="hidden xl:block text-[14px]">{ago(c.lastSeen)}</span>
                <span className="hidden xl:block">
                  <Badge tone={s.tone}>{s.text}</Badge>
                </span>
                <span className="hidden xl:block text-right text-[14px] tabular">{c.usage.entries.toLocaleString("en-US")}</span>
                <span className="xl:hidden col-span-2 text-[13px] text-[var(--ink-muted)]">
                  Opened {day(c.openedAt)} · last here {ago(c.lastSeen).toLowerCase()} · {c.usage.entries.toLocaleString("en-US")} entries
                </span>
              </button>
            );
          })}
        </Card>
      )}

      {data?.events?.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[15px] font-semibold mb-3">What was done here</h2>
          <ul className="border-t border-[var(--border)]">
            {data.events.map((e, i) => (
              <li key={i} className="py-3 border-b border-[var(--border)] text-[14px] flex flex-wrap gap-x-3">
                <span className="font-semibold">{ACTION[e.action] || e.action}</span>
                <span>{e.target}</span>
                <span className="text-[var(--ink-muted)]">
                  {e.detail?.days ? `+${e.detail.days} days` : e.detail?.plan ? `to ${e.detail.plan}` : ""} · {e.detail?.reason} · {e.actor} · {ago(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Customer company={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.signups));
  return (
    <div className="mt-5">
      <div className="h-[120px] flex items-end gap-[3px]" role="img" aria-label={`Sign-ups per day for 30 days, most on one day ${max}`}>
        {days.map((d) => (
          <div key={d.day} className="flex-1 h-full flex items-end" title={`${d.day}: ${d.signups}`}>
            <div className={`w-full ${d.signups ? "bg-[var(--ink)]" : "bg-[var(--border)]"}`} style={{ height: d.signups ? `${Math.max(6, (d.signups / max) * 100)}%` : "3px" }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[var(--ink-muted)] tabular">
        <span>{day(days[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function NoBooks({ people }) {
  return (
    <Card radius="lg" padding="none" className="mt-5 overflow-hidden">
      <p className="px-6 py-4 text-[14px] text-[var(--ink-muted)] border-b border-[var(--border)]">Signed up, never opened a set of books.</p>
      {people.length === 0 && <p className="px-6 py-10 text-[15px] text-[var(--ink-muted)]">Nobody.</p>}
      {people.map((u) => (
        <div key={u.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-6 py-4 border-b border-[var(--border)] last:border-b-0">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold truncate">
              {u.name}
              {u.verified && <BadgeCheck size={15} className="text-[var(--success)] shrink-0" aria-label="Email confirmed" />}
            </span>
            <span className="block text-[13px] text-[var(--ink-muted)] truncate">{u.email}</span>
          </span>
          <span className="text-right text-[13px] text-[var(--ink-muted)]">
            Signed up {day(u.signedUp)}
            <br />
            Last here {ago(u.lastSeen).toLowerCase()}
          </span>
        </div>
      ))}
    </Card>
  );
}

function Customer({ company: c, onClose }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: ({ path, body }) => apiClient.post(`/platform/customers/${c.id}/${path}`, body),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["platform"] });
      toast.success(v.done);
      setReason("");
    },
    onError: (e) => toast.error("That did not work", e.message),
  });
  if (!c) return <Modal open={false} onClose={onClose} />;
  const s = standing(c.trial);
  const why = reason.trim();
  const needWhy = why.length < 3;

  return (
    <Modal open onClose={onClose} title={c.name} description={`Opened ${day(c.openedAt)} by ${c.owner?.name || "nobody"}`}>
      <div className="space-y-6">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[14px]">
          {[
            ["Standing", <Badge key="s" tone={s.tone}>{s.text}</Badge>],
            ["Trial ends", c.trial.endsAt ? day(c.trial.endsAt) : "No trial"],
            ["What it does", INDUSTRY[c.industry] || "Not said"],
            ["Where", COUNTRY[c.country]],
            ["Kept in", c.currency],
            ["Year starts", ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][(c.yearStarts || 1) - 1]],
            ["GST", c.gst.registered ? `Registered${c.gst.sector ? `, ${c.gst.sector}` : ""}${c.gst.tin ? ` · ${c.gst.tin}` : ""}` : "Not registered"],
            ["Registration", c.registrationNo || "Not given"],
            ["Use", `${c.usage.entries.toLocaleString("en-US")} entries, ${c.usage.bills} bills, ${c.usage.invoices} invoices${c.usage.lastEntry ? `, last ${ago(c.usage.lastEntry).toLowerCase()}` : ""}`],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--ink-muted)]">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="text-[14px] font-semibold mb-2">People</h3>
          <ul className="border-t border-[var(--border)]">
            {c.people.map((p) => (
              <li key={p.id + p.role} className="py-2.5 border-b border-[var(--border)] text-[14px] grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold truncate">
                    {p.name}
                    {p.verified && <BadgeCheck size={14} className="text-[var(--success)] shrink-0" aria-label="Email confirmed" />}
                  </span>
                  <span className="block text-[13px] text-[var(--ink-muted)] truncate">{p.email}</span>
                </span>
                <span className="text-right text-[13px] text-[var(--ink-muted)]">
                  {p.role.replace("_", " ")}
                  <br />
                  here {ago(p.lastSeen).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-[var(--surface-2)] p-4 space-y-3">
          <label className="block">
            <span className="text-[14px] font-semibold">Why</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Kept with what you do, e.g. asked for more time"
              className="mt-1.5 w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[14px] outline-none focus:border-[var(--ink)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} variant="outline" size="md" disabled={needWhy || act.isPending} onClick={() => act.mutate({ path: "trial", body: { days: d, reason: why }, done: `${d} more days for ${c.name}` })}>
                +{d} days
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["trial", "On trial"],
              ["paid", "Paying"],
              ["developer", "Developer"],
            ].map(([plan, label]) => (
              <Button
                key={plan}
                variant={c.trial.plan === plan ? "primary" : "ghost"}
                size="md"
                disabled={needWhy || act.isPending || c.trial.plan === plan}
                onClick={() => act.mutate({ path: "plan", body: { plan, reason: why }, done: `${c.name} is now ${label.toLowerCase()}` })}
              >
                {act.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {label}
              </Button>
            ))}
          </div>
          {needWhy && <p className="text-[13px] text-[var(--ink-muted)]">Say why first; every change here is kept with who made it.</p>}
        </div>
      </div>
    </Modal>
  );
}
