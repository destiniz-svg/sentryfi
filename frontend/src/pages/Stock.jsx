import { useState } from "react";
import { Box, Camera, Loader2, Package, Plus, Truck, Wrench, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { UnitInput } from "@/components/ui/UnitInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useSendOrKeep } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import Arrivals from "@/pages/phone/Arrivals";

/**
 * Items: everything a company buys or sells, in one list. A product is a
 * thing; a service is work or time. A product can be counted, and then it is
 * stock: what is on hand, what it cost on average, what it is worth, and what
 * each sale earned over its cost. Everything else is bought and sold by name
 * and price, each on its own income and cost account. Buying happens on a
 * bill and selling on an invoice; this page adds and changes items, counts
 * them, and takes in stock that was there before Sentryfi.
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

const FILTERS = [
  ["all", "Everything", () => true],
  ["product", "Products", (i) => i.kind === "product"],
  ["service", "Services", (i) => i.kind === "service"],
  ["counted", "Counted stock", (i) => i.counted],
];

// What an item is, in a few words: the second line under its name.
function about(i) {
  const what = i.kind === "service" ? "Service" : i.kind === "bundle" ? `Bundle of ${i.parts?.length || 0}` : i.counted ? "Counted" : "Product, not counted";
  const prices = [i.sells && i.salePrice && `sells at MVR ${i.salePrice} a ${i.unit}`, i.buys && i.buyPrice && `buys at MVR ${i.buyPrice}`].filter(Boolean);
  return [i.code, what, ...prices].filter(Boolean).join(" · ");
}

export default function Stock() {
  const { companyId, can } = useCompany();
  const refresh = useRefresh();
  // {} to add, an item to change. ?new=1 is a Record shortcut: the form opens at once.
  const [editing, setEditing] = useState(() => (new URLSearchParams(window.location.search).get("new") === "1" ? {} : null));
  const [counting, setCounting] = useState(null);
  const [opening, setOpening] = useState(null);
  const [looking, setLooking] = useState(null);
  const [moving, setMoving] = useState(null);
  const [using, setUsing] = useState(null);
  const [lowering, setLowering] = useState(null);
  const [arriving, setArriving] = useState(null);
  const [filter, setFilter] = useState("all");

  // Someone who receives goods but never reads the books (procurement, site
  // staff) sees only what is on the way, to say it arrived.
  const reads = can("read");
  const receives = can("record") || can("receive") || can("capture");
  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId],
    queryFn: () => apiClient.get("/stock").then((r) => r.data),
    enabled: Boolean(companyId) && reads,
  });
  const all = (data?.items || []).filter((i) => !i.archived);
  const list = all.filter(FILTERS.find(([k]) => k === filter)[2]);
  const counted = all.filter((i) => i.counted);
  const places = data?.places || [{ id: null, name: "Main store" }];
  const accounts = data?.accounts || { income: [], cost: [] };

  // On the field board: goods on the way, and nothing else.
  if (!reads) return <Arrivals />;

  return (
    <div>
      <PageHeader
        title="Items"
        description="What you buy and sell: products, counted as stock or not, and services."
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setEditing({})}>
              <Plus size={16} /> Add an item
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : all.length === 0 ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No items yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Anything you buy or sell more than once. Cement and spare parts you keep count of; an excavator hire by the day or a site
            visit by the job. Save it once, then pick it on invoices and bills: its price fills in and it goes to its own account.
          </p>
        </Card>
      ) : (
        <>
          {counted.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
              <Card padding="md">
                <div className="text-[13px] text-[var(--ink-muted)]">Stock worth on hand</div>
                <div className="text-[20px] font-semibold mt-0.5" data-testid="stock-total">
                  <Money amount={sum(counted, "value")} />
                </div>
              </Card>
              <Card padding="md">
                <div className="text-[13px] text-[var(--ink-muted)]">Earned over cost</div>
                <div className="text-[20px] font-semibold mt-0.5">
                  <Money amount={sum(counted, "margin")} />
                </div>
              </Card>
            </div>
          )}
          <Tabs value={filter} onValueChange={setFilter} className="mb-4">
            <TabsList>
              {FILTERS.map(([k, label]) => (
                <TabsTrigger key={k} value={k}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {counted.length > 0 && (filter === "all" || filter === "counted" || filter === "product") && <Places places={places} people={data?.people || []} projects={data?.projects || []} canAdd={can("record")} onDone={refresh} />}
          {data?.onTheWay?.length > 0 && <OnTheWay list={data.onTheWay} canReceive={receives} onArrive={setArriving} />}
          <Card padding="none" className="overflow-hidden">
            <div className="hidden xl:grid grid-cols-[minmax(0,1.6fr)_110px_120px_130px_130px_230px] gap-4 px-5 py-3 border-b border-[var(--border)] text-[12px] font-medium text-[var(--ink-muted)]">
              <span>Item</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Average cost</span>
              <span className="text-right">Worth</span>
              <span className="text-right">Earned over cost</span>
              <span />
            </div>
            {list.length === 0 && <p className="px-5 py-6 text-[14px] text-[var(--ink-muted)]">None of these yet.</p>}
            <div className="divide-y divide-[var(--border)]">
              {list.map((i) => (
                <div
                  key={i.id}
                  data-testid="stock-row"
                  className="grid grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_110px_120px_130px_130px_230px] gap-x-4 gap-y-1 px-5 py-4 items-center"
                >
                  <button type="button" onClick={() => (i.counted ? setLooking(i) : can("record") && setEditing(i))} className="min-w-0 col-span-2 xl:col-span-1 text-left flex items-start gap-3">
                    {i.photo ? (
                      <img src={i.photo} alt="" className="mt-0.5 h-10 w-10 shrink-0 rounded-xl object-cover bg-[var(--surface-2)]" />
                    ) : (
                      <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                        {i.kind === "service" ? <Wrench size={15} /> : i.kind === "bundle" ? <Package size={15} /> : <Box size={15} />}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate hover:underline">{i.name}</span>
                      <span className="block text-[13px] text-[var(--ink-muted)] truncate">{about(i)}</span>
                    </span>
                  </button>
                  {i.counted ? (
                    <>
                      <div className="text-[14px] xl:text-right tabular">
                        {i.onHand} <span className="text-[var(--ink-muted)]">{i.unit}</span>
                        {i.onHandPacks && <span className="block text-[12px] text-[var(--ink-muted)]">= {i.onHandPacks}</span>}
                        {(n(i.reserved) > 0 || n(i.onOrder) > 0) && (
                          <span className="block text-[12px] text-[var(--ink-muted)]" data-testid="promised">
                            {[n(i.reserved) > 0 && `${i.reserved} promised`, n(i.onOrder) > 0 && `${i.onOrder} on order`, `${i.available} free`].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {i.nextBatch && (
                          <span className="block text-[12px] text-[var(--ink-muted)]" data-testid="next-batch">
                            Next out: {i.nextBatch.code}
                            {i.nextBatch.expiresOn ? `, expires ${formatDate(i.nextBatch.expiresOn)}` : ""}
                          </span>
                        )}
                        {i.places && i.places.some((p) => p.id) && <span className="block text-[12px] text-[var(--ink-muted)] break-words">{i.places.map((p) => `${p.name} ${p.onHand}`).join(" · ")}</span>}
                        {n(i.inTransit) > 0 && <span className="block text-[12px] text-[var(--ink-muted)] whitespace-nowrap">{i.inTransit} on the way</span>}
                        {i.low && <span className="ml-1.5 inline-block rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-semibold px-2 py-0.5">Low</span>}
                      </div>
                      <div className="text-[14px] text-right text-[var(--ink-muted)]">
                        <span className="xl:hidden text-[12px] mr-1.5">average</span>
                        {i.averageCost ? <Money amount={i.averageCost} /> : "—"}
                      </div>
                      <div className="text-[15px] font-semibold xl:text-right">
                        <span className="xl:hidden text-[12px] font-normal text-[var(--ink-muted)] mr-1.5">worth</span>
                        <Money amount={i.value} />
                      </div>
                      <div className="text-[14px] text-right">
                        {n(i.sales) > 0 ? (
                          <>
                            <span className="xl:hidden text-[12px] text-[var(--ink-muted)] mr-1.5">earned</span>
                            <Money amount={i.margin} />
                            <span className="block text-[12px] text-[var(--ink-muted)]">{i.marginPercent}% of sales</span>
                          </>
                        ) : (
                          <span className="text-[var(--ink-muted)]">Not sold yet</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="hidden xl:block xl:col-span-4 text-[13px] text-[var(--ink-muted)] text-right">
                      {i.sells && i.buys ? "Bought and sold" : i.sells ? "Sold" : "Bought"}, not counted
                    </div>
                  )}
                  <div className="col-span-2 xl:col-span-1 flex flex-wrap gap-2 xl:justify-end">
                    {can("record") && (
                      <>
                        {i.counted && n(i.onHand) === 0 && n(i.sold) === 0 && (
                          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setOpening(i)}>
                            Already had some
                          </Button>
                        )}
                        {i.counted && (
                          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setCounting(i)}>
                            Count
                          </Button>
                        )}
                        {i.counted && places.length > 1 && n(i.onHand) > 0 && (
                          <Button variant="ghost" size="sm" className="h-11 md:h-8" onClick={() => setMoving(i)}>
                            Move
                          </Button>
                        )}
                        {i.counted && n(i.onHand) - n(i.inTransit) > 0 && (
                          <Button variant="ghost" size="sm" className="h-11 md:h-8" onClick={() => setUsing(i)}>
                            Use on a job
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-11 md:h-8" onClick={() => setEditing(i)}>
                          Change
                        </Button>
                      </>
                    )}
                    {can("approve") && i.counted && n(i.onHand) > 0 && (
                      <Button variant="ghost" size="sm" className="h-11 md:h-8" onClick={() => setLowering(i)}>
                        Worth less
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {editing && <ItemForm item={editing.id ? editing : null} items={all} accounts={accounts} onClose={() => setEditing(null)} onDone={refresh} />}
      {counting && <Count item={counting} places={places} onClose={() => setCounting(null)} onDone={refresh} />}
      {moving && <Move item={moving} places={places} onClose={() => setMoving(null)} onDone={refresh} />}
      {using && <Use item={using} places={places} projects={data?.projects || []} departments={data?.departments || []} onClose={() => setUsing(null)} onDone={refresh} />}
      {arriving && <Arrive sent={arriving} onClose={() => setArriving(null)} onDone={refresh} />}
      {opening && <Opening item={opening} onClose={() => setOpening(null)} onDone={refresh} />}
      {lowering && <WorthLess item={lowering} onClose={() => setLowering(null)} onDone={refresh} />}
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

/** A pair of large choices, one of which is picked. */
function Choice({ name, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid sm:grid-cols-2 gap-2">
      {options.map(([v, title, line, Icon]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`text-left rounded-2xl border p-3.5 flex items-start gap-3 transition-colors ${value === v ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)] hover:border-[var(--ink-muted)]"}`}
        >
          {Icon && (
            <span className={`h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center ${value === v ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"}`} aria-hidden="true">
              <Icon size={16} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">{title}</span>
            <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5">{line}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A switched section: ticked, its fields show. */
function Side({ label, on, onChange, children }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] p-3.5">
      <label className="flex items-center gap-2.5 text-[15px] font-semibold cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
        {label}
      </label>
      {on && <div className="grid sm:grid-cols-2 gap-4 mt-3">{children}</div>}
    </div>
  );
}

const money = (v) => (v ? String(v).replace(/,/g, "") : "");

/** Adding an item, or changing one: what it is, whether it is counted, and how it is sold and bought. */
/** A photograph made small on the phone: at most 320px across, as a JPEG, before it is sent. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("That picture could not be read."));
    img.src = URL.createObjectURL(file);
  });
}

function ItemForm({ item, items = [], accounts, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    kind: item?.kind || "product",
    counted: item ? item.counted : true,
    name: item?.name || "",
    code: item?.code || "",
    unit: item?.unit || "each",
    sells: item ? item.sells : true,
    salePrice: money(item?.salePrice),
    incomeAccountId: item?.incomeAccountId || "",
    buys: item ? item.buys : true,
    buyPrice: money(item?.buyPrice),
    costAccountId: item?.costAccountId || "",
    parts: item?.parts?.length ? item.parts.map((p) => ({ ...p })) : [{ itemId: "", quantity: "1" }],
    photo: item?.photo || null,
    tax: item?.tax || "",
    packUnit: item?.packUnit || "",
    packSize: item?.packSize || "",
    batches: Boolean(item?.batches),
    billControl: item?.billControl || "",
  }));
  const [err, setErr] = useState("");
  const put = (patch) => setF((x) => ({ ...x, ...patch }));
  const set = (k) => (e) => put({ [k]: e.target.value });
  const save = useMutation({
    mutationFn: (body) => (item ? apiClient.patch(`/stock/${item.id}`, body) : apiClient.post("/stock", body)).then((r) => r.data),
  });
  const service = f.kind === "service";
  const bundle = f.kind === "bundle";
  const partChoices = items.filter((x) => x.kind !== "bundle" && x.id !== item?.id);
  const stockHeld = item?.counted && n(item.onHand) !== 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await save.mutateAsync({
        kind: f.kind,
        counted: !service && f.counted,
        name: f.name,
        code: f.code || null,
        unit: f.unit || "each",
        sells: f.sells,
        salePrice: f.sells ? f.salePrice || null : null,
        incomeAccountId: f.sells ? f.incomeAccountId || null : null,
        buys: f.buys,
        buyPrice: f.buys ? f.buyPrice || null : null,
        costAccountId: f.buys && (service || !f.counted) ? f.costAccountId || null : null,
        photo: f.photo,
        ...(f.kind === "product" ? { packUnit: f.packUnit.trim() || null, packSize: f.packUnit.trim() ? f.packSize.trim() || null : null } : {}),
        batches: f.kind === "product" && f.counted && f.batches,
        billControl: f.buys ? f.billControl || null : null,
        // Sent only when picked, so saving does not turn a suggestion into your answer.
        ...(f.taxPicked ? { tax: f.tax || null } : {}),
        ...(bundle ? { parts: f.parts.filter((p) => p.itemId && Number(p.quantity) > 0) } : {}),
      });
      onDone();
      toast.success(item ? `${f.name.trim()} changed` : `${f.name.trim()} added`, f.sells ? "Pick it on invoice lines, and its price and account fill in." : "Pick it on bills and orders.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={item ? `Change ${item.name}` : "Add an item"} description="Anything you buy or sell more than once." size="lg">
      <div className="grid gap-4">
        <Choice
          name="What is it"
          value={f.kind}
          onChange={(kind) => put({ kind, unit: f.unit === "each" || f.unit === "hour" ? (kind === "service" ? "hour" : "each") : f.unit })}
          options={[
            ["product", "A product", "A thing you buy or sell", Box],
            ["service", "A service", "Work or time you charge or pay for", Wrench],
            ["bundle", "A bundle", "Several items sold together as one", Package],
          ]}
        />
        <div className="flex items-center gap-3">
          {f.photo ? <img src={f.photo} alt="" className="h-16 w-16 rounded-2xl object-cover bg-[var(--surface-2)]" /> : <span className="h-16 w-16 rounded-2xl bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true"><Camera size={20} /></span>}
          <label className="h-10 px-4 rounded-full border border-[var(--border)] text-[14px] font-medium inline-flex items-center gap-2 cursor-pointer hover:bg-[var(--surface-2)]">
            {f.photo ? "Change the photo" : "Add a photo"}
            <input type="file" accept="image/*" className="sr-only" aria-label="Photo of the item" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) { try { put({ photo: await shrink(file) }); } catch (ex) { setErr(ex.message); } } }} />
          </label>
          {f.photo && (
            <button type="button" onClick={() => put({ photo: null })} aria-label="Remove the photo" className="h-10 w-10 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_140px_140px] gap-4">
          <Field label="Name">
            <input id="item-name" value={f.name} onChange={set("name")} placeholder={service ? "Excavator hire, with operator" : "Cement, 50 kg bag"} className={FIELD} />
          </Field>
          <Field label={service ? "Charged by" : "Counted by"}>
            <UnitInput id="item-unit" value={f.unit} onChange={(unit) => put({ unit })} placeholder={service ? "hour" : "bag"} className={FIELD} />
          </Field>
          <Field label="Code (optional)">
            <input id="item-code" value={f.code} onChange={set("code")} placeholder={service ? "HIRE-EX" : "CEM-50"} className={FIELD} />
          </Field>
        </div>
        {f.kind === "product" && (
          <div className="grid sm:grid-cols-[minmax(0,1fr)_140px] gap-4">
            <Field label="Also comes in (optional)" hint={f.packUnit.trim() && f.packSize.trim() ? `1 ${f.packUnit.trim()} = ${f.packSize.trim()} ${f.unit || "each"}. Stock is kept in ${f.unit || "each"}; bills, invoices and counts can say either.` : `A box, a carton or a pallet of ${f.unit || "each"}.`}>
              <UnitInput id="item-pack-unit" value={f.packUnit} onChange={(packUnit) => put({ packUnit })} placeholder="box" className={FIELD} />
            </Field>
            <Field label={`${f.unit || "each"} in one`}>
              <input id="item-pack-size" value={f.packSize} onChange={set("packSize")} inputMode="decimal" placeholder="12" className={`${FIELD} tabular`} />
            </Field>
          </div>
        )}
        {bundle && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium mb-1.5">Made of</legend>
            {f.parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_auto] gap-2">
                <select aria-label={`Part ${i + 1}`} value={p.itemId} onChange={(e) => put({ parts: f.parts.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)) })} className={FIELD}>
                  <option value="">Choose an item</option>
                  {partChoices.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <input aria-label={`Part ${i + 1}: how many`} value={p.quantity} onChange={(e) => put({ parts: f.parts.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} inputMode="decimal" className={`${FIELD} tabular text-right`} />
                <button type="button" aria-label={`Remove part ${i + 1}`} onClick={() => put({ parts: f.parts.length === 1 ? [{ itemId: "", quantity: "1" }] : f.parts.filter((_, j) => j !== i) })} className="h-11 w-11 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
                  <X size={15} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => put({ parts: [...f.parts, { itemId: "", quantity: "1" }] })} className="justify-self-start text-[14px] font-medium text-[var(--deep)] underline underline-offset-4">
              Another item in it
            </button>
            <p className="text-[13px] text-[var(--ink-muted)]">Sold as one line at its own price; each item in it leaves stock at its own cost.</p>
          </fieldset>
        )}
        {!service && !bundle && (
          <div>
            <span className="text-sm font-medium block mb-1.5">Keep count of it?</span>
            <Choice
              name="Keep count of it"
              value={f.counted}
              onChange={(counted) => !stockHeld && put({ counted })}
              options={[
                [true, "Yes, keep stock", "How many are on hand, what they cost, what each sale earns"],
                [false, "No, just buy and sell it", "Bought for a job or sold on order, by name and price"],
              ]}
            />
            {stockHeld && <p className="text-[13px] text-[var(--ink-muted)] mt-1.5">{item.onHand} {item.unit} are on hand. Sell or count it down to nothing before you stop counting it.</p>}
            {f.counted && (
              <label className="flex items-start gap-2.5 text-[14px] cursor-pointer min-h-11 mt-3">
                <input id="item-batches" type="checkbox" checked={f.batches} onChange={(e) => put({ batches: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" />
                <span>
                  <span className="font-medium">Track batches and expiry</span>
                  <span className="block text-[13px] text-[var(--ink-muted)]">Each bill says which batch came in and when it expires. It goes out earliest to expire first, and the Stock page warns before it expires.</span>
                </span>
              </label>
            )}
          </div>
        )}
        <Side label="You sell it" on={f.sells} onChange={(sells) => put({ sells })}>
          <Field label="Price (optional)">
            <input id="item-price" value={f.salePrice} onChange={set("salePrice")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          </Field>
          <Field label="Income goes to">
            <select id="item-income" value={f.incomeAccountId} onChange={set("incomeAccountId")} className={FIELD}>
              <option value="">Your usual income</option>
              {accounts.income.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </Field>
        </Side>
        {!bundle && <Side label="You buy it" on={f.buys} onChange={(buys) => put({ buys })}>
          <Field label="Cost (optional)">
            <input id="item-buy-price" value={f.buyPrice} onChange={set("buyPrice")} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
          </Field>
          <Field label="Suppliers bill it for">
            <select id="item-bill-control" value={f.billControl} onChange={set("billControl")} className={FIELD}>
              <option value="">As the supplier is set</option>
              <option value="received">What arrived</option>
              <option value="ordered">What was ordered (paid ahead)</option>
            </select>
          </Field>
          {service || !f.counted ? (
            <Field label="Kind of cost">
              <select id="item-cost" value={f.costAccountId} onChange={set("costAccountId")} className={FIELD}>
                <option value="">Ask each time</option>
                {accounts.cost.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-[13px] text-[var(--ink-muted)] self-center">Goes into stock on hand, and into cost of sales as each one is sold.</p>
          )}
        </Side>}
        <div>
          <span className="text-sm font-medium block mb-1.5">GST on it</span>
          <Choice
            name="GST on it"
            value={f.tax}
            onChange={(tax) => put({ tax, taxPicked: true })}
            options={[
              ["standard", "Standard", "Charged at the usual rate"],
              ["zero_rated", "Zero-rated", "0%: rice, flour, fish, diesel, exports"],
              ["exempt", "Exempt", "Outside GST: rent, utilities, health"],
              ["", "Not sure", "Worked out from its name when it goes on a document"],
            ]}
          />
          {item?.taxBy === "ai" && !f.taxPicked && <p className="text-[13px] text-[var(--ink-muted)] mt-1.5">Suggested from its name{item.taxWhy ? `: ${item.taxWhy}` : "."} Pick one to make it yours.</p>}
        </div>
      </div>
      <Failure err={err} />
      <Actions onClose={onClose} busy={save.isPending} disabled={!f.name.trim() || (!f.sells && !f.buys)}>
        {item ? "Save" : "Add it"}
      </Actions>
    </Modal>
  );
}

function Count({ item, places = [{ id: null, name: "Main store" }], onClose, onDone }) {
  const toast = useToast();
  const [where, setWhere] = useState("");
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
      const r = await go.mutateAsync({ counted, on, unitCost: unitCost || null, note: note || null, placeId: where || null });
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
        {places.length > 1 && (
          <Field label="Counted at">
            <select id="count-place" value={where} onChange={(e) => setWhere(e.target.value)} className={FIELD}>
              {places.map((p) => (
                <option key={p.id || "main"} value={p.id || ""}>
                  {p.name}{item.places ? ` (the books say ${item.places.find((x) => x.id === p.id)?.onHand || "0"})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
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

/**
 * Stock worth less than it cost (damaged, expired, not selling): written down
 * to what one will fetch, less the cost of selling it. If that recovers while
 * it is still held, written back up, never above what it cost.
 */
function WorthLess({ item, onClose, onDone }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { data: w } = useQuery({ queryKey: ["worth", companyId, item.id], queryFn: () => apiClient.get(`/stock/${item.id}/worth`).then((r) => r.data) });
  const [unitWorth, setUnitWorth] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/stock/${item.id}/write-down`, body).then((r) => r.data) });
  const money = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const change = w && unitWorth.trim() !== "" ? n(unitWorth) * n(w.onHand) - n(w.value) : null;
  const up = change !== null && change > 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ unitWorth, reason });
      onDone();
      toast.success(
        r.down ? `${item.name} written down by MVR ${r.change}` : `${item.name} written back up by MVR ${r.change}`,
        `Entry ${r.entryNo}${r.capped ? ", as far as it was written down: never above what it cost" : ""}.`
      );
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`${item.name}: worth less than it cost?`} description="Damaged, expired or not selling: write it down to what one will fetch now, less what it costs to sell it.">
      {!w ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <>
          <p className="text-[14px] mb-4" data-testid="worth-now">
            {w.onHand} {item.unit} held at <span className="tabular font-medium">MVR {w.unitCost}</span> each, <span className="tabular font-medium">MVR {w.value}</span> in all.
            {n(w.writtenDown) > 0 && <span className="text-[var(--ink-muted)]"> MVR {w.writtenDown} of what it cost has been written down already.</span>}
          </p>
          <div className="grid gap-4">
            <Field label={`What one ${item.unit} will fetch now (MVR)`} hint="Its selling price, less what it costs to sell it.">
              <input id="worth-unit" value={unitWorth} onChange={(e) => setUnitWorth(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular sm:max-w-[200px]`} autoFocus />
            </Field>
            <Field label="Why">
              <input id="worth-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Water damage, expired, not sold in a year" className={FIELD} />
            </Field>
          </div>
          {change !== null && change !== 0 && (
            <p className="text-[14px] mt-4" data-testid="worth-change">
              {up
                ? n(w.writtenDown) > 0
                  ? `Writes it back up by MVR ${money(Math.min(change, n(w.writtenDown)))}, no further than it was written down.`
                  : "It is held at what it cost already. Stock is never written up above its cost."
                : `Writes it down by MVR ${money(-change)}, to Stock written down.`}
            </p>
          )}
        </>
      )}
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={!w || unitWorth.trim() === "" || reason.trim().length < 3 || change === 0 || (up && n(w.writtenDown) === 0)}>
        {up ? "Write it back up" : "Write it down"}
      </Actions>
    </Modal>
  );
}

function Opening({ item, onClose, onDone }) {
  const toast = useToast();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [on, setOn] = useState(today());
  const [batchCode, setBatchCode] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [err, setErr] = useState("");
  const go = useMutation({ mutationFn: (body) => apiClient.post(`/stock/${item.id}/opening`, body).then((r) => r.data) });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ quantity, unitCost, on, ...(item.batches ? { batchCode, expiresOn: expiresOn || null } : {}) });
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
      {item.batches && (
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Batch">
            <input id="opening-batch" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="As printed on it" className={FIELD} />
          </Field>
          <Field label="Expires on (if it does)">
            <input id="opening-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={FIELD} />
          </Field>
        </div>
      )}
      <p className="text-[13px] text-[var(--ink-muted)] mt-4">It goes against opening balances, for your accountant to settle with the rest of them.</p>
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={!quantity || !unitCost || (item.batches && !batchCode.trim())}>
        Add to stock
      </Actions>
    </Modal>
  );
}

const KIND = { bought: "Bought", sold: "Sold", counted: "Counted", opening: "Already had", undone: "Bill reversed", landed: "Landing costs", returned: "Came back", recosted: "Re-costed", written_down: "Written down" };

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
  const { data: held = [] } = useQuery({
    queryKey: ["stock", companyId, item.id, "batches"],
    queryFn: () => apiClient.get(`/stock/${item.id}/batches`).then((r) => r.data.batches),
    enabled: Boolean(item.batches),
  });
  // Thirty days from when the sheet opened: an expiry that close is shown in red.
  const [soon] = useState(() => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  return (
    <Modal open onClose={onClose} title={item.name} description={`${item.onHand} ${item.unit} on hand, worth MVR ${item.value}.`}>
      {item.batches && (
        <section className="mb-4" aria-labelledby="batches-h" data-testid="batches">
          <h3 id="batches-h" className="text-[13px] font-medium mb-1.5">
            Batches, earliest to expire first
          </h3>
          {held.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-muted)]">None held in a batch.</p>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
              {held.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-[14px]">
                  <span className="flex-1 min-w-0 font-medium break-words">{b.code}</span>
                  <span className="tabular">
                    {b.quantity} {item.unit}
                  </span>
                  <span className={`text-[13px] ${b.expiresOn && b.expiresOn <= soon ? "text-[var(--danger)] font-medium" : "text-[var(--ink-muted)]"}`}>{b.expiresOn ? formatDate(b.expiresOn) : "No expiry"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
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

const KINDS = [
  ["store", "Store"],
  ["godown", "Godown"],
  ["outlet", "Outlet"],
  ["site", "Site"],
  ["factory", "Factory"],
  ["vehicle", "Vehicle"],
];
const kindName = (k) => KINDS.find(([v]) => v === k)?.[1] || "Store";

/** Where stock is kept: the main store and any places named, each with its kind and who looks after it. */
function Places({ places, people, projects, canAdd, onDone }) {
  const [editing, setEditing] = useState(null); // a place, or {} for a new one
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="stock-places">
      <span className="text-[13px] text-[var(--ink-muted)] mr-1">Kept at</span>
      {places.map((p) => {
        const said = [p.id ? kindName(p.kind) : null, p.project, p.inCharge].filter(Boolean).join(" · ");
        const inner = (
          <>
            <span className="font-medium shrink-0">{p.name}</span>
            {said && <span className="text-[var(--ink-muted)] truncate min-w-0">{said}</span>}
          </>
        );
        const chip = "h-9 px-3.5 max-w-full inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--surface)] lift text-[13px]";
        return p.id && canAdd ? (
          <button key={p.id} type="button" onClick={() => setEditing(p)} aria-label={`Change ${p.name}`} className={`${chip} hover:bg-[var(--surface-2)]`}>
            {inner}
          </button>
        ) : (
          <span key={p.id || "main"} className={chip}>
            {inner}
          </span>
        );
      })}
      {canAdd && (
        <Button size="sm" variant="outline" type="button" onClick={() => setEditing({})}>
          <Plus size={14} />
          Add a place
        </Button>
      )}
      {editing && <PlaceForm place={editing} people={people} projects={projects} onClose={() => setEditing(null)} onDone={onDone} />}
    </div>
  );
}

/** Naming a place, or changing one: its kind, the person in charge, and for a site, its project. */
function PlaceForm({ place, people, projects, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(place.name || "");
  const [kind, setKind] = useState(place.kind || "store");
  const [inChargeId, setInChargeId] = useState(place.inChargeId || "");
  const [projectId, setProjectId] = useState(place.projectId || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const body = { name, kind, inChargeId: inChargeId || null, projectId: kind === "site" ? projectId || null : null };
    try {
      if (place.id) await apiClient.patch(`/stock/places/${place.id}`, body);
      else await apiClient.post("/stock/places", body);
      toast.success(place.id ? `${name.trim()} changed` : `${name.trim()} added`, place.id ? undefined : "Bills and deliveries can bring stock in here, and any item can be moved or counted here.");
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={place.id ? `Change ${place.name}` : "Add a place"} description="Somewhere stock is kept, apart from the main store.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input id="place-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The yard" className={FIELD} />
          </Field>
          <Field label="Kind">
            <select id="place-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
              {KINDS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Person in charge">
            <select id="place-person" value={inChargeId} onChange={(e) => setInChargeId(e.target.value)} className={FIELD}>
              <option value="">No one named</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {kind === "site" && (
            <Field label="Project">
              <select id="place-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD}>
                <option value="">Not tied to a project</option>
                {projects.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {err && <p role="alert" className="text-[14px] text-[var(--danger)]">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" disabled={busy || name.trim().length < 2}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {place.id ? "Save" : "Add it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Sending stock from one place to another. Nothing is posted: only where it is
 * changes. It is on the way until someone there says it arrived, unless it is
 * there already, like a move across the yard.
 */
function Move({ item, places, onClose, onDone }) {
  const toast = useToast();
  const held = (id) => (item.places ? item.places.find((p) => p.id === id)?.onHand || "0" : id === null ? item.onHand : "0");
  const [from, setFrom] = useState(places.find((p) => n(held(p.id)) > 0)?.id || "");
  const [to, setTo] = useState(places.find((p) => (p.id || "") !== (places.find((x) => n(held(x.id)) > 0)?.id || ""))?.id || "");
  const [quantity, setQuantity] = useState("");
  const [on, setOn] = useState(today());
  const [arrived, setArrived] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post(`/stock/${item.id}/transfer`, { fromPlaceId: from || null, toPlaceId: to || null, quantity, on, arrived });
      toast.success(
        r.data.onTheWay ? `${r.data.moved} ${item.unit} of ${item.name} on the way` : `${r.data.moved} ${item.unit} of ${item.name} moved`,
        r.data.onTheWay ? `To ${r.data.to}. Whoever is there says when it arrives, and what came.` : `From ${r.data.from} to ${r.data.to}. Its value is unchanged.`
      );
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  const option = (p) => (
    <option key={p.id || "main"} value={p.id || ""}>
      {p.name} ({held(p.id)} {item.unit})
    </option>
  );
  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`Send ${item.name}`} description="From one place to another. It is on the way until someone there says it arrived. What it is worth does not change.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="From">
            <select id="move-from" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD}>
              {places.map(option)}
            </select>
          </Field>
          <Field label="To">
            <select id="move-to" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD}>
              {places.map(option)}
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`How many, in ${item.unit}`}>
            <input id="move-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder={held(from || null)} className={`${FIELD} tabular`} />
          </Field>
          <Field label="Sent on">
            <input id="move-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-[14px] cursor-pointer min-h-11">
          <input id="move-arrived" type="checkbox" checked={arrived} onChange={(e) => setArrived(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" />
          <span>
            <span className="font-medium">It's there already</span>
            <span className="block text-[13px] text-[var(--ink-muted)]">Moved across the yard, or checked in as it came. Nobody needs to say it arrived.</span>
          </span>
        </label>
        {err && <p role="alert" className="text-[14px] text-[var(--danger)]">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" disabled={busy || !quantity.trim() || (from || "") === (to || "")}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {arrived ? "Move it" : "Send it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** What has been sent and not yet arrived, oldest first: one card each, with one thing to do. */
function OnTheWay({ list, canReceive, onArrive }) {
  return (
    <section className="mb-4" aria-labelledby="on-the-way" data-testid="on-the-way">
      <h2 id="on-the-way" className="text-[13px] font-medium text-[var(--ink-muted)] mb-2">
        On the way
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <Card key={t.id} padding="md" className="flex items-center gap-3" data-testid="on-the-way-card">
            <span className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
              <Truck size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug break-words">
                <span className="tabular">{t.quantity}</span> {t.unit} {t.item}
              </span>
              <span className="block text-[13px] text-[var(--ink-muted)] leading-snug break-words mt-0.5">
                {t.from} to <span className="text-[var(--ink)]">{t.to}</span>
              </span>
              <span className="block text-[12px] text-[var(--ink-muted)] leading-snug mt-0.5">
                Sent {formatDate(t.sentOn)}{t.sentBy ? ` by ${t.sentBy}` : ""}{t.note ? ` · ${t.note}` : ""}
              </span>
            </span>
            {canReceive && (
              <Button variant="accent" className="shrink-0" onClick={() => onArrive(t)}>
                It arrived
              </Button>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * Saying what came. All of it is the usual answer, so that is where it starts;
 * fewer asks why. Said on a jetty with no signal, it is kept on the phone.
 */
function Arrive({ sent, onClose, onDone }) {
  const toast = useToast();
  const [received, setReceived] = useState(sent.quantity);
  const [on, setOn] = useState(today() < sent.sentOn ? sent.sentOn : today());
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const go = useSendOrKeep((body) => ({ url: `/stock/transfers/${sent.id}/arrive`, body, label: `${body.received} ${sent.unit} of ${sent.item} arrived at ${sent.to}` }));
  const missing = n(sent.quantity) - n(received);
  const short = received.trim() !== "" && missing > 0;
  const over = missing < 0;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ received, on, reason: short ? reason : null });
      if (r.queued) {
        toast.success("Kept on this phone", "It is marked as arrived by itself when there is signal.");
        return onClose();
      }
      onDone();
      toast.success(
        `${r.received} ${sent.unit} of ${sent.item} at ${r.to}`,
        n(r.short) > 0 ? `${r.short} short, written off at average cost with your reason.` : "All of it came."
      );
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`${sent.item} arrived`} description={`${sent.quantity} ${sent.unit} were sent from ${sent.from} to ${sent.to} on ${formatDate(sent.sentOn)}.`}>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`How many came, in ${sent.unit}`} hint={over ? `Only ${sent.quantity} were sent. Count the extra at ${sent.to} instead.` : undefined}>
            <input id="arrive-qty" value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
          </Field>
          <Field label="Arrived on">
            <input id="arrive-on" type="date" value={on} min={sent.sentOn} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </Field>
        </div>
        {short && (
          <Field label={`Why ${missing} ${sent.unit} ${missing === 1 ? "is" : "are"} short`} hint="What is short is written off at average cost, on its own line, so a loss on the way is seen.">
            <input id="arrive-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One bag split on the jetty" className={FIELD} autoFocus />
          </Field>
        )}
      </div>
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={received.trim() === "" || over || (short && reason.trim().length < 3)}>
        {short ? "Record what came" : "All of it came"}
      </Actions>
    </Modal>
  );
}

/**
 * Stock used on a job: it leaves its place at average cost, and that cost is
 * carried to the project or department. A site tied to a project starts there.
 */
function Use({ item, places, projects, departments, onClose, onDone }) {
  const toast = useToast();
  const held = (id) => (item.places ? item.places.find((p) => p.id === id)?.onHand || "0" : id === null ? String(n(item.onHand) - n(item.inTransit)) : "0");
  const start = places.find((p) => n(held(p.id)) > 0) || places[0];
  const [from, setFrom] = useState(start.id || "");
  const [projectId, setProjectId] = useState(start.projectId || "");
  const [departmentId, setDepartmentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [on, setOn] = useState(today());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const go = useSendOrKeep((body) => ({ url: `/stock/${item.id}/issue`, body, label: `${body.quantity} ${item.unit} of ${item.name} used on a job` }));
  const cost = item.averageCost && n(quantity) > 0 ? (n(item.averageCost) * n(quantity)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  function pickPlace(id) {
    setFrom(id);
    const p = places.find((x) => (x.id || "") === id);
    if (p?.projectId) setProjectId(p.projectId);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await go.mutateAsync({ placeId: from || null, quantity, on, projectId: projectId || null, dimensionIds: departmentId ? [departmentId] : [], note: note || null });
      if (r.queued) {
        toast.success("Kept on this phone", "It goes into the books by itself when there is signal.");
        return onClose();
      }
      onDone();
      toast.success(`${quantity} ${item.unit} of ${item.name} used on ${r.usedOn}`, `Its cost is carried there. Entry ${r.entryNo}.`);
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`Use ${item.name} on a job`} description="It leaves stock at its average cost, and the job or department carries that cost.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {places.length > 1 && (
            <Field label="Taken from">
              <select id="use-from" value={from} onChange={(e) => pickPlace(e.target.value)} className={FIELD}>
                {places.map((p) => (
                  <option key={p.id || "main"} value={p.id || ""}>
                    {p.name} ({held(p.id)} {item.unit})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={`How many, in ${item.unit}`} hint={cost ? `About MVR ${cost} at average cost` : undefined}>
            <input id="use-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder={held(from || null)} className={`${FIELD} tabular`} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Project">
            <select id="use-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD}>
              <option value="">No project</option>
              {projects.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select id="use-department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={FIELD}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Used on">
            <input id="use-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </Field>
          <Field label="What for (optional)">
            <input id="use-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Slab pour, level 3" className={FIELD} />
          </Field>
        </div>
        {!projects.length && !departments.length && (
          <p className="text-[13px] text-[var(--ink-muted)]">Add a project or a department first, so the cost has somewhere to go.</p>
        )}
      </div>
      <Failure err={err} />
      <Actions onClose={onClose} busy={go.isPending} disabled={!quantity.trim() || (!projectId && !departmentId)}>
        Use it
      </Actions>
    </Modal>
  );
}
