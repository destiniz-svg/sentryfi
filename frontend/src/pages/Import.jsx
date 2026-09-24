import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/UIContext";
import { ZohoCard } from "@/components/import/ZohoCard";

/**
 * Bringing history in from another system.
 *
 * Look first, then say yes. The file is read and nothing is written until the
 * person has said what each of the other system's accounts is here. Every
 * transaction then goes in as an ordinary balanced entry; one that does not
 * balance is listed and left out; the same file again adds nothing.
 */

const SYSTEMS = [
  { value: "zoho", label: "Zoho Books" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "xero", label: "Xero" },
  { value: "other", label: "Something else" },
];

const TYPES = [
  { value: "asset", label: "Something we hold" },
  { value: "liability", label: "Something we owe" },
  { value: "equity", label: "The owners' stake" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Spending" },
];

const FIELD = "h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[14px] max-w-full";

const niceDate = (iso) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export default function Import() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [system, setSystem] = useState("zoho");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState({}); // theirName -> accountId | "new:<type>"
  const [ours, setOurs] = useState([]);
  // Their own account types, from their chart of accounts, when given.
  const [chart, setChart] = useState({});
  // Accounts already brought in whose kind their chart disagrees with.
  const [differ, setDiffer] = useState([]);
  // Where the transactions come from: a file, or Zoho directly over dates.
  const [source, setSource] = useState(null); // { kind: "csv" } | { kind: "zoho", from, to }

  const look = useMutation({
    mutationFn: async (src) => {
      const [p, accounts] = await Promise.all([
        src.kind === "zoho"
          ? apiClient.post("/zoho/preview", { from: src.from, to: src.to }).then((r) => r.data)
          : apiClient.post(`/imports/preview?system=${system}`, src.csv, { headers: { "Content-Type": "text/csv" } }).then((r) => r.data),
        apiClient.get("/periods/accounts").then((r) => r.data.accounts),
      ]);
      setOurs(accounts);
      setAnswer(Object.fromEntries(p.accounts.map((a) => [a.theirs, a.accountId || `new:${chart[a.theirs] || a.suggestType}`])));
      return p;
    },
  });
  // A file goes in 400 at a time, so no single request runs long enough to
  // time out; each chunk only adds what is not in yet, so a failed one can
  // simply be run again. Progress is what has gone in so far.
  const [progress, setProgress] = useState(null); // { done, of }
  const bring = useMutation({
    mutationFn: async (mapping) => {
      if (source?.kind === "zoho") {
        return apiClient.post("/zoho/commit", { from: source.from, to: source.to, mapping }).then((r) => r.data);
      }
      const of = look.data?.toPost || 0;
      let total = { posted: 0, unbalanced: 0 };
      for (let first = true; ; first = false) {
        const r = await apiClient
          .post(`/imports/commit?system=${system}`, { text, mapping: first ? mapping : {}, limit: 400 })
          .then((res) => res.data);
        total = { posted: total.posted + r.posted, unbalanced: r.unbalanced };
        setProgress({ done: total.posted, of });
        if (!r.remaining || !r.posted) return total;
      }
    },
    onSettled: () => setProgress(null),
  });

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    setText(csv);
    setName(file.name);
    setSource({ kind: "csv", csv });
    bring.reset();
    look.mutate({ kind: "csv", csv });
  }

  async function onChart(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { types } = await apiClient
        .post("/imports/chart", await file.text(), { headers: { "Content-Type": "text/csv" } })
        .then((r) => r.data);
      setChart(types);
      const csv = await file.text();
      const check = await apiClient
        .post(`/imports/chart/check?system=${system}`, csv, { headers: { "Content-Type": "text/csv" } })
        .then((r) => r.data)
        .catch(() => ({ differ: [] }));
      setDiffer(check.differ);
      // Accounts already listed take their own type; ones pointed at an account here stay.
      setAnswer((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.startsWith("new:") && types[k] ? `new:${types[k]}` : v])));
    } catch (ex) {
      toast.error("That chart could not be read", ex.message);
    }
  }

  const fix = useMutation({
    mutationFn: () =>
      apiClient
        .post("/imports/chart/apply", {
          changes: differ.map((d) => ({ accountId: d.accountId, type: d.should })),
          reason: "Corrected from their chart of accounts",
        })
        .then((r) => r.data),
    onSuccess: (r) => {
      queryClient.invalidateQueries();
      toast.success(`${r.changed} ${r.changed === 1 ? "account" : "accounts"} corrected`, "No entry changed. The statements now put them in the right place.");
      setDiffer([]);
    },
    onError: (ex) => toast.error("Nothing was changed", ex.message),
  });

  async function onBring() {
    const mapping = Object.fromEntries(
      Object.entries(answer).map(([theirs, v]) => [theirs, v.startsWith("new:") ? { create: v.slice(4) } : v])
    );
    try {
      const r = await bring.mutateAsync(mapping);
      queryClient.invalidateQueries();
      toast.success(`${r.posted} ${r.posted === 1 ? "transaction" : "transactions"} brought in`, r.unbalanced ? `${r.unbalanced} did not balance and were left out.` : "Every one balanced.");
      look.mutate(source);
    } catch (ex) {
      toast.error("Nothing was brought in", ex.message);
    }
  }

  const p = look.data;
  const newOnes = p ? p.accounts.filter((a) => a.how === "new").length : 0;

  return (
    <div>
      <PageHeader title="Bring history in" description="From another accounting system: connected directly, or as a CSV export." />

      <ZohoCard
        busy={look.isPending}
        onLook={(from, to) => {
          const src = { kind: "zoho", from, to };
          setSource(src);
          setName("Zoho Books");
          bring.reset();
          look.mutate(src);
        }}
      />

      <Card padding="lg" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">From</span>
            <select id="import-system" value={system} onChange={(e) => setSystem(e.target.value)} className={FIELD}>
              {SYSTEMS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[240px]">
            <span className="text-sm font-medium block mb-1.5">The export</span>
            <input id="import-file" type="file" accept=".csv,text/csv" onChange={onPick} className={FIELD + " w-full h-11 py-1.5 file:mr-3 file:h-8 file:rounded-full file:border-0 file:bg-[var(--surface-2)] file:px-4 file:text-[14px] file:font-medium file:text-[var(--ink)] file:cursor-pointer"} />
          </label>
          <label className="block flex-1 min-w-[240px]">
            <span className="text-sm font-medium block mb-1.5">
              Their chart of accounts <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
            </span>
            <input id="import-chart" type="file" accept=".csv,text/csv" onChange={onChart} className={FIELD + " w-full h-11 py-1.5 file:mr-3 file:h-8 file:rounded-full file:border-0 file:bg-[var(--surface-2)] file:px-4 file:text-[14px] file:font-medium file:text-[var(--ink)] file:cursor-pointer"} />
          </label>
        </div>
        <p className="text-[13px] text-[var(--ink-muted)] mt-3 max-w-[80ch]">
          From Zoho Books: Reports, Journal Report, whole period, Export as CSV. Any file with a date, an account, a debit and a
          credit column works. The chart of accounts (Accountant, Chart of Accounts, Export) says what every account is, so none
          has to be guessed. Nothing is written until you say so.
        </p>
        {Object.keys(chart).length > 0 && (
          <p className="text-[13px] mt-2" data-testid="chart-note">
            {Object.keys(chart).length} accounts typed from their chart.
          </p>
        )}
      </Card>

      {differ.length > 0 && (
        <Card padding="none" className="overflow-hidden mb-4" data-testid="chart-differ">
          <div className="px-5 pt-4 pb-2 text-[15px] font-semibold">
            {differ.length} {differ.length === 1 ? "account was" : "accounts were"} brought in as the wrong kind
          </div>
          <p className="px-5 pb-3 text-[13px] text-[var(--ink-muted)]">
            Their chart says otherwise. Correcting them changes no entry and no balance: it moves each one to the right place on the
            profit and loss and the balance sheet. Each change is written down.
          </p>
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {differ.map((d) => (
              <li key={d.accountId} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2.5 text-[14px]">
                <span className="font-medium">{d.name}</span>
                <span className="text-[13px] text-[var(--ink-muted)]">
                  {TYPES.find((t) => t.value === d.now)?.label} → <strong className="text-[var(--ink)]">{TYPES.find((t) => t.value === d.should)?.label}</strong>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-5 py-4 border-t border-[var(--border)]">
            <Button variant="accent" disabled={fix.isPending} onClick={() => fix.mutate()}>
              {fix.isPending && <Loader2 size={15} className="animate-spin" />}
              Correct {differ.length} {differ.length === 1 ? "account" : "accounts"}
            </Button>
          </div>
        </Card>
      )}

      {look.isPending && (
        <p className="flex items-center gap-2 text-[14px] text-[var(--ink-muted)]">
          <Loader2 size={15} className="animate-spin" /> Reading {name}.
        </p>
      )}
      {look.isError && (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {look.error.message}
        </p>
      )}

      {p && (
        <div className="space-y-4" data-testid="import-preview">
          <Card padding="lg">
            <p className="text-[15px]">
              <strong className="tabular">{p.count}</strong> transactions from {niceDate(p.from)} to {niceDate(p.to)}.{" "}
              {p.alreadyHad > 0 && `${p.alreadyHad} were brought in before. `}
              {p.fromOtherImports > 0 && (
                <span className="block mt-2 text-[var(--danger)] font-medium">
                  {p.fromOtherImports} transactions in these dates came in from a CSV already. Bringing these in as well would count them twice.
                </span>
              )}
              <strong className="tabular">{p.toPost}</strong> would go in now.
            </p>
            {p.unbalancedCount > 0 && (
              <div className="mt-3 text-[14px]">
                <p className="text-[var(--danger)] font-medium">
                  {p.unbalancedCount} {p.unbalancedCount === 1 ? "does" : "do"} not balance and will be left out.
                </p>
                <ul className="mt-1 text-[13px] text-[var(--ink-muted)] tabular">
                  {p.unbalanced.slice(0, 8).map((u, i) => (
                    <li key={i}>
                      {niceDate(u.date)} {u.id || "(no number)"}: debits {u.debit}, credits {u.credit}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.skipped.length > 0 && (
              <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
                {p.skipped.length} rows could not be read. The first: row {p.skipped[0].rowNo}, {p.skipped[0].why}.
              </p>
            )}
          </Card>

          {p.accounts.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <div className="px-5 pt-4 pb-2 text-[15px] font-semibold">What their accounts are here</div>
              <p className="px-5 pb-3 text-[13px] text-[var(--ink-muted)]">
                {newOnes ? `${newOnes} are not in these books yet. Check each guess; it is remembered for the next file.` : "Every one is known."}
              </p>
              <ul className="divide-y divide-[var(--border)]">
                {p.accounts.map((a) => (
                  <li key={a.theirs} className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-[var(--border)]">
                    <div className="flex-1 min-w-[180px] text-[14px]">
                      <span className="font-medium">{a.theirs}</span>
                      {a.code && <span className="text-[var(--ink-muted)] tabular"> · {a.code}</span>}
                      {a.how !== "new" && <span className="text-[12px] text-[var(--ink-muted)]"> · {a.how}</span>}
                    </div>
                    <select
                      aria-label={`What ${a.theirs} is here`}
                      value={answer[a.theirs] || ""}
                      onChange={(e) => setAnswer((m) => ({ ...m, [a.theirs]: e.target.value }))}
                      className={FIELD}
                    >
                      <optgroup label="Make it a new account">
                        {TYPES.map((t) => (
                          <option key={t.value} value={`new:${t.value}`}>
                            New: {t.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Already here">
                        {ours.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.code} {o.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {bring.data && (
              <Link to="/statements" className="text-[14px] underline underline-offset-2">
                See the trial balance
              </Link>
            )}
            <Button variant={p.toPost ? "accent" : "outline"} disabled={!p.toPost || bring.isPending} onClick={onBring}>
              {bring.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {progress
                ? `${progress.done.toLocaleString("en-US")} of ${progress.of.toLocaleString("en-US")} in`
                : p.toPost
                  ? `Bring in ${p.toPost.toLocaleString("en-US")} ${p.toPost === 1 ? "transaction" : "transactions"}`
                  : "Nothing new to bring in"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
