import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { today } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { CLAIM_STATUS } from "@/lib/orders";
import { useOutbox } from "@/context/OutboxContext";

/**
 * Expense claims: what someone spent for the business from their own pocket.
 * Written up line by line and sent; approved by someone else; paid back in a
 * payment run.
 */


export default function Claims() {
  const { companyId } = useCompany();
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["claims", companyId], queryFn: () => apiClient.get("/claims").then((r) => r.data.claims), enabled: Boolean(companyId) });

  return (
    <div>
      <PageHeader
        title="Expense claims"
        description="What you spent for the business from your own pocket, and getting it back."
        actions={
          <Button variant="accent" onClick={() => setAdding(true)}>
            <Plus size={16} /> New claim
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data?.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No claims yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Paid for a ferry, a tool or a meal on site out of your own money? Write it up here, line by line. Someone who approves checks it,
            and it is paid back with the next payment run.
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]" data-testid="claims">
            {data.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">
                      {c.number} · {c.claimant}
                    </div>
                    <div className="text-[13px] text-[var(--ink-muted)] truncate">{c.lines.map((l) => l.description).join(", ")}</div>
                    {c.rejectedWhy && <div className="text-[13px] text-[var(--danger)] mt-1">Why not: {c.rejectedWhy}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <Money amount={c.total} className="text-[15px] font-semibold" />
                    <div className="mt-1">
                      <Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {adding && <NewClaim onClose={() => setAdding(false)} />}
    </div>
  );
}

const blank = () => ({ spentOn: today(), description: "", accountId: "", projectId: "", amount: "" });

function NewClaim({ onClose }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const { sendOrKeep } = useOutbox();
  const { data: o } = useQuery({ queryKey: ["claims", companyId, "options"], queryFn: () => apiClient.get("/claims/options").then((r) => r.data) });
  const [lines, setLines] = useState([blank()]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i, k) => (e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  const total = lines.reduce((a, l) => a + (Number(String(l.amount).replace(/,/g, "")) || 0), 0);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const body = { lines: lines.filter((l) => l.description.trim()).map((l) => ({ ...l, projectId: l.projectId || null, amount: String(l.amount).replace(/,/g, "") })) };
      const sent = await sendOrKeep({ url: "/claims", body, label: `A claim for MVR ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}` });
      if (sent.queued) {
        toast.success("Kept on this phone", "Your claim goes by itself when there is signal.");
        return onClose();
      }
      const r = { data: sent.data };
      qc.invalidateQueries({ queryKey: ["claims", companyId] });
      qc.invalidateQueries({ queryKey: ["attention", companyId] });
      toast.success(`${r.data.number} sent`, "Someone who approves will look at it.");
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="New claim" description="Each thing you paid for, with the date and what it cost.">
      {!o ? (
        <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : (
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] p-3 space-y-2" data-testid="claim-line">
              <div className="flex gap-2">
                <input aria-label={`Line ${i + 1}: what`} value={l.description} onChange={set(i, "description")} placeholder="Ferry to site" className={`${FIELD} flex-1 min-w-0`} />
                <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length === 1 ? [blank()] : ls.filter((_, j) => j !== i)))} className="h-11 w-11 shrink-0 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]">
                  <X size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input aria-label={`Line ${i + 1}: date`} type="date" value={l.spentOn} onChange={set(i, "spentOn")} className={FIELD} />
                <input aria-label={`Line ${i + 1}: amount`} value={l.amount} onChange={set(i, "amount")} inputMode="decimal" placeholder="MVR" className={`${FIELD} tabular`} />
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <select aria-label={`Line ${i + 1}: kind of cost`} value={l.accountId} onChange={set(i, "accountId")} className={FIELD}>
                  <option value="">Which kind of cost?</option>
                  {o.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select aria-label={`Line ${i + 1}: project`} value={l.projectId} onChange={set(i, "projectId")} className={FIELD}>
                  <option value="">No project</option>
                  {o.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
              <Plus size={14} /> Another
            </Button>
            <span className="text-[14px] tabular">MVR {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || total <= 0}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Send the claim
        </Button>
      </div>
    </Modal>
  );
}

