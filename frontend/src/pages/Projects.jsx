import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { FIELD } from "@/lib/shipments";

/**
 * Projects: each one's contract, what it has cost so far against its budget,
 * and where it is heading. A project over budget says so on its card.
 */

export default function Projects() {
  const { companyId, can } = useCompany();
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: () => apiClient.get("/projects").then((r) => r.data.projects),
    enabled: Boolean(companyId),
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Each contract: what it has cost against its budget, what is claimed and certified, and the margin it is heading for."
        actions={
          can("record") && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> New project
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data?.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No projects yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            A contract: its value, the retention the customer keeps back, and a budget by kind of cost. Bills tagged to it are what it has
            spent, orders and subcontracts are what it is committed to, and progress claims become invoices when they are certified.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} data-testid="project-row" className="block">
              <Card padding="md" className="hover:border-[var(--ink)] transition-colors h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[16px] font-semibold min-w-0 truncate">{p.name}</div>
                  {p.overBudget.length > 0 && <Badge tone="danger">Over on {p.overBudget.join(", ").toLowerCase()}</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-[14px]">
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">Contract</div>
                    {p.contract ? <Money amount={p.contract} /> : <span className="text-[var(--ink-muted)]">Not set</span>}
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">Spent</div>
                    <Money amount={p.spent} />
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--ink-muted)]">Heading for</div>
                    {p.forecastMargin ? <Money amount={p.forecastMargin} /> : <span className="text-[var(--ink-muted)]">—</span>}
                  </div>
                </div>
                {p.percentComplete !== null && (
                  <div className="mt-3" aria-label={`${p.percentComplete}% of the forecast cost spent`}>
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div className="h-full bg-[var(--ink)]" style={{ width: `${Math.min(100, p.percentComplete)}%` }} />
                    </div>
                    <div className="text-[12px] text-[var(--ink-muted)] mt-1">{p.percentComplete}% of the cost it is heading for, spent</div>
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
      {adding && <NewProject onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewProject({ onClose }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const save = useMutation({ mutationFn: (body) => apiClient.post("/projects", body).then((r) => r.data) });
  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await save.mutateAsync({ name });
      qc.invalidateQueries({ queryKey: ["projects", companyId] });
      qc.invalidateQueries({ queryKey: ["dimensions", companyId] });
      nav(`/projects/${r.id}`);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title="New project" description="Its contract and budget come next.">
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">Name</span>
        <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Office fit-out, Malé" className={FIELD} />
      </label>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={save.isPending || !name.trim()}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Start it
        </Button>
      </div>
    </Modal>
  );
}
