import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useSendOrKeep } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";

/**
 * Stock: the things bought to be sold. What is on hand, what it cost on
 * average, what it is worth, and what the sales of each have earned over their
 * cost. Buying it happens on a bill and selling it on an invoice; this page
 * adds items, counts them, and takes in stock that was there before Sentryfi.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

const n = (s) => Number(String(s ?? "").replace(/,/g, ""));
const sum = (list, k) => list.reduce((a, i) => a + n(i[k]), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useRefresh() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return () => {
    for (const k of ["stock", "figures", "attention", "statements"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };
}

export default function Stock() {
  const { companyId, can } = useCompany();
  const refresh = useRefresh();
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState(null);
  const [opening, setOpening] = useState(null);
  const [looking, setLooking] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId],
    queryFn: () => apiClient.get("/stock").then((r) => r.data.items),
    enabled: Boolean(companyId),
  });
  const list = (data || []).filter((i) => !i.archived);

  return (
    <div>
      <PageHeader
        title="Stock"
        description="What you buy to sell: how much is on hand, what it cost, and what each item earns."
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add an item
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : list.length === 0 ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No items yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Cement, tiles, fuel you resell, spare parts: anything you buy and then sell. Add an item, then say which bills brought it in and
            which invoice lines sold it. Sentryfi keeps count, works out what each one cost on average, and shows what every sale earned
            over that cost.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
            <Card padding="md">
              <div className="text-[13px] text-[var(--ink-muted)]">Worth on hand</div>
              <div className="text-[20px] font-semibold mt-0.5" data-testid="stock-total">
                <Money amount={sum(list, "value")} />
              </div>
            </Card>
            <Card padding="md">
              <div className="text-[13px] text-[var(--ink-muted)]">Earned over cost</div>
              <div className="text-[20px] font-semibold mt-0.5">
                <Money amount={sum(list, "margin")} />
              </div>
            </Card>
          </div>
          <Card padding="none" className="overflow-hidden">
            <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_110px_120px_130px_130px_auto] gap-4 px-5 py-3 border-b border-[var(--border)] font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <span>Item</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Average cost</span>
              <span className="text-right">Worth</span>
              <span className="text-right">Earned over cost</span>
              <span />
            </div>
            <div className="divide-y divide-[var(--border)]">
              {list.map((i) => (
                <div
                  key={i.id}
                  data-testid="stock-row"
                  className="grid grid-cols-2 md:grid-cols-[minmax(0,1.6fr)_110px_120px_130px_130px_auto] gap-x-4 gap-y-1 px-5 py-4 items-center"
                >
                  <button type="button" onClick={() => setLooking(i)} className="min-w-0 col-span-2 md:col-span-1 text-left">
                    <div className="text-[15px] font-semibold truncate hover:underline">{i.name}</div>
                    <div className="text-[13px] text-[var(--ink-muted)] truncate">
                      {i.code ? `${i.code} · ` : ""}
                      {i.salePrice ? `sells at MVR ${i.salePrice} a ${i.unit}` : `by the ${i.unit}`}
                    </div>
                  </button>
                  <div className="text-[14px] md:text-right tabular">
                    {i.onHand} <span className="text-[var(--ink-muted)]">{i.unit}</span>
                    {i.low && <span className="ml-1.5 inline-block rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-semibold px-2 py-0.5">Low</span>}
                  </div>
                  <div className="text-[14px] text-right text-[var(--ink-muted)]">
                    <span className="md:hidden text-[12px] mr-1.5">average</span>
                    {i.averageCost ? <Money amount={i.averageCost} /> : "—"}
                  </div>
                  <div className="text-[15px] font-semibold md:text-right">
                    <span className="md:hidden text-[12px] font-normal text-[var(--ink-muted)] mr-1.5">worth</span>
                    <Money amount={i.value} />
                  </div>
                  <div className="text-[14px] text-right">
                    {n(i.sales) > 0 ? (
                      <>
                        <span className="md:hidden text-[12px] text-[var(--ink-muted)] mr-1.5">earned</span>
                        <Money amount={i.margin} />
                        <span className="block text-[12px] text-[var(--ink-muted)]">{i.marginPercent}% of sales</span>
                      </>
                    ) : (
                      <span className="text-[var(--ink-muted)]">Not sold yet</span>
                    )}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex gap-2 md:justify-end">
                    {can("record") && (
                      <>
                        {n(i.onHand) === 0 && n(i.sold) === 0 && (
                          <Button variant="outline" size="sm" onClick={() => setOpening(i)}>
                            Already had some
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setCounting(i)}>
                          Count
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {adding && <AddItem onClose={() => setAdding(false)} onDone={refresh} />}
      {counting && <Count item={counting} onClose={() => setCounting(null)} onDone={refresh} />}
      {opening && <Opening item={opening} onClose={() => setOpening(null)} onDone={refresh} />}
      {looking && <History item={looking} onClose={() => setLooking(null)} />}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{hint}</span>}
    </label>
  );
}

function Failure({ err }) {
  return err ? (
    <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
      {err}
    </p>
  ) : null;
}

function Actions({ onClose, busy, disabled, children }) {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" variant="accent" disabled={busy || disabled}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        {children}
      </Button>
    </div>
  );
}

function AddItem({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", code: "", unit: "each", salePrice: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({ mutationFn: (body) => apiClient.post("/stock", body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await save.mutateAsync({ name: f.name, code: f.code || null, unit: f.unit || "each", salePrice: f.salePrice || null });
      onDone();
      toast.success(`${f.name.trim()} added`, "Say which bills bring it in, and pick it on invoice lines that sell it.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="Add an item" description="Something you buy and then sell.">
      <div className="grid gap-4">
        <Field label="What is it">
          <input id="item-name" value={f.name} onChange={set("name")} placeholder="Cement, 50 kg bag" className={FIELD} />
        </Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Counted by">
            <input id="item-unit" value={f.unit} onChange={set("unit")} placeholder="bag" className={FIELD} />
          </Field>
          <Field label="Code (optional)">
            <input id="item-code" value={f.code} onChange={set("code")} placeholder="CEM-50" className={FIELD} />
          </Field>
          <Field label="Sells at (optional)">
            <input id="item-price" value={f.salePrice} onChange={set("salePrice")} inputMode="decimal" placeholder="120.00" className={`${FIELD} tabular`} />
          </Field>
        </div>
      </div>
      <Failure err={err} />
      <Actions onClose={onClose} busy={save.isPending} disabled={!f.name.trim()}>
        Add it
      </Actions>
    </Modal>
  );
}

function Count({ item, onClose, onDone }) {
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const [on, setOn] = useState(today());
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  // Counted in the store, often with no signal: kept on the phone until there is.
  const go = useSendOrKeep((body) => ({ url: `/stock/${item.id}/count`, body, label: `Counted ${body.counted} ${item.unit} of ${item.name}` }));
  const noneOnHand = n(item.onHand) === 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ counted, on, unitCost: unitCost || null, note: note || null });
      if (r.queued) {
        toast.success("Kept on this phone", "The count goes into the books by itself when there is signal.");
        return onClose();
      }
      onDone();
      const d = n(r.difference);
      toast.success(`${item.name}: ${counted} ${item.unit}`, `${d < 0 ? `${-d} short` : `${d} more than the books said`}. Entry ${r.entryNo}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`Count ${item.name}`} description={`The books say ${item.onHand} ${item.unit}. Enter what is really there.`}>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Counted, in ${item.unit}`}>
            <input id="count-qty" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder={item.onHand} className={`${FIELD} tabular`} />
          </Field>
          <Field label="Counted on">
            <input id="count-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </Field>
        </div>
        {noneOnHand && (
          <Field label={`What one ${item.unit} cost`} hint="None is on hand, so there is no average to use.">
            <input id="count-cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          </Field>
        )}
        <Field label="Why it differs (optional)">
          <input id="count-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Two bags split in the rain" className={FIELD} />
        </Field>
        <p className="text-[13px] text-[var(--ink-muted)]">
          A difference is recorded at the average cost, on its own line in the profit and loss, so losses are seen rather than hidden.
        </p>
      </div>
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={counted === ""}>
        Record the count
      </Actions>
    </Modal>
  );
}

function Opening({ item, onClose, onDone }) {
  const toast = useToast();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [on, setOn] = useState(today());
  const [err, setErr] = useState("");
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/stock/${item.id}/opening`, body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ quantity, unitCost, on });
      onDone();
      toast.success(`${quantity} ${item.unit} of ${item.name} on hand`, `Entry ${r.entryNo}, against opening balances.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={`${item.name} you already had`}
      description="Stock that was there before you started with Sentryfi, at what it cost you."
    >
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label={`How many ${item.unit}`}>
          <input id="opening-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
        </Field>
        <Field label={`Cost of one ${item.unit}`}>
          <input id="opening-cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
        </Field>
        <Field label="As at">
          <input id="opening-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
        </Field>
      </div>
      <p className="text-[13px] text-[var(--ink-muted)] mt-4">It goes against opening balances, for your accountant to settle with the rest of them.</p>
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={!quantity || !unitCost}>
        Add to stock
      </Actions>
    </Modal>
  );
}

const KIND = { bought: "Bought", sold: "Sold", counted: "Counted", opening: "Already had", undone: "Bill reversed", landed: "Landing costs", returned: "Came back", recosted: "Re-costed" };

function History({ item, onClose }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [reorder, setReorder] = useState(item.reorderAt || "");
  async function saveReorder() {
    try {
      await apiClient.patch(`/stock/${item.id}`, { reorderAt: reorder.trim() === "" ? null : reorder.trim() });
      qc.invalidateQueries({ queryKey: ["stock", companyId] });
      qc.invalidateQueries({ queryKey: ["attention", companyId] });
      toast.success(reorder.trim() ? `Reorder at ${reorder.trim()} ${item.unit}` : "No reorder level", reorder.trim() ? "Needs you says so when it gets there." : "It will not be flagged as running low.");
    } catch (err) {
      toast.error("Not saved", err.message);
    }
  }
  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId, item.id],
    queryFn: () => apiClient.get(`/stock/${item.id}/history`).then((r) => r.data.moves),
  });
  return (
    <Modal open onClose={onClose} title={item.name} description={`${item.onHand} ${item.unit} on hand, worth MVR ${item.value}.`}>
      {can("record") && (
        <div className="mb-4 flex items-end gap-2" data-testid="reorder">
          <label className="flex-1">
            <span className="block text-[13px] font-medium mb-1.5">Reorder when down to</span>
            <input value={reorder} onChange={(e) => setReorder(e.target.value)} inputMode="decimal" placeholder={`how many ${item.unit}`} className={`${FIELD} tabular`} />
          </label>
          <Button type="button" variant="outline" onClick={saveReorder}>
            Save
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data?.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">Nothing has moved yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] -mx-1">
          {data.map((m, k) => (
            <li key={k} className="py-2.5 px-1 flex items-baseline gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px]">
                  {KIND[m.kind]}{m.quantity === "0" ? "" : ` ${m.quantity.replace("-", "")} ${item.unit}`}
                  {m.document ? ` · ${m.document}` : ""}
                </div>
                <div className="text-[12px] text-[var(--ink-muted)]">
                  {formatDate(m.on)} · entry {m.entryNo}
                  {m.saleNet ? ` · sold for MVR ${m.saleNet}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                </div>
              </div>
              <div className="text-[14px] tabular">
                <Money amount={m.value} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
