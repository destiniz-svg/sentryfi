import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { bankApi } from "@/api/bank";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { usePhone } from "@/lib/phone";
import { apiClient } from "@/api/client";

/**
 * What the bank shows that the books do not.
 *
 * The real statement is about four transactions a day, most of them small
 * transfers to the same few people, so the questions are asked by payee: what
 * were the 80 transfers to this person? One answer posts all of them. Nothing
 * is posted until a person presses the button that names the count, the account
 * and the money, and every answer can be taken back from the Answered list.
 *
 * Leaving one for later is an answer, so the list can always be cleared.
 */

const SELECT =
  "h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[14px] text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15 min-w-0 max-w-full";

const TYPE_LABEL = {
  expense: "Spending",
  income: "Income",
  liability: "What we owe",
  asset: "What we hold",
  equity: "Owner's stake",
};

const plainDate = (iso) =>
  new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const n = (x) => x.toLocaleString("en-US");

function useRefresh(accountId) {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["bankWaiting", companyId, accountId] });
    queryClient.invalidateQueries({ queryKey: ["bankAnswered", companyId, accountId] });
    queryClient.invalidateQueries({ queryKey: ["bankLines", companyId, accountId] });
    queryClient.invalidateQueries({ queryKey: ["bank", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
    queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
  };
}

export default function BankStatement() {
  const { accountId } = useParams();
  const { companyId } = useCompany();
  const [tab, setTab] = useState("waiting");
  const phone = usePhone();
  // How many lines were open when the page opened, so the bar can say how far
  // through them this sitting has got.
  const [startedWith, setStartedWith] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bankWaiting", companyId, accountId],
    queryFn: () => bankApi.waiting(accountId),
    enabled: Boolean(companyId),
  });

  const waiting = data?.counts.open || 0;
  if (data && startedWith === null) setStartedWith(waiting);
  const asideCount = data?.counts.set_aside || 0;

  return (
    <div>
      <Link to="/bank" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] mb-3">
        <ArrowLeft size={14} /> Bank and cash
      </Link>
      <PageHeader title="Bank statement" description="What the bank shows that the books do not." />

      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {[
          { key: "waiting", label: `Waiting${data ? ` · ${n(waiting)}` : ""}` },
          { key: "answered", label: "Answered" },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-11 px-4 rounded-full text-[13px] border transition-colors ${
              tab === t.key
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold"
                : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "answered" ? (
        <Answered accountId={accountId} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : data.groups.length === 0 ? (
        <Card padding="lg">
          <p className="text-[15px] font-medium">
            {Object.keys(data.counts).length === 0 ? "No statement has been brought in yet." : "Nothing is waiting. The bank and the books agree on everything answered."}
          </p>
          {asideCount > 0 && (
            <p className="text-[13px] text-[var(--ink-muted)] mt-1.5">{n(asideCount)} set aside for later are in Answered.</p>
          )}
        </Card>
      ) : phone ? (
        <OneAtATime groups={data.groups} accounts={data.accounts} accountId={accountId} left={waiting} startedWith={startedWith || waiting} />
      ) : (
        <div className="space-y-3">
          {data.groups.map((g) => (
            <Question key={`${g.key}|${g.moneyIn}`} group={g} accounts={data.accounts} accountId={accountId} />
          ))}
          {waiting > data.groups.reduce((s, g) => s + g.count, 0) && (
            <p className="text-[13px] text-[var(--ink-muted)] px-1">
              These are the biggest. Answer them and the next ones appear.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Picker({ accounts, value, onChange, id }) {
  const byType = {};
  for (const a of accounts) (byType[a.type] ||= []).push(a);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT} aria-label="What was it">
      <option value="">What was it?</option>
      {Object.entries(byType).map(([type, list]) => (
        <optgroup key={type} label={TYPE_LABEL[type] || type}>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * On a phone: one question on the screen, biggest money first, with a bar
 * that fills as the lines are answered. Answering one brings the next.
 */
function OneAtATime({ groups, accounts, accountId, left, startedWith }) {
  const done = Math.max(0, startedWith - left);
  const share = startedWith ? done / startedWith : 0;
  const g = groups[0];
  return (
    <div>
      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={startedWith} aria-valuenow={done} aria-label="Lines answered">
        <div className="h-full bg-[var(--ink)] transition-[width] duration-300" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <div className="flex justify-between text-[13px] text-[var(--ink-muted)] mt-2 mb-3 px-0.5">
        <span>{done ? `${n(done)} answered` : "Biggest money first"}</span>
        <span>{n(left)} {left === 1 ? "line" : "lines"} left</span>
      </div>
      <Question key={`${g.key}|${g.moneyIn}`} group={g} accounts={accounts} accountId={accountId} phone />
    </div>
  );
}

/** One payee, one direction: the unit a person actually thinks in. */
function Question({ group, accounts, accountId, phone = false }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh(accountId);
  const [pick, setPick] = useState(group.rule?.accountId || "");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const chosen = accounts.find((a) => a.id === pick);
  const who = group.who || "";
  const label = group.who || "No name given";

  const post = useMutation({ mutationFn: (body) => bankApi.postGroup(accountId, body) });
  const aside = useMutation({ mutationFn: (body) => bankApi.setAsideGroup(accountId, body) });

  const lines = useQuery({
    queryKey: ["bankLines", companyId, accountId, group.key, group.moneyIn],
    queryFn: () => bankApi.waitingLines(accountId, group.key, group.moneyIn),
    enabled: open,
  });

  async function onPost() {
    setErr("");
    try {
      const r = await post.mutateAsync({ who, moneyIn: group.moneyIn, accountId: pick });
      refresh();
      toast.success(`${n(r.posted)} posted to ${chosen.name}`, `MVR ${r.total} ${group.moneyIn ? "in from" : "out to"} ${label}. Every one can be taken back from Answered.`);
    } catch (ex) {
      setErr(ex.message || "That could not be posted.");
    }
  }

  async function onAside() {
    setErr("");
    try {
      const r = await aside.mutateAsync({ who, moneyIn: group.moneyIn });
      refresh();
      toast.success(`${n(r.setAside)} set aside`, `${label} is out of the list. It stays in Answered.`);
    } catch (ex) {
      setErr(ex.message || "That could not be set aside.");
    }
  }

  const busy = post.isPending || aside.isPending;

  return (
    <Card padding="none" className="overflow-hidden" data-testid="question">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold truncate">{label}</span>
              <Badge tone={group.moneyIn ? "success" : "neutral"}>{group.moneyIn ? "In" : "Out"}</Badge>
            </div>
            <div className="text-[13px] text-[var(--ink-muted)] mt-1">
              {n(group.count)} {group.count === 1 ? "line" : "lines"} · {plainDate(group.from)}
              {group.from !== group.to && ` to ${plainDate(group.to)}`}
            </div>
            {group.rule && (
              <div className="text-[13px] mt-1">
                Last time: <strong>{group.rule.accountName}</strong>
                {group.rule.times > 1 && ` (${group.rule.times} times)`}
              </div>
            )}
          </div>
          <div className="tabular text-[20px] font-semibold tracking-[-.01em]">MVR {group.total}</div>
        </div>

        {phone ? (
          <div className="flex flex-col gap-2.5 mt-4">
            <Picker accounts={accounts} value={pick} onChange={setPick} id={`pick-${group.key}-${group.moneyIn}`} />
            <Button variant={pick ? "accent" : "outline"} size="lg" className="w-full whitespace-normal h-auto min-h-[52px] py-2" disabled={!pick || busy} onClick={onPost}>
              {post.isPending && <Loader2 size={14} className="animate-spin" />}
              {pick ? `${chosen.id === group.rule?.accountId ? "Same as last time: " : ""}${chosen.name} · MVR ${group.total}` : "Pick what it was"}
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Hide the lines" : `Look at the ${n(group.count)} ${group.count === 1 ? "line" : "lines"}`}
            </Button>
            <button type="button" disabled={busy} onClick={onAside} className="h-11 text-[15px] font-medium text-[var(--ink-muted)]">
              Leave for later
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Picker accounts={accounts} value={pick} onChange={setPick} id={`pick-${group.key}-${group.moneyIn}`} />
            <Button variant={pick ? "accent" : "outline"} disabled={!pick || busy} onClick={onPost}>
              {post.isPending && <Loader2 size={14} className="animate-spin" />}
              {pick ? `Post ${n(group.count)} to ${chosen.name} · MVR ${group.total}` : "Pick what it was"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={onAside}>
              Leave for later
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="ml-auto inline-flex items-center gap-1 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] h-11 px-2"
            >
              Look at them <ChevronDown size={14} className={open ? "rotate-180" : ""} />
            </button>
          </div>
        )}
        {err && (
          <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">
            {err}
          </p>
        )}
      </div>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
          {lines.isLoading ? (
            <div className="p-5 text-[13px] text-[var(--ink-muted)]">Reading the books.</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {lines.data.map((l) => (
                <Line key={l.id} line={l} accounts={accounts} refresh={refresh} pick={pick} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** One line, with whatever the books could say about it. */
function Line({ line, accounts, refresh, pick }) {
  const toast = useToast();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = accounts.find((a) => a.id === pick);

  async function run(fn, done) {
    setErr("");
    setBusy(true);
    try {
      const r = await fn();
      refresh();
      toast.success(done(r));
    } catch (ex) {
      setErr(ex.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <div className="text-[13px] text-[var(--ink-muted)] tabular">
          {plainDate(line.on)} · {line.kind}
          {line.remark ? ` · ${line.remark}` : ""}
          {line.ref ? ` · ${line.ref}` : ""}
        </div>
        <div className="tabular text-[15px] font-semibold">{line.amount}</div>
      </div>
      {line.flag && <p className="text-[12px] text-[var(--danger)] mt-1">Marked: {line.flag}.</p>}

      <div className="flex flex-wrap gap-2 mt-2">
        {line.entries.map((e) => (
          <Button
            key={e.entryId}
            variant={e.exact ? "accent" : "outline"}
            disabled={busy}
            onClick={() => run(() => bankApi.link(line.id, e.entryId), () => `Linked to entry ${e.entryNo}`)}
          >
            <Check size={14} /> {e.exact ? "Same reference" : "Already in the books"} · entry {e.entryNo}
          </Button>
        ))}
        {line.invoices.map((i) => (
          <Button
            key={i.invoiceId}
            variant="outline"
            disabled={busy}
            onClick={() => run(() => bankApi.receive(line.id, i.invoiceId), (r) => `MVR ${r.applied} against ${i.invoiceNo}`)}
          >
            Pays {i.invoiceNo}
            {i.customer ? ` · ${i.customer}` : ""} · MVR {i.left} left
          </Button>
        ))}
        {line.bills.map((b) => (
          <Button
            key={b.billId}
            variant="outline"
            disabled={busy}
            onClick={() =>
              // Paid as this bill, so Payments knows it is paid too (not only what is owed to the supplier).
              run(
                () => apiClient.post(`/bank/lines/${line.id}/pay-bill`, { billId: b.billId }).then((r) => r.data),
                (r) => `Paid ${b.supplier}${b.billNo ? `'s bill ${b.billNo}` : ""} · MVR ${r.paid}`
              )
            }
          >
            Pays {b.supplier}
            {b.billNo ? ` · bill ${b.billNo}` : ""}
          </Button>
        ))}
        {pick && (
          <Button variant="outline" disabled={busy} onClick={() => run(() => bankApi.postLine(line.id, { accountId: pick }), () => `Posted to ${chosen.name}`)}>
            Just this one to {chosen.name}
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={() => run(() => bankApi.setAside(line.id), () => "Left for later")}>
          Leave for later
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-2">
          {err}
        </p>
      )}
    </li>
  );
}

/** Everything that has been said, so a wrong answer can be found and taken back. */
function Answered({ accountId }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh(accountId);
  const [err, setErr] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["bankAnswered", companyId, accountId],
    queryFn: () => bankApi.answered(accountId),
    enabled: Boolean(companyId),
  });
  const undo = useMutation({ mutationFn: bankApi.undo });

  if (isLoading) return <Skeleton className="h-24 rounded-2xl" />;
  if (!data.length) {
    return (
      <Card padding="lg">
        <p className="text-[15px] text-[var(--ink-muted)]">Nothing has been answered yet.</p>
      </Card>
    );
  }

  const STATE = { posted: "Posted", matched: "Linked", set_aside: "For later" };

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-[var(--border)]">
        {data.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium truncate">{l.who || l.kind}</div>
              <div className="text-[13px] text-[var(--ink-muted)] tabular">
                {plainDate(l.on)} · {STATE[l.status]}
                {l.entryNo ? ` · entry ${l.entryNo}` : ""}
                {l.note ? ` · ${l.note}` : ""}
              </div>
            </div>
            <Badge tone={l.moneyIn ? "success" : "neutral"}>{l.moneyIn ? "In" : "Out"}</Badge>
            <div className="tabular text-[15px] font-semibold w-28 text-right">{l.amount}</div>
            <Button
              variant="outline"
              disabled={undo.isPending}
              onClick={async () => {
                setErr("");
                try {
                  await undo.mutateAsync(l.id);
                  refresh();
                  toast.success("Taken back", l.status === "posted" ? "The entry is reversed, and both stay in the journal." : "It is waiting again.");
                } catch (ex) {
                  setErr(ex.message || "That could not be taken back.");
                }
              }}
            >
              Take back
            </Button>
          </li>
        ))}
      </ul>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] px-5 py-3">
          {err}
        </p>
      )}
    </Card>
  );
}
