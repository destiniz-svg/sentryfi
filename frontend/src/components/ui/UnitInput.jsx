import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";

/**
 * The unit a line is counted in: pcs, day, m³, bag, trip. Anything can be
 * typed, and a new unit is kept with the document it is on. The list offers
 * the company's own units first, most used first, then the common ones, so the
 * same unit is spelt the same way on every document.
 */
export const UNITS = ["pcs", "day", "hr", "week", "month", "m", "m²", "m³", "kg", "ton", "ltr", "bag", "box", "set", "lot", "trip", "job", "sheet", "roll", "load"];

export function useUnits() {
  const { companyId } = useCompany();
  const { data } = useQuery({ queryKey: ["units", companyId], queryFn: () => apiClient.get("/stock/units").then((r) => r.data.units), enabled: Boolean(companyId), staleTime: 60_000 });
  const seen = new Set();
  return [...(data || []), ...UNITS].filter((u) => !seen.has(u.toLowerCase()) && seen.add(u.toLowerCase()));
}

export function UnitInput({ value, onChange, label, className, placeholder = "Unit", id }) {
  const list = useId();
  const units = useUnits();
  return (
    <>
      <input id={id} aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value.slice(0, 20))} list={list} placeholder={placeholder} autoComplete="off" autoCapitalize="none" className={className} />
      <datalist id={list}>
        {units.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  );
}
