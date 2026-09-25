import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";

/**
 * How each kind of document is numbered. Change the start and the next one
 * carries on from the highest number so far; nothing already issued changes.
 */
export function NumberingSection() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["numbering", companyId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiClient.get("/numbering").then((r) => r.data.kinds), enabled: Boolean(companyId) });
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(null);
  if (!data) return <Skeleton className="h-80 rounded-2xl" />;
  const may = can("manage_settings");

  async function save(k) {
    setBusy(k.kind);
    try {
      const r = await apiClient.put(`/numbering/${k.kind}`, { start: edits[k.kind] ?? k.start });
      toast.success(`${k.label}: next is ${r.data.next}`);
      setEdits((e) => { const rest = { ...e }; delete rest[k.kind]; return rest; });
      qc.invalidateQueries({ queryKey: key });
    } catch (ex) {
      toast.error("Not saved", ex.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-[17px] font-semibold">Numbers</h2>
      <p className="text-[14px] text-[var(--ink-muted)] mt-1 max-w-[62ch]">How each document is numbered. Change the start, and the next one carries on from the highest number so far. Nothing already issued is renumbered.</p>
      <ul className="mt-5 divide-y divide-[var(--border)]">
        {data.map((k) => {
          const value = edits[k.kind] ?? k.start;
          const changed = edits[k.kind] !== undefined && edits[k.kind] !== k.start;
          return (
            <li key={k.kind} className="py-3 grid grid-cols-[minmax(0,1fr)_140px] sm:grid-cols-[minmax(0,1fr)_160px_150px_auto] gap-x-3 gap-y-2 items-center">
              <span className="text-[15px] font-medium">{k.label}</span>
              <input aria-label={`${k.label}: start`} value={value} disabled={!may} onChange={(e) => setEdits({ ...edits, [k.kind]: e.target.value })} className={`${FIELD} tabular`} />
              <span className="text-[13px] text-[var(--ink-muted)] tabular col-span-2 sm:col-span-1">
                Next: <b className="text-[var(--ink)] font-semibold">{changed ? `${value.replace(/\s+/g, "")}…` : k.next}</b>
              </span>
              {may && (
                <Button size="sm" variant={changed ? "accent" : "outline"} className="h-9 px-3.5 text-[13px] justify-self-start" disabled={!changed || busy === k.kind} onClick={() => save(k)}>
                  Save
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
