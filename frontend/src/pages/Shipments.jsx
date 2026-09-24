import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, X } from "lucide-react";
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
import { BASIS, FIELD } from "@/lib/shipments";
import { PendingAttachments, uploadPending } from "@/components/documents/Attachments";

/**
 * Shipments: goods bought abroad and everything it took to land them. Each
 * one says what its goods cost, what landing them cost on top, and how much
 * of that is still waiting to be shared into the goods.
 */

const n = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export default function Shipments() {
  const { companyId, can } = useCompany();
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["shipments", companyId],
    queryFn: () => apiClient.get("/shipments").then((r) => r.data.shipments),
    enabled: Boolean(companyId),
  });

  return (
    <div>
      <PageHeader
        title="Shipments"
        description="Goods bought abroad, and what it really cost to land them."
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> New shipment
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data?.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No shipments yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Goods bought abroad cost more than the supplier's price: the freight, the clearing agent, Customs duty and the bank's charges
            all belong in what they cost. Start one from its bill of lading, link the supplier's bill, and every cost of landing it is
            shared into the goods, so your stock and your margins carry the real figure.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.map((s) => (
            <Link key={s.id} to={`/shipments/${s.id}`} data-testid="shipment-row" className="block">
              <Card padding="md" className="hover:border-[var(--ink)] transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold">{s.reference}</div>
                    <div className="text-[13px] text-[var(--ink-muted)] truncate">
                      {s.description || `${s.containers.length} ${s.containers.length === 1 ? "container" : "containers"}`} ·{" "}
                      {BASIS.find((b) => b.value === s.basis)?.label.toLowerCase()}
                    </div>
                  </div>
                  {n(s.waiting) > 0 ? <Badge tone="accent">MVR {s.waiting} to share</Badge> : s.closed ? <Badge tone="neutral">Closed</Badge> : null}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-[14px]">
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">Goods</div>
                    <Money amount={s.goodsValue} />
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">Landing costs</div>
                    <Money amount={s.landed} />
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">On top</div>
                    <span className="tabular">{s.landedPercent === null ? "—" : `${s.landedPercent}%`}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {adding && <NewShipment onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewShipment({ onClose }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [f, setF] = useState({ reference: "", description: "", basis: "value" });
  const [boxes, setBoxes] = useState([{ number: "", size: "20", cbm: "" }]);
  const [err, setErr] = useState("");
  const [files, setFiles] = useState([]);
  const save = useMutation({ mutationFn: (body) => apiClient.post("/shipments", body).then((r) => r.data) });
  const setBox = (i, k) => (e) => setBoxes((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: e.target.value } : b)));

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await save.mutateAsync({
        ...f,
        containers: boxes.filter((b) => b.number.trim()).map((b) => ({ number: b.number, size: b.size || null, cbm: b.cbm || null })),
      });
      if (files.length) await uploadPending("shipment", r.id, files);
      qc.invalidateQueries({ queryKey: ["shipments", companyId] });
      nav(`/shipments/${r.id}`);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="New shipment" description="From its bill of lading.">
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Bill of lading number</span>
            <input id="ship-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="MSC1234567" className={FIELD} />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">What it is (optional)</span>
            <input id="ship-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Steel bars from Dubai" className={FIELD} />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-medium mb-1.5">Containers</legend>
          <div className="space-y-2">
            {boxes.map((b, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_72px_88px_44px] gap-2">
                <input aria-label={`Container ${i + 1}: number`} value={b.number} onChange={setBox(i, "number")} placeholder="ABCU1234567" className={FIELD} />
                <input aria-label={`Container ${i + 1}: size`} value={b.size} onChange={setBox(i, "size")} placeholder="20" className={FIELD} />
                <input aria-label={`Container ${i + 1}: CBM`} value={b.cbm} onChange={setBox(i, "cbm")} inputMode="decimal" placeholder="CBM" className={`${FIELD} tabular`} />
                <button
                  type="button"
                  aria-label={`Remove container ${i + 1}`}
                  onClick={() => setBoxes((bs) => (bs.length === 1 ? [{ number: "", size: "20", cbm: "" }] : bs.filter((_, j) => j !== i)))}
                  className="h-11 w-11 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setBoxes((bs) => [...bs, { number: "", size: "20", cbm: "" }])}>
            <Plus size={14} /> Another container
          </Button>
        </fieldset>
        <PendingAttachments files={files} onChange={setFiles} />
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Share landing costs</span>
          <select id="ship-basis" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} className={FIELD}>
            {BASIS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{BASIS.find((b) => b.value === f.basis)?.hint} You can change it until the costs are shared.</span>
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
        <Button type="submit" variant="accent" disabled={save.isPending || !f.reference.trim()}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Start it
        </Button>
      </div>
    </Modal>
  );
}
