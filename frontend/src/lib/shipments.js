/** Shared by the shipments pages. */
export const FIELD =
  "w-full h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)]";

/** How landing costs are shared over a shipment's goods. */
export const BASIS = [
  { value: "value", label: "By value", hint: "Each item carries costs in proportion to what it cost. Right when goods differ a lot in price." },
  { value: "quantity", label: "By weight", hint: "Each item carries costs in proportion to how much of it came. Right for steel, cement, sand." },
  { value: "cbm", label: "By container space", hint: "Each container carries costs by its CBM, shared inside it by value. Right when freight is charged by space." },
];
