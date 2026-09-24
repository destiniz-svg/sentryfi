import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCompany } from "@/context/CompanyContext";
import AILogo from "@/components/layout/AILogo";

/**
 * The first screen, once, before there is anything to look at.
 *
 * Someone signing in for the first time belongs to no company, so there are no
 * books to open and nothing else in the app can work. Rather than showing a
 * dashboard full of zeroes, this asks for the one thing that has to exist
 * first.
 *
 * It asks for three facts and no more. The tax number is here rather than
 * buried in settings because every MIRA document requires it and it is the
 * field the app most often did not have; it is still optional, because someone
 * setting this up on a Friday evening may not have it to hand and should not
 * be stopped.
 */
/** Where the books are kept: each is a tax pack on the server (ledger/tax.js). */
const COUNTRIES = [
  { code: "MV", label: "Maldives", tax: "GST", number: "1234567GST501", hint: "Every MIRA document asks for it.", currency: "MVR" },
  { code: "AE", label: "United Arab Emirates", tax: "VAT", number: "100123456700003", hint: "Your TRN: every tax invoice and VAT return shows it.", currency: "AED" },
  { code: "GENERIC", label: "Somewhere else", tax: "tax", number: "", hint: "Your tax registration number, if you have one.", currency: null },
];

export default function OpenBooks() {
  const { open, error: contextError } = useCompany();
  const [form, setForm] = useState({ name: "", tin: "", gstRegistered: true, country: "MV" });
  const where = COUNTRIES.find((c) => c.code === form.country);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setErr("What is the company called?");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await open({
        name: form.name.trim(),
        tin: form.tin.trim() || undefined,
        gstRegistered: form.gstRegistered,
        country: form.country,
      });
    } catch (ex) {
      setErr(ex.message || "Could not open the books");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[460px]">
        <AILogo size={40} />

        <h1 className="text-[28px] leading-[1.08] tracking-[-0.03em] font-semibold text-[var(--ink)] mt-7">
          Open a set of books.
        </h1>
        <p className="text-[var(--ink-muted)] mt-3 text-[15px] leading-relaxed">
          Everything is kept per company, so there has to be one before there is
          anything to record. You will be its administrator.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-[var(--ink)] mb-1.5">Where is the company?</legend>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <button key={c.code} type="button" onClick={() => setForm((f) => ({ ...f, country: c.code }))} aria-pressed={form.country === c.code} className={`h-10 px-4 rounded-full text-[14px] font-medium ${form.country === c.code ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-[var(--ink-muted)] mt-1.5">
              {where.currency ? `Kept in ${where.currency}, with ${where.tax} as the law there has it.` : "Kept in the currency you choose, with the tax rate you give it."}
            </p>
          </fieldset>
          <div>
            <label
              htmlFor="company-name"
              className="text-sm font-medium text-[var(--ink)] mb-1.5 block"
            >
              Company name
            </label>
            <input
              id="company-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Your company's registered name"
              autoFocus
              className="w-full h-12 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15"
            />
          </div>

          <div>
            <label
              htmlFor="company-tin"
              className="text-sm font-medium text-[var(--ink)] mb-1.5 block"
            >
              Tax number <span className="text-[var(--ink-muted)] font-normal">— if you have it to hand</span>
            </label>
            <input
              id="company-tin"
              value={form.tin}
              onChange={set("tin")}
              placeholder={where.number}
              className="w-full h-12 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15 tabular"
            />
            <p className="text-[13px] text-[var(--ink-muted)] mt-1.5">
              {where.hint} You can add it later in settings.
            </p>
          </div>

          <label className="flex items-start gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.gstRegistered}
              onChange={set("gstRegistered")}
              className="mt-0.5 h-5 w-5 rounded-[4px] border-[var(--border)]"
            />
            <span className="text-sm text-[var(--ink)] leading-snug">
              This company is registered for {where.tax}
              <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5">
                It decides whether tax can be claimed back on what you buy.
              </span>
            </span>
          </label>

          {(err || contextError) && (
            <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger)]/10 rounded-[var(--radius-control)] px-4 py-2.5">
              {err || contextError}
            </p>
          )}

          <Button type="submit" variant="accent" disabled={saving} className="w-full h-12">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Opening the books…" : "Open the books"}
          </Button>

          <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed">
            A starting chart of accounts is created with it — bank, cash boxes,
            suppliers, materials, labour and the rest. An accountant shapes it
            properly before any real money goes in.
          </p>
        </form>
      </div>
    </div>
  );
}
