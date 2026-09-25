import { useId } from "react";

/**
 * The unit a line is counted in: pcs, day, m³, bag, trip. Anything can be
 * typed; the list offers the ones contractors, importers and services here
 * write most, so the same unit is spelt the same way on every document.
 */
export const UNITS = ["pcs", "day", "hr", "week", "month", "m", "m²", "m³", "kg", "ton", "ltr", "bag", "box", "set", "lot", "trip", "job", "sheet", "roll", "load"];

export function UnitInput({ value, onChange, label, className, placeholder = "Unit" }) {
  const list = useId();
  return (
    <>
      <input aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value.slice(0, 20))} list={list} placeholder={placeholder} autoComplete="off" autoCapitalize="none" className={className} />
      <datalist id={list}>
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  );
}
