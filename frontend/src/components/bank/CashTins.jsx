import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cashApi } from "@/api/cash";
import { companiesApi } from "@/api/companies";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Cash tins, from the office.
 *
 * Petty cash kept the usual way (an imprest): each tin is handed to one
 * person with a float, what they spend is recorded from their phone, and the
 * office puts back exactly what was spent to bring the tin up to its float.
 * "To reimburse" is that figure, read from the books.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

export function CashTins({ banks }) {
  const { companyId, can } = useCompany();
  const [editing, setEditing] = useState(null); // a tin, or "new"
  const [paying, setPaying] = useState(null);
  const { data: tins, isLoading } = useQuery({
    queryKey: ["cash", companyId],
    queryFn: cashApi.boxes,
    enabled: Boolean(companyId),
  });

  const manage = can("manage_cash");
  const pay = can("approve") || can("adjust");
  if (isLoading || !tins) return null;
  if (!tins.length && !manage) return null;

  return (
    <Card padding="none" className="overflow-hidden" data-testid="cash-tins">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <span className="text-[12px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">Cash tins</span>
        {manage && (
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus size={15} /> Cash tin
          </Button>
        )}
      </div>
      {!tins.length ? (
        <p className="px-5 py-4 text-[14px] text-[var(--ink-muted)]">
          No tins yet. Hand one to whoever pays for things on site, with a float, and they record what they spend from
          their phone.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {tins.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
              <div className="min-w-[12rem] flex-1">
                <div className="text-[15px] font-medium">{t.name}</div>
                <div className="text-[13px] text-[var(--ink-muted)]">
                  {t.holder ? `Held by ${t.holder}` : "Nobody holds it"} · float {t.float || "not set"}
                </div>
                {t.askedFor && <div className="text-[13px] mt-0.5">Asked for {t.askedFor}</div>}
                {t.handed?.length > 0 && (
                  <div className="text-[13px] mt-0.5">
                    {t.handed.map((h) => h.amount).join(" and ")} handed over, waiting for {t.holder || "the holder"} to confirm
                  </div>
                )}
                {t.paidByHolder && (
                  <div className="text-[13px] mt-0.5 text-[var(--danger)]">
                    {t.holder || "The holder"} paid {t.paidByHolder} out of pocket
                  </div>
                )}
              </div>
              {t.overdrawn && <Badge tone="danger">Below zero</Badge>}
              <div className="text-right ml-auto">
                <div className={`tabular text-[17px] font-semibold ${t.overdrawn ? "text-[var(--danger)]" : ""}`}>
                  {t.inBox}
                </div>
                <div className="tabular text-[12px] text-[var(--ink-muted)]">
                  {t.toReimburse ? `${t.toReimburse} to reimburse` : "in the tin"}
                </div>
              </div>
              <div className="flex gap-2 basis-full sm:basis-auto">
                {pay && (
                  <Button variant={t.toReimburse ? "accent" : "outline"} onClick={() => setPaying(t)}>
                    {t.toReimburse ? `Reimburse ${t.toReimburse}` : "Give cash"}
                  </Button>
                )}
                {manage && (
                  <Button variant="outline" onClick={() => setEditing(t)}>
                    Change
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TinForm
          key={editing === "new" ? "new" : editing.id}
          tin={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {paying && <GiveCash key={paying.id} tin={paying} banks={banks} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  return () => ["cash", "bank", "figures"].forEach((k) => qc.invalidateQueries({ queryKey: [k, companyId] }));
}

function TinForm({ tin, onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [holderId, setHolderId] = useState(tin?.holderId || "");
  const [float, setFloat] = useState(tin?.float || "");
  const [err, setErr] = useState("");
  const { data: people } = useQuery({ queryKey: ["people", companyId], queryFn: companiesApi.people });
  const save = useMutation({
    mutationFn: () =>
      tin
        ? cashApi.change(tin.id, { holderId: holderId || null, float: float.trim() || null })
        : cashApi.open({ name: name.trim(), holderId: holderId || null, float: float.trim() || null }),
  });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!tin && name.trim().length < 2) return setErr("What is the tin called?");
    try {
      await save.mutateAsync();
      refresh();
      toast.success(
        tin ? `${tin.name} changed` : `${name.trim()} is open`,
        tin ? undefined : "It starts empty. Give it its float from the bank."
      );
      onClose();
    } catch (ex) {
      setErr(ex.message || "That did not work.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={tin ? tin.name : "New cash tin"}
      description="One tin, one person holding it, and the float it holds when full."
    >
      <div className="space-y-4">
        {!tin && (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Name</span>
            <input id="tin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maalhos site" className={FIELD} />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Held by</span>
          <select id="tin-holder" value={holderId} onChange={(e) => setHolderId(e.target.value)} className={FIELD}>
            {!tin && <option value="">Me</option>}
            {(people?.members || []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Float: what it holds when full</span>
          <input
            id="tin-float"
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            inputMode="decimal"
            placeholder="5,000.00"
            className={`${FIELD} tabular`}
          />
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
        <Button type="submit" variant="accent" disabled={save.isPending}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          {tin ? "Save" : "Open it"}
        </Button>
      </div>
    </Modal>
  );
}

function GiveCash({ tin, banks, onClose }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(tin.toReimburse || tin.float || "");
  const [fromId, setFromId] = useState(banks[0]?.id || "");
  const [err, setErr] = useState("");
  const give = useMutation({
    mutationFn: () => cashApi.giveTo(tin.id, { amount: amount.trim(), bankAccountId: fromId || null }),
  });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await give.mutateAsync();
      refresh();
      toast.success(
        `MVR ${r.given} handed over · entry ${r.entryNo}`,
        `It is in ${tin.name} once ${tin.holder || "the holder"} confirms on their phone.`
      );
      onClose();
    } catch (ex) {
      setErr(ex.message || "That did not work.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title={`Cash for ${tin.name}`}
      description={
        tin.toReimburse
          ? `${tin.toReimburse} was spent from it. Putting that back fills it to its float.`
          : "Money from the bank into the tin."
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How much</span>
          <input id="give-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${FIELD} tabular`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">From</span>
          <select id="give-from" value={fromId} onChange={(e) => setFromId(e.target.value)} className={FIELD}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
        <Button type="submit" variant="accent" disabled={give.isPending || !amount.trim()}>
          {give.isPending && <Loader2 size={14} className="animate-spin" />}
          Give MVR {amount.trim()}
        </Button>
      </div>
    </Modal>
  );
}
