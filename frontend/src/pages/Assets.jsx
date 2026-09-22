import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";

/**
 * Fixed assets: the things the business owns and uses for more than a year —
 * a boat, a generator, a van, computers. Each is bought once, wears out a
 * little every month, and is sold or scrapped at the end. The page says what
 * each one cost, what has worn off it, and what it is worth in the books now.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const lastMonthEnd = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
};

function useRefresh() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    for (const k of ["assets", "figures", "attention", "bank"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
}

export default function Assets() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [selling, setSelling] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", companyId],
    queryFn: () => apiClient.get("/assets").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const charge = useMutation({ mutationFn: () => apiClient.post("/assets/depreciate", { through: lastMonthEnd() }).then((r) => r.data) });
  async function onCharge() {
    try {
      const r = await charge.mutateAsync();
      refresh();
      if (r.months.length === 0) toast.success("Nothing to charge", "Every month that has ended is already charged.");
      else toast.success(`MVR ${r.total} charged`, `${r.months.length} ${r.months.length === 1 ? "month" : "months"}, through ${formatDate(lastMonthEnd())}.`);
    } catch (ex) {
      toast.error("Not yet", ex.message);
    }
  }

  const list = data?.assets || [];
  const inUse = list.filter((a) => !a.disposedOn);

  return (
    <div>
      <PageHeader
        title="Fixed assets"
        description="What the business owns and uses for more than a year, and what it is worth in the books."
        actions={
          <>
            {can("adjust") && inUse.length > 0 && (
              <Button variant="outline" onClick={onCharge} disabled={charge.isPending}>
                {charge.isPending && <Loader2 size={14} className="animate-spin" />}
                Charge depreciation to {formatDate(lastMonthEnd())}
              </Button>
            )}
            {can("record") && (
              <Button variant="accent" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add an asset
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : list.length === 0 ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No assets yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            A boat, a generator, a vehicle, machinery, computers: anything bought to be used for more than a year. Its cost is not
            a cost of the month it was bought in. It is spread over the years it is used, a little each month, which is called
            depreciation. Add one and Sentryfi works that out and charges it for you.
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_110px_120px_120px_130px_auto] gap-4 px-5 py-3 border-b border-[var(--border)] font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            <span>Asset</span>
            <span>Bought</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Worn off</span>
            <span className="text-right">Worth now</span>
            <span />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {list.map((a) => (
              <div key={a.id} className="grid grid-cols-2 md:grid-cols-[minmax(0,1.6fr)_110px_120px_120px_130px_auto] gap-x-4 gap-y-1 px-5 py-4 items-center">
                <div className="min-w-0 col-span-2 md:col-span-1">
                  <div className="text-[15px] font-semibold truncate">{a.name}</div>
                  <div className="text-[13px] text-[var(--ink-muted)] truncate">
                    {a.categoryName} ·{" "}
                    {a.method === "reducing_balance" ? `${a.ratePct}% a year of what is left` : `over ${a.lifeYears} ${a.lifeYears === 1 ? "year" : "years"}`}
                  </div>
                </div>
                <div className="text-[14px] text-[var(--ink-muted)] tabular">{formatDate(a.acquiredOn)}</div>
                <div className="text-[14px] text-right">
                  <Money amount={a.cost} />
                </div>
                <div className="text-[14px] text-right text-[var(--ink-muted)] hidden md:block">
                  <Money amount={a.worn} />
                </div>
                <div className="text-[15px] font-semibold text-right">
                  {a.disposedOn ? <Badge tone="neutral">{Number(a.proceeds?.replace(/,/g, "")) > 0 ? "Sold" : "Scrapped"}</Badge> : <Money amount={a.bookValue} />}
                </div>
                <div className="col-span-2 md:col-span-1 md:text-right">
                  {!a.disposedOn && can("adjust") && (
                    <Button variant="outline" size="sm" onClick={() => setSelling(a)}>
                      Sold or scrapped
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {adding && data && <AddAsset data={data} onClose={() => setAdding(false)} onDone={refresh} />}
      {selling && data && <Dispose asset={selling} payFrom={data.payFrom} onClose={() => setSelling(null)} onDone={refresh} />}
    </div>
  );
}

function AddAsset({ data, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", category: "equipment", cost: "", residual: "", acquiredOn: today(), lifeYears: "", method: "straight_line", ratePct: "", fromAccountId: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cat = data.categories.find((c) => c.key === f.category);
  const save = useMutation({ mutationFn: (body) => apiClient.post("/assets", body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await save.mutateAsync({
        name: f.name,
        category: f.category,
        cost: f.cost,
        residual: f.residual || null,
        acquiredOn: f.acquiredOn,
        lifeYears: f.lifeYears ? Number(f.lifeYears) : cat?.years,
        method: f.method,
        ratePct: f.method === "reducing_balance" ? Number(f.ratePct) : null,
        fromAccountId: f.fromAccountId,
      });
      onDone();
      toast.success(`${f.name.trim()} is on the register`, `Entry ${r.entryNo}: MVR ${f.cost} from ${r.paidFrom} into assets.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  const groups = { asset: "Paid from", liability: "Still owed to", expense: "Already recorded as a cost under" };

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="Add an asset" description="Something bought to be used for more than a year.">
      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What is it</span>
          <input id="asset-name" value={f.name} onChange={set("name")} placeholder="Yamaha 40hp outboard" className={FIELD} />
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Kind</span>
            <select id="asset-category" value={f.category} onChange={set("category")} className={FIELD}>
              {data.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Bought on</span>
            <input id="asset-date" type="date" value={f.acquiredOn} onChange={set("acquiredOn")} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Cost</span>
            <input id="asset-cost" value={f.cost} onChange={set("cost")} inputMode="decimal" placeholder="45,000.00" className={`${FIELD} tabular`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Worth at the end (optional)</span>
            <input id="asset-residual" value={f.residual} onChange={set("residual")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How it wears out</span>
          <select id="asset-method" value={f.method} onChange={set("method")} className={FIELD}>
            <option value="straight_line">The same amount every month (straight line)</option>
            <option value="reducing_balance">A share of what is left each year (reducing balance)</option>
          </select>
        </label>
        {f.method === "straight_line" ? (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Years it will be used</span>
            <input id="asset-life" value={f.lifeYears} onChange={set("lifeYears")} inputMode="decimal" placeholder={`${cat?.years || 5} is usual for this kind`} className={FIELD} />
          </label>
        ) : (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Share a year, in %</span>
            <input id="asset-rate" value={f.ratePct} onChange={set("ratePct")} inputMode="decimal" placeholder="25" className={FIELD} />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How it was paid for</span>
          <select id="asset-from" value={f.fromAccountId} onChange={set("fromAccountId")} className={FIELD}>
            <option value="">Pick one</option>
            {Object.entries(groups).map(([type, label]) => (
              <optgroup key={type} label={label}>
                {data.payFrom
                  .filter((a) => a.type === type)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">
            If its bill is already in the books as a cost, pick that cost: it moves out of this month's spending and onto the register.
          </span>
        </label>
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={save.isPending || !f.name.trim() || !f.cost || !f.fromAccountId}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Add {f.cost ? `MVR ${f.cost}` : "it"}
        </Button>
      </div>
    </Modal>
  );
}

function Dispose({ asset, payFrom, onClose, onDone }) {
  const toast = useToast();
  const [on, setOn] = useState(today());
  const [proceeds, setProceeds] = useState("");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/assets/${asset.id}/dispose`, body).then((r) => r.data) });
  const selling = Number(String(proceeds).replace(/,/g, "")) > 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ on, proceeds: selling ? proceeds : null, toAccountId: selling ? to : null });
      onDone();
      const said = r.gain === "0.00" ? "exactly what it was worth in the books" : `a ${r.loss ? "loss" : "gain"} of MVR ${r.gain}`;
      toast.success(`${asset.name} is off the register`, `It was worth MVR ${r.bookValue} in the books: ${said}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`${asset.name}: sold or scrapped`} description={`Worth MVR ${asset.bookValue} in the books today. It is charged up to the month before it went.`}>
      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">When it went</span>
          <input id="dispose-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What it was sold for (leave empty if scrapped)</span>
          <input id="dispose-proceeds" value={proceeds} onChange={(e) => setProceeds(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
        </label>
        {selling && (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Where the money went</span>
            <select id="dispose-to" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD}>
              <option value="">Pick one</option>
              {payFrom
                .filter((a) => a.type === "asset")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={go.isPending || (selling && !to)}>
          {go.isPending && <Loader2 size={14} className="animate-spin" />}
          {selling ? `Sold for MVR ${proceeds}` : "Scrapped"}
        </Button>
      </div>
    </Modal>
  );
}
