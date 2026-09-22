import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";

/**
 * What a bill, invoice or spend belongs to: a project, branch, department or
 * machine. One select per kind the company has switched on (a kind is on once
 * it has a value, in Settings, Tracking); nothing at all when none are, so a
 * business that does not track these never sees the question.
 *
 * value: { projectId, dimensionIds }. onChange gets the same shape.
 */

const LABEL = { project: "Project", branch: "Branch", department: "Department", machine: "Machine or boat", other: "Also" };

export function useTags() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["dimensions", companyId],
    queryFn: () => apiClient.get("/dimensions").then((r) => r.data),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
}

export function TagPicker({ value, onChange, className = "", fieldClass }) {
  const { data } = useTags();
  const live = (data?.values || []).filter((v) => !v.archived);
  const kinds = (data?.kinds || []).filter((k) => live.some((v) => v.kind === k));
  if (!kinds.length) return null;

  const dims = value?.dimensionIds || [];
  const pickedFor = (kind) =>
    kind === "project" ? value?.projectId || "" : live.find((v) => v.kind === kind && dims.includes(v.id))?.id || "";

  const set = (kind, id) => {
    if (kind === "project") return onChange({ ...value, projectId: id || null });
    const others = dims.filter((d) => !live.some((v) => v.id === d && v.kind === kind));
    onChange({ ...value, dimensionIds: id ? [...others, id] : others });
  };

  return (
    <div className={`grid sm:grid-cols-2 gap-3 ${className}`}>
      {kinds.map((k) => (
        <label key={k} className="block">
          <span className="text-sm font-medium block mb-1.5">{LABEL[k]}</span>
          <select id={`tag-${k}`} value={pickedFor(k)} onChange={(e) => set(k, e.target.value)} className={fieldClass}>
            <option value="">None</option>
            {live
              .filter((v) => v.kind === k)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
      ))}
    </div>
  );
}
