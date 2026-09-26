import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate, today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { UnitInput } from "@/components/ui/UnitInput";

/**
 * Repeat billing: rent, a maintenance contract, equipment on long hire. Each
 * schedule raises its invoice when the date comes round, and can put it in
 * the books by itself. With kind "bill", the same for what the business pays
 * (rent, internet): each bill is drafted on its date for a person to post.
 */
export function RepeatBilling({ onClose, kind = "sale" }) {
  const bill = kind === "bill";
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: got } = useQuery({ queryKey: ["recurring", companyId, kind], queryFn: () => apiClient.get(`/recurring?kind=${kind}`).then((r) => r.data) });
  const data = got?.schedules;
  const refresh = () => {
    for (const k of ["recurring", "sales", "sales-aged", "bills", "figures", "attention"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };

  return (
    <Modal open onClose={onClose} title={bill ? "Repeating bills" : "Repeat billing"} description={bill ? "Bills drafted on their date, for you to check and put in the books." : "Invoices raised on a schedule, on their date, without anyone remembering to."}>
      {adding ? (
        <NewSchedule
          kind={kind}
          accounts={got?.accounts || []}
          onCancel={() => setAdding(false)}
          onDone={(r) => {
            refresh();
            setAdding(false);
            toast.success("Schedule saved", bill ? (r.raised.length ? `${r.raised.length} ${r.raised.length === 1 ? "bill was" : "bills were"} due already, and drafted.` : "The first bill is drafted on its date.") : r.raised.length ? `${r.raised.length} ${r.raised.length === 1 ? "invoice was" : "invoices were"} due already, and raised.` : "The first invoice is raised on its date.");
          }}
        />
      ) : (
        <>
          {!data ? (
            <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
          ) : data.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)]">{bill ? "No bill repeats yet." : "Nothing is billed on a schedule yet."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]" data-testid="schedules">
              {data.map((s) => (
                <li key={s.id} className="py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium truncate">{s.name}</div>
                    <div className="text-[13px] text-[var(--ink-muted)]">
                      {s.customer} · {s.everyText}
                      {s.finished ? " · finished" : s.paused ? " · paused" : ` · next ${formatDate(s.nextOn)}`} · {s.raised} raised
                      {s.postAutomatically ? " · goes in the books by itself" : ""}
                    </div>
                  </div>
                  <Money amount={s.each} className="text-[15px] font-semibold" />
                  {can("record") && !s.finished && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await apiClient.post(`/recurring/${s.id}/pause`, { paused: !s.paused });
                        refresh();
                      }}
                    >
                      {s.paused ? "Resume" : "Pause"}
                    </Button>
                  )}
                  {s.paused && <Badge tone="neutral">Paused</Badge>}
                </li>
              ))}
            </ul>
          )}
          {can("record") && (
            <Button variant="outline" className="mt-4" onClick={() => setAdding(true)}>
              <Plus size={15} /> New schedule
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}

function NewSchedule({ onCancel, onDone, kind, accounts }) {
  const bill = kind === "bill";
  const [f, setF] = useState({ accountId: "", customerName: "", name: "", every: "month", startsOn: today(), endsOn: "", gstTreatment: "exclusive", postAutomatically: false, description: "", unit: "month", unitPrice: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save() {
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post("/recurring", {
        kind,
        customerName: f.customerName,
        name: f.name || null,
        every: f.every,
        startsOn: f.startsOn,
        endsOn: f.endsOn || null,
        gstTreatment: f.gstTreatment,
        postAutomatically: f.postAutomatically,
        lines: [{ description: f.description, quantity: 1, uom: f.unit.trim() || null, unitPrice: f.unitPrice.replace(/,/g, ""), accountId: bill ? f.accountId || null : null }],
      });
      onDone(r.data);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">{bill ? "Supplier" : "Customer"}</span>
          <input id="rb-customer" value={f.customerName} onChange={set("customerName")} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Called (optional)</span>
          <input id="rb-name" value={f.name} onChange={set("name")} placeholder="Office rent" className={FIELD} />
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_96px_140px] gap-3">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">{bill ? "What it is for" : "What is billed"}</span>
          <input id="rb-what" value={f.description} onChange={set("description")} placeholder="Rent, office 2" className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Unit</span>
          <UnitInput label="Unit" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Each time, MVR</span>
          <input id="rb-amount" value={f.unitPrice} onChange={set("unitPrice")} inputMode="decimal" className={`${FIELD} tabular`} />
        </label>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How often</span>
          <select id="rb-every" value={f.every} onChange={set("every")} className={FIELD}>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
            <option value="quarter">Every three months</option>
            <option value="year">Every year</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">{bill ? "First bill" : "First invoice"}</span>
          <input id="rb-start" type="date" value={f.startsOn} onChange={set("startsOn")} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Last (optional)</span>
          <input id="rb-end" type="date" value={f.endsOn} onChange={set("endsOn")} className={FIELD} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">GST</span>
        <select id="rb-gst" value={f.gstTreatment} onChange={set("gstTreatment")} className={FIELD}>
          <option value="exclusive">Added on top</option>
          <option value="none_unregistered">None charged</option>
          <option value="exempt">Exempt</option>
          <option value="zero_rated">Zero-rated</option>
        </select>
      </label>
      {bill && (
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Kind of cost</span>
          <select id="rb-account" value={f.accountId} onChange={set("accountId")} className={FIELD}>
            <option value="">Which kind of cost?</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!bill && <label className="flex items-center gap-2 text-[14px]">
        <input id="rb-post" type="checkbox" checked={f.postAutomatically} onChange={set("postAutomatically")} className="h-4 w-4" />
        Put each invoice in the books by itself (otherwise it waits for you as a draft)
      </label>}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="button" variant="accent" disabled={busy || !f.customerName.trim() || !f.description.trim() || !f.unitPrice || (bill && !f.accountId)} onClick={save}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save the schedule
        </Button>
      </div>
    </div>
  );
}
