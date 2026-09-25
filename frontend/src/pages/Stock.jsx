import { useState } from "react";
import { Box, Camera, Loader2, Package, Plus, Wrench, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useSendOrKeep } from "@/context/OutboxContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";

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
  const [editing, setEditing] = useState(null); // {} to add, an item to change
  const [counting, setCounting] = useState(null);
  const [opening, setOpening] = useState(null);
  const [looking, setLooking] = useState(null);
  const [moving, setMoving] = useState(null);
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId],
    queryFn: () => apiClient.get("/stock").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const all = (data?.items || []).filter((i) => !i.archived);
  const list = all.filter(FILTERS.find(([k]) => k === filter)[2]);
  const counted = all.filter((i) => i.counted);
  const places = data?.places || [{ id: null, name: "Main store" }];
  const accounts = data?.accounts || { income: [], cost: [] };

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
          {counted.length > 0 && (filter === "all" || filter === "counted" || filter === "product") && <Places places={places} canAdd={can("record")} onDone={refresh} />}
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
                        {i.places && i.places.some((p) => p.id) && <span className="block text-[12px] text-[var(--ink-muted)] whitespace-nowrap">{i.places.map((p) => `${p.name} ${p.onHand}`).join(" · ")}</span>}
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
                  <div className="col-span-2 xl:col-span-1 flex gap-2 xl:justify-end">
                    {can("record") && (
                      <>
                        {i.counted && n(i.onHand) === 0 && n(i.sold) === 0 && (
                          <Button variant="outline" size="sm" onClick={() => setOpening(i)}>
                            Already had some
                          </Button>
                        )}
                        {i.counted && (
                          <Button variant="outline" size="sm" onClick={() => setCounting(i)}>
                            Count
                          </Button>
                        )}
                        {i.counted && places.length > 1 && n(i.onHand) > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => setMoving(i)}>
                            Move
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>
                          Change
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

      {editing && <ItemForm item={editing.id ? editing : null} items={all} accounts={accounts} onClose={() => setEditing(null)} onDone={refresh} />}
      {counting && <Count item={counting} places={places} onClose={() => setCounting(null)} onDone={refresh} />}
      {moving && <Move item={moving} places={places} onClose={() => setMoving(null)} onDone={refresh} />}
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
            <input id="item-unit" value={f.unit} onChange={set("unit")} placeholder={service ? "hour" : "bag"} className={FIELD} />
          </Field>
          <Field label="Code (optional)">
            <input id="item-code" value={f.code} onChange={set("code")} placeholder={service ? "HIRE-EX" : "CEM-50"} className={FIELD} />
          </Field>
        </div>
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

/** Where stock is kept: the main store and any places named, and naming one more. */
function Places({ places, canAdd, onDone }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.post("/stock/places", { name });
      toast.success(`${name.trim()} added`, "Move stock there from any item, and count it there.");
      setName("");
      onDone();
    } catch (ex) {
      toast.error("Not added", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="stock-places">
      <span className="text-[13px] text-[var(--ink-muted)] mr-1">Kept at</span>
      {places.map((p) => (
        <span key={p.id || "main"} className="h-9 px-3.5 inline-flex items-center rounded-full bg-[var(--surface)] lift text-[13px] font-medium">
          {p.name}
        </span>
      ))}
      {canAdd && (
        <form onSubmit={add} className="inline-flex items-center gap-1.5">
          <input aria-label="A new place" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a place, like the yard" className="h-9 px-3.5 w-52 max-w-full rounded-full border border-[var(--border)] bg-[var(--surface)] text-[13px] outline-none focus:border-[var(--ink)]" />
          {name.trim().length >= 2 && (
            <Button size="sm" variant="outline" disabled={busy} type="submit">
              Add
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

/** Taking stock from one place to another. Nothing is posted: only where it is changes. */
function Move({ item, places, onClose, onDone }) {
  const toast = useToast();
  const held = (id) => (item.places ? item.places.find((p) => p.id === id)?.onHand || "0" : id === null ? item.onHand : "0");
  const [from, setFrom] = useState(places.find((p) => n(held(p.id)) > 0)?.id || "");
  const [to, setTo] = useState(places.find((p) => (p.id || "") !== (places.find((x) => n(held(x.id)) > 0)?.id || ""))?.id || "");
  const [quantity, setQuantity] = useState("");
  const [on, setOn] = useState(today());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post(`/stock/${item.id}/transfer`, { fromPlaceId: from || null, toPlaceId: to || null, quantity, on });
      toast.success(`${r.data.moved} ${item.unit} of ${item.name} moved`, `From ${r.data.from} to ${r.data.to}. Its value is unchanged.`);
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
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={`Move ${item.name}`} description="From one place to another. What it is worth does not change, so nothing goes into the books.">
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
          <Field label="Moved on">
            <input id="move-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
          </Field>
        </div>
        {err && <p role="alert" className="text-[14px] text-[var(--danger)]">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" disabled={busy || !quantity.trim() || (from || "") === (to || "")}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Move it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
