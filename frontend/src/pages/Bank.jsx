import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Landmark, Loader2, Plus, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { bankApi } from "@/api/bank";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Where the money is.
 *
 * Every figure is the sum of journal lines on that account, read when this
 * page asks. Nothing here is stored, so the bank and the tins cannot drift
 * from the books: they are the books. Moving money between two places is one
 * entry, and the same transfer sent twice lands once.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const today = () => new Date().toISOString().slice(0, 10);

const GROUPS = [
  { kind: "bank", title: "Bank accounts" },
  { kind: "box", title: "Cash boxes" },
];

export default function Bank() {
  const { companyId, can } = useCompany();
  const [moving, setMoving] = useState(0); // a new key each time the dialog opens, so it mounts fresh
  const [opening, setOpening] = useState(false);
  const [bringing, setBringing] = useState(null); // the bank account a statement is being brought into

  const { data: places, isLoading } = useQuery({
    queryKey: ["bank", companyId],
    queryFn: bankApi.places,
    enabled: Boolean(companyId),
  });

  const mayMove = can("approve") || can("adjust");

  return (
    <div>
      <PageHeader
        title="Bank and cash"
        description="Where the money is, from the books."
        actions={
          <div className="flex gap-2">
            {can("manage_settings") && (
              <Button variant="outline" onClick={() => setOpening(true)}>
                <Plus size={16} /> Bank account
              </Button>
            )}
            {mayMove && (places?.length ?? 0) > 1 && (
              <Button variant="accent" onClick={() => setMoving((k) => k + 1)}>
                <ArrowLeftRight size={16} /> Move money
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !places?.length ? (
        <EmptyState
          icon={Landmark}
          title="No bank account yet"
          description="A company starts with one called Bank. If it is missing, an administrator can add it here."
        />
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const rows = places.filter((p) => p.kind === g.kind);
            if (!rows.length) return null;
            return (
              <Card key={g.kind} padding="none" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                  {g.title}
                </div>
                <ul className="divide-y divide-[var(--border)]">
                  {rows.map((p) => (
                    <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium truncate">{p.name.replace(/^Cash: /, "")}</div>
                        <div className="text-[13px] text-[var(--ink-muted)] tabular">
                          {p.code}
                          {p.statement?.lines > 0 && ` · ${p.statement.lines.toLocaleString("en-US")} statement lines`}
                        </div>
                        {p.statement?.lines > 0 && (
                          <Link
                            to={`/bank/${p.id}`}
                            className="inline-block text-[13px] font-medium underline underline-offset-2 mt-0.5"
                          >
                            {p.statement.waiting > 0
                              ? `${p.statement.waiting.toLocaleString("en-US")} waiting to be answered`
                              : "Nothing waiting. See what was answered"}
                          </Link>
                        )}
                      </div>
                      {p.kind === "bank" && mayMove && (
                        <Button variant="outline" onClick={() => setBringing(p)}>
                          <Upload size={15} /> Statement
                        </Button>
                      )}
                      {p.overdrawn && <Badge tone="danger">Below zero</Badge>}
                      <div
                        className={`tabular text-[17px] font-semibold ${p.overdrawn ? "text-[var(--danger)]" : ""}`}
                      >
                        {p.balance}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {moving > 0 && <MoveMoney key={moving} places={places || []} onClose={() => setMoving(0)} />}
      <OpenBank open={opening} onClose={() => setOpening(false)} />
      {bringing && <BringStatement key={bringing.id} place={bringing} onClose={() => setBringing(null)} />}
    </div>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["bank", companyId] });
    queryClient.invalidateQueries({ queryKey: ["cash", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
  };
}

function MoveMoney({ places, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [fromId, setFromId] = useState(places[0]?.id || "");
  const [toId, setToId] = useState(places[1]?.id || "");
  const [amount, setAmount] = useState("");
  const [on, setOn] = useState(today());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  // One ref per opening of this dialog: a second press after a slow answer is
  // the same transfer, not another one.
  const [clientRef] = useState(() => crypto.randomUUID());

  const send = useMutation({ mutationFn: bankApi.transfer });
  const name = (id) => places.find((p) => p.id === id)?.name.replace(/^Cash: /, "");

  const blocker = !amount.trim()
    ? "How much is moving?"
    : fromId === toId
      ? "That is the same place twice"
      : null;

  async function onSubmit(e) {
    e.preventDefault();
    if (blocker) return setErr(blocker);
    setErr("");
    try {
      const r = await send.mutateAsync({ fromId, toId, amount: amount.trim(), on, note: note.trim() || null, clientRef });
      refresh();
      toast.success(`MVR ${amount.trim()} moved · entry ${r.entryNo}`, `${name(fromId)} to ${name(toId)}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be moved.");
    }
  }

  const options = places.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name.replace(/^Cash: /, "")} · MVR {p.balance}
    </option>
  ));

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="Move money" description="From one place to another. It is one entry in the books.">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">From</span>
          <select id="move-from" value={fromId} onChange={(e) => setFromId(e.target.value)} className={FIELD}>
            {options}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">To</span>
          <select id="move-to" value={toId} onChange={(e) => setToId(e.target.value)} className={FIELD}>
            {options}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">How much</span>
            <input id="move-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">On</span>
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className={`${FIELD} tabular`} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What for</span>
          <input id="move-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={FIELD} />
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
        <Button type="submit" variant={blocker ? "outline" : "accent"} disabled={send.isPending}>
          {send.isPending && <Loader2 size={14} className="animate-spin" />}
          {blocker || `Move MVR ${amount.trim()}`}
        </Button>
      </div>
    </Modal>
  );
}

function OpenBank({ open, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const make = useMutation({ mutationFn: bankApi.open });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const a = await make.mutateAsync(name.trim());
      refresh();
      toast.success(`${a.name} is open`, "It starts at nothing. Move money in from another account.");
      setName("");
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be opened.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} as="form" onSubmit={onSubmit} title="New bank account" description="Name it the way the statement does, so nobody has to guess which one a file belongs to.">
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">Name</span>
        <input id="bank-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bank of Maldives USD" className={FIELD} />
      </label>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={make.isPending || name.trim().length < 2}>
          {make.isPending && <Loader2 size={14} className="animate-spin" />}
          Open it
        </Button>
      </div>
    </Modal>
  );
}

const n = (x) => x.toLocaleString("en-US");

const plainDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A statement file in. It records what the bank says and posts nothing, and it
 * says whether the file agrees with itself: each line's running balance should
 * be the one before it plus what came in less what went out, which is only true
 * if every column was read correctly.
 */
function BringStatement({ place, onClose }) {
  const refresh = useRefresh();
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const send = useMutation({ mutationFn: (csv) => bankApi.statement(place.id, csv) });

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setResult(null);
    try {
      setResult(await send.mutateAsync(await file.text()));
      refresh();
    } catch (ex) {
      setErr(ex.message || "That file could not be read.");
    }
  }

  const agrees = result && result.balance.breaks === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Statement · ${place.name}`}
      description="Export it from internet banking as a CSV and drop it here. This records what the bank says. It does not change the books."
    >
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">The file</span>
        <input id="statement-file" type="file" accept=".csv,text/csv" onChange={onPick} className={FIELD + " py-2 h-auto"} />
      </label>

      {send.isPending && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)] mt-4">
          <Loader2 size={14} className="animate-spin" /> Reading it.
        </p>
      )}

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      {result && (
        <div className="mt-5 space-y-2 text-[14px]" data-testid="statement-result">
          <p>
            <strong className="tabular">{result.read.toLocaleString("en-US")}</strong> lines, from {plainDate(result.from)} to{" "}
            {plainDate(result.to)}. <strong className="tabular">{result.added.toLocaleString("en-US")}</strong> new
            {result.alreadyHad > 0 && `, ${result.alreadyHad.toLocaleString("en-US")} already here`}.
          </p>
          {result.balance.opening !== null && (
            <p className="text-[var(--ink-muted)]">
              Balance <span className="tabular">{result.balance.opening}</span> to <span className="tabular">{result.balance.closing}</span>.
            </p>
          )}
          {agrees ? (
            <p>The file's own balances add up to the laari, so every column was read correctly.</p>
          ) : (
            <p role="alert" className="text-[var(--danger)]">
              {result.balance.breaks} lines do not follow from the one before, starting at line {result.balance.firstBreak}. The
              file may have been read wrongly. Do not act on it until that is explained.
            </p>
          )}
          {result.matched > 0 && (
            <p>
              <strong className="tabular">{n(result.matched)}</strong> {result.matched === 1 ? "line matched" : "lines matched"} a
              receipt already in the books by its reference, and{" "}
              {result.matched === 1 ? "was" : "were"} linked.
            </p>
          )}
          {result.flagged > 0 && (
            <p className="text-[var(--ink-muted)]">
              {result.flagged} {result.flagged === 1 ? "line carries" : "lines carry"} something odd in one field. Kept, and marked.
            </p>
          )}
          {result.skipped.length > 0 && (
            <p className="text-[var(--danger)]">
              {result.skipped.length} lines could not be read at all: line {result.skipped[0].rowNo}, {result.skipped[0].why}.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          {result ? "Done" : "Cancel"}
        </Button>
      </div>
    </Modal>
  );
}
