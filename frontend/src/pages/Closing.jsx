import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, LockOpen, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { periodsApi } from "@/api/periods";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Closing the books.
 *
 * Until a month can be closed there is no final figure: every report is
 * provisional forever. Closing is one act, refused by the database for
 * anything dated inside the month afterwards. Reopening is another, with a
 * name and a reason on it. Putting something into a closed month is possible
 * and deliberate: it has to say why, and the reason is kept against the entry.
 *
 * Nothing on this page is stored as a balance. Every act is a row in an
 * append-only log, and what is shown is that log.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const niceDate = (iso) =>
  new Date(String(iso).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const niceTime = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);

/** Whole laari from "1,250.5", or null when it is not an amount. */
function laari(text) {
  const t = String(text || "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}
const show = (l) => `${Math.floor(l / 100).toLocaleString("en-US")}.${String(l % 100).padStart(2, "0")}`;

function useRefresh() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["periods", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
    queryClient.invalidateQueries({ queryKey: ["bank", companyId] });
  };
}

export default function Closing() {
  const { companyId, can } = useCompany();
  const [reopening, setReopening] = useState(false);
  const [adjusting, setAdjusting] = useState(0); // a new key each time it opens, so it mounts fresh

  const { data, isLoading } = useQuery({
    queryKey: ["periods", companyId],
    queryFn: periodsApi.overview,
    enabled: Boolean(companyId),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;

  const locked = data.lockedThrough;

  return (
    <div>
      <PageHeader
        title="Closing"
        description="A closed month cannot be changed by accident."
        actions={
          can("adjust") && (
            <Button variant="outline" onClick={() => setAdjusting((k) => k + 1)}>
              <Plus size={16} /> Adjustment
            </Button>
          )
        }
      />

      <Card padding="lg" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
              {locked ? <Lock size={18} /> : <LockOpen size={18} className="text-[var(--ink-muted)]" />}
            </div>
            <div>
              <div className="text-[13px] font-medium text-[var(--ink-muted)]">The books are</div>
              <div className="text-[20px] font-semibold tracking-[-.01em]" data-testid="lock-state">
                {locked ? `Closed through ${niceDate(locked)}` : "Open. Nothing is closed yet"}
              </div>
            </div>
          </div>
          {locked && can("close") && (
            <Button variant="outline" onClick={() => setReopening(true)}>
              <LockOpen size={15} /> Reopen
            </Button>
          )}
        </div>
      </Card>

      {can("close") && <CloseNext candidates={data.candidates} />}
      {can("close") && <CloseYear />}

      <History history={data.history} adjustments={data.adjustments} />

      {reopening && <Reopen locked={locked} onClose={() => setReopening(false)} />}
      {adjusting > 0 && <Adjust key={adjusting} locked={locked} onClose={() => setAdjusting(0)} />}
    </div>
  );
}

/**
 * Closing a year: its depreciation charged, then the books closed through 31
 * December. Offered for last year until it is done. Profit is not swept into an
 * account; the balance sheet shows it as earlier years' earnings from 1 January.
 */
function CloseYear() {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh();
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const year = new Date().getFullYear() - 1;
  const { data: s } = useQuery({
    queryKey: ["periods", companyId, "year", year],
    queryFn: () => apiClient.get("/periods/year-end", { params: { year } }).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const close = useMutation({ mutationFn: () => apiClient.post("/periods/year-end", { year }).then((r) => r.data) });
  if (!s || s.closed) return null;

  const unfinished = s.doubts.bills + s.doubts.invoices + s.doubts.bankLines;
  async function onClose() {
    setErr("");
    try {
      const r = await close.mutateAsync();
      refresh();
      qc.invalidateQueries({ queryKey: ["assets", companyId] });
      toast.success(`${year} is closed`, r.depreciation !== "0.00" ? `MVR ${r.depreciation} of depreciation charged first.` : "Its figures can no longer change by accident.");
    } catch (ex) {
      setErr(ex.message || "That could not be closed.");
    }
  }

  return (
    <Card padding="lg" className="mb-4" data-testid="close-year">
      <div className="text-[13px] font-medium text-[var(--ink-muted)] mb-2">Close the year</div>
      <div className="text-[20px] font-semibold tracking-[-.01em]">
        {year}: {s.loss ? "a loss" : "a profit"} of MVR {s.profit.replace(/^-/, "")}
      </div>
      <ul className="mt-2 text-[14px] space-y-1">
        <li>
          {s.depreciationMonths > 0
            ? `MVR ${s.depreciationToCharge} of depreciation is still to be charged, over ${s.depreciationMonths} ${s.depreciationMonths === 1 ? "month" : "months"}. Closing charges it first.`
            : "Depreciation is charged for the whole year."}
        </li>
        {unfinished > 0 && (
          <li>
            <Link to="/bills" className="underline underline-offset-2">
              {unfinished} {unfinished === 1 ? "thing is" : "things are"} unfinished in {year}
            </Link>
            . You can still close; look first.
          </li>
        )}
        <li className="text-[var(--ink-muted)]">
          Nothing is swept between accounts: from 1 January the balance sheet shows {year}'s result under earlier years' earnings.
        </li>
      </ul>
      <Button variant="outline" className="mt-4" disabled={close.isPending} onClick={onClose}>
        {close.isPending && <Loader2 size={14} className="animate-spin" />}
        Close {year}
      </Button>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">
          {err}
        </p>
      )}
    </Card>
  );
}

/** The next month that could be closed, with what is unfinished in it shown first. */
function CloseNext({ candidates }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh();
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");
  const through = pick || candidates[0] || "";

  const doubts = useQuery({
    queryKey: ["periods", companyId, "doubts", through],
    queryFn: () => periodsApi.doubts(through),
    enabled: Boolean(through),
  });
  const close = useMutation({ mutationFn: periodsApi.close });

  if (!candidates.length) {
    return (
      <Card padding="lg" className="mb-4">
        <p className="text-[15px] text-[var(--ink-muted)]">
          Nothing more can be closed yet. A month can be closed once it is over and has something in it.
        </p>
      </Card>
    );
  }

  const d = doubts.data;
  const lines = d
    ? [
        d.bills > 0 && { text: `${d.bills} ${d.bills === 1 ? "bill" : "bills"} recorded but not yet in the books`, to: "/bills" },
        d.invoices > 0 && { text: `${d.invoices} invoice ${d.invoices === 1 ? "draft" : "drafts"} not yet in the books`, to: "/invoices" },
        d.bankLines > 0 && { text: `${d.bankLines} bank ${d.bankLines === 1 ? "line" : "lines"} the books do not explain`, to: "/bank" },
      ].filter(Boolean)
    : [];

  async function onClose() {
    setErr("");
    try {
      await close.mutateAsync(through);
      refresh();
      toast.success(`Closed through ${niceDate(through)}`, "Nothing dated on or before it can be posted now without a reason.");
      setPick("");
    } catch (ex) {
      setErr(ex.message || "That could not be closed.");
    }
  }

  return (
    <Card padding="lg" className="mb-4">
      <div className="text-[13px] font-medium text-[var(--ink-muted)] mb-2">Close the next month</div>
      <div className="flex flex-wrap items-center gap-2">
        <select id="close-through" value={through} onChange={(e) => setPick(e.target.value)} className={FIELD + " max-w-[260px]"} aria-label="Close through">
          {candidates.map((c) => (
            <option key={c} value={c}>
              Through {niceDate(c)}
            </option>
          ))}
        </select>
        <Button variant="accent" disabled={close.isPending} onClick={onClose}>
          {close.isPending && <Loader2 size={14} className="animate-spin" />}
          Close the books through {niceDate(through)}
        </Button>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 text-[14px]" data-testid="doubts">
          <p className="font-medium">Unfinished in that time. You can still close it; look first.</p>
          <ul className="mt-1.5 space-y-1">
            {lines.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="underline underline-offset-2">
                  {l.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">
          {err}
        </p>
      )}
    </Card>
  );
}

function History({ history, adjustments }) {
  if (!history.length && !adjustments.length) return null;
  return (
    <div className="space-y-4">
      {history.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            Closes and reopens
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5">
                <Badge tone={h.action === "close" ? "neutral" : "danger"}>{h.action === "close" ? "Closed" : "Reopened"}</Badge>
                <div className="text-[14px] font-medium">
                  {h.locked_through ? `Through ${niceDate(h.locked_through)}` : "All the way"}
                </div>
                <div className="text-[13px] text-[var(--ink-muted)]">
                  {h.who || "Somebody"} · {niceTime(h.at)}
                </div>
                {h.reason && <div className="basis-full text-[13px]">&ldquo;{h.reason}&rdquo;</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {adjustments.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            Put into a closed month
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {adjustments.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <span className="text-[14px] font-medium tabular">Entry {a.entry_no}</span>
                  <span className="text-[13px] text-[var(--ink-muted)] tabular">
                    dated {niceDate(a.entry_date)} · {a.who || "Somebody"} · {niceTime(a.at)}
                  </span>
                </div>
                <div className="text-[13px] mt-0.5">{a.narrative}</div>
                <div className="text-[13px] text-[var(--ink-muted)] mt-0.5">Why: {a.reason}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Going back. The button names where it goes back to. */
function Reopen({ locked, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();

  // Month ends before the lock, newest first, as far as two years back, and all the way.
  const options = useMemo(() => {
    const out = [];
    const [y, m] = locked.split("-").map(Number);
    for (let i = 1; i <= 24; i += 1) {
      const end = new Date(Date.UTC(y, m - 1 - i + 1, 0));
      out.push(end.toISOString().slice(0, 10));
    }
    return out;
  }, [locked]);

  const [to, setTo] = useState(options[0]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const reopen = useMutation({ mutationFn: ({ through, why }) => periodsApi.reopen(through, why) });

  const blocker = reason.trim().length < 3 ? "Say why" : null;
  const target = to === "all" ? null : to;

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr("Say why the books are being reopened.");
    setErr("");
    try {
      await reopen.mutateAsync({ through: target, why: reason.trim() });
      refresh();
      toast.success(target ? `Reopened back to ${niceDate(target)}` : "Reopened. Nothing is closed", "The act is in the history with your name and what you said.");
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be reopened.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title="Reopen the books"
      description={`They are closed through ${niceDate(locked)}. Whatever was reported for those months may now change, so this is written down with your name.`}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Back to</span>
          <select id="reopen-to" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD}>
            {options.map((o) => (
              <option key={o} value={o}>
                Closed through {niceDate(o)}
              </option>
            ))}
            <option value="all">Nothing closed, all the way</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Why</span>
          <textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={FIELD + " h-auto py-3"}
            placeholder="What was found, and by whom"
          />
        </label>
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={reopen.isPending}>
          {reopen.isPending && <Loader2 size={14} className="animate-spin" />}
          {blocker || (target ? `Reopen back to ${niceDate(target)}` : "Reopen everything")}
        </Button>
      </div>
    </Modal>
  );
}

const BLANK = () => ({ key: Math.random().toString(36).slice(2), accountId: "", debit: "", credit: "", memo: "" });

/** A journal entry by hand. Into a closed month it must say why. */
function Adjust({ locked, onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh();
  const [date, setDate] = useState(today());
  const [narrative, setNarrative] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState([BLANK(), BLANK()]);
  const [err, setErr] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["periods", companyId, "accounts"],
    queryFn: periodsApi.accounts,
  });
  const adjust = useMutation({ mutationFn: periodsApi.adjust });

  const into = Boolean(locked && date <= locked);
  const debit = rows.reduce((s, r) => s + (laari(r.debit) || 0), 0);
  const credit = rows.reduce((s, r) => s + (laari(r.credit) || 0), 0);
  const filled = rows.filter((r) => r.accountId && (laari(r.debit) || laari(r.credit)));

  const blocker =
    narrative.trim().length < 3
      ? "Say what this is"
      : filled.length < 2
        ? "Two lines at least"
        : debit !== credit
          ? `Out by ${show(Math.abs(debit - credit))}`
          : into && reason.trim().length < 3
            ? "Say why it is going in"
            : null;

  const set = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr(blocker);
    setErr("");
    try {
      const r = await adjust.mutateAsync({
        date,
        narrative: narrative.trim(),
        reason: reason.trim() || null,
        lines: filled.map((l) => ({
          accountId: l.accountId,
          debit: laari(l.debit) ? show(laari(l.debit)).replace(/,/g, "") : null,
          credit: laari(l.credit) ? show(laari(l.credit)).replace(/,/g, "") : null,
          memo: l.memo.trim() || null,
        })),
      });
      refresh();
      toast.success(`Adjustment in the books · entry ${r.entryNo}`, r.intoClosedPeriod ? "It went into a closed month, and your reason is kept with it." : `MVR ${r.total}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be posted.");
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} size="lg" title="Adjustment" description="A journal entry written by hand. Every line is a debit or a credit, and the two sides must match.">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-3">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Dated</span>
            <input id="adj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${FIELD} tabular`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">What it is</span>
            <input id="adj-narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} className={FIELD} placeholder="Late fuel bill, August" />
          </label>
        </div>

        {into && (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">
              Why it is going into a closed month <span className="text-[var(--ink-muted)] font-normal">(closed through {niceDate(locked)})</span>
            </span>
            <input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD} placeholder="Invoice arrived in September" />
          </label>
        )}

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_110px_110px_36px] gap-2 items-center">
              <select
                aria-label={`Line ${i + 1}: account`}
                value={r.accountId}
                onChange={(e) => set(r.key, { accountId: e.target.value })}
                className={FIELD}
              >
                <option value="">Account</option>
                {(accounts || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
              <input aria-label={`Line ${i + 1}: debit`} value={r.debit} onChange={(e) => set(r.key, { debit: e.target.value, credit: e.target.value ? "" : r.credit })} placeholder="Debit" inputMode="decimal" className={`${FIELD} tabular text-right`} />
              <input aria-label={`Line ${i + 1}: credit`} value={r.credit} onChange={(e) => set(r.key, { credit: e.target.value, debit: e.target.value ? "" : r.debit })} placeholder="Credit" inputMode="decimal" className={`${FIELD} tabular text-right`} />
              <button
                type="button"
                aria-label={`Remove line ${i + 1}`}
                disabled={rows.length <= 2}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="h-11 w-9 flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-30"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setRows((rs) => [...rs, BLANK()])} className="text-[13px] underline underline-offset-2 h-11">
              Add a line
            </button>
            <div className="tabular text-[13px] text-[var(--ink-muted)]">
              Debits {show(debit)} · Credits {show(credit)}
            </div>
          </div>
        </div>
      </div>

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={adjust.isPending}>
          {adjust.isPending && <Loader2 size={14} className="animate-spin" />}
          {blocker || `Post adjustment · MVR ${show(debit)}`}
        </Button>
      </div>
    </Modal>
  );
}
