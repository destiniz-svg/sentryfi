import { useCompany } from "@/context/CompanyContext";

const niceDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * The free trial, said once and only when it matters: in its last week as a
 * countdown on the hazard stripe (a deadline is what the chevrons are for), and
 * after it ends as what still works. Before that the sidebar's quiet line is
 * enough.
 */
export default function TrialStrip() {
  const { company } = useCompany();
  const t = company?.trial;
  if (!t || t.plan !== "trial") return null;

  if (t.ended) {
    return (
      <div role="status" className="mb-5 bg-[var(--ink)] text-[var(--surface)] px-4 py-3 text-[14px] leading-[1.45]">
        <strong className="font-semibold">The free trial ended{t.endsAt ? ` on ${niceDay(t.endsAt)}` : ""}.</strong> Everything here can still be read and
        exported. Nothing new can be recorded until it is extended: write to sentryfi.app@gmail.com.
      </div>
    );
  }
  if (t.daysLeft > 7) return null;

  return (
    <div role="status" className="mb-5 flex items-stretch bg-[var(--ink)] text-[var(--surface)]">
      <span
        aria-hidden="true"
        className="w-10 shrink-0"
        style={{ background: "repeating-linear-gradient(135deg, #F2C300 0 8px, #141414 8px 16px)" }}
      />
      <p className="px-4 py-2.5 text-[14px] leading-[1.45]">
        <strong className="font-semibold text-[#F2C300]">
          {t.daysLeft} {t.daysLeft === 1 ? "day" : "days"} left in the free trial.
        </strong>{" "}
        It ends on {niceDay(t.endsAt)}. After that the books stay readable and exportable.
      </p>
    </div>
  );
}

/** The sidebar's quiet line while the trial runs. */
export function trialLine(company) {
  const t = company?.trial;
  if (!t || t.plan !== "trial") return null;
  if (t.ended) return "Free trial ended";
  return `Free trial · ${t.daysLeft} ${t.daysLeft === 1 ? "day" : "days"} left`;
}
