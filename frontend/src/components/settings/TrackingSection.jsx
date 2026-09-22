import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { useTags } from "@/components/ui/TagPicker";

/**
 * Tracking: what a bill, invoice or cash spend can say it belongs to, so the
 * profit and loss can be split by it. A kind is switched on by giving it its
 * first value, and a value that is no longer used is archived, not deleted,
 * because lines already posted may name it.
 */

const KINDS = [
  { kind: "project", name: "Projects", hint: "A job, a contract, a site. Construction mostly runs on these." },
  { kind: "branch", name: "Branches", hint: "A shop, an office, an island you work on." },
  { kind: "department", name: "Departments", hint: "Sales, operations, the kitchen." },
  { kind: "machine", name: "Machines and boats", hint: "A dhoni, an excavator, a generator: what each one costs and earns." },
];

const FIELD =
  "flex-1 min-w-0 h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";

export function TrackingSection() {
  const { data } = useTags();
  const values = (data?.values || []).filter((v) => !v.archived);
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-[var(--ink-muted)] max-w-prose">
        Give a kind its first name and it appears on bills, invoices and cash spends, and profit and loss can be split by it.
        Leave a kind empty and nobody is asked about it.
      </p>
      {KINDS.map((k) => (
        <Kind key={k.kind} {...k} values={values.filter((v) => v.kind === k.kind)} />
      ))}
    </div>
  );
}

function Kind({ kind, name, hint, values }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["dimensions", companyId] });
  const add = useMutation({ mutationFn: (body) => apiClient.post("/dimensions", body).then((r) => r.data) });
  const archive = useMutation({ mutationFn: (id) => apiClient.post(`/dimensions/${id}/archive`).then((r) => r.data) });

  async function onAdd(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await add.mutateAsync({ kind, name: draft.trim() });
      setDraft("");
      refresh();
    } catch (ex) {
      toast.error("Not added", ex.message);
    }
  }

  return (
    <Card padding="lg">
      <div className="text-[16px] font-semibold">{name}</div>
      <div className="text-[13px] text-[var(--ink-muted)] mt-0.5">{hint}</div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {values.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-full border border-[var(--border)] text-[14px]">
              {v.name}
              <button
                type="button"
                aria-label={`Stop using ${v.name}`}
                title="Stop using it. Lines already posted keep it."
                onClick={async () => {
                  await archive.mutateAsync(v.id);
                  refresh();
                }}
                className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={onAdd} className="flex gap-2 mt-3">
        <input
          id={`track-${kind}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={values.length ? "Add another" : `Add the first one`}
          className={FIELD}
          aria-label={`New ${name.toLowerCase()}`}
        />
        <Button type="submit" variant="outline" disabled={add.isPending || !draft.trim()}>
          <Plus size={16} /> Add
        </Button>
      </form>
    </Card>
  );
}
