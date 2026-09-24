import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import AILogo from "@/components/layout/AILogo";

/**
 * Onboarding: the first screen after signing up, once, before there is
 * anything to look at.
 *
 * Four short steps, in the order every accounting product that does this well
 * asks them: the company, its money, its tax, then a look back before the
 * books open. Everything has a default that is right for most Maldivian
 * businesses, only the name is required, and the one answer that cannot
 * change later (the currency the books are kept in) says so where it is asked.
 * The rest waits for the getting-started list on the first screen.
 */

const COUNTRIES = [
  { code: "MV", label: "Maldives", currency: "MVR", tax: "GST", number: "1000001GST501" },
  { code: "AE", label: "United Arab Emirates", currency: "AED", tax: "VAT", number: "100123456700003" },
  { code: "GENERIC", label: "Somewhere else", currency: "USD", tax: "tax", number: "" },
];

const INDUSTRIES = [
  { code: "construction", label: "Construction", note: "Materials, labour, subcontractors, site costs" },
  { code: "trading", label: "Trading and import", note: "Buying in, selling on, freight and customs" },
  { code: "tourism", label: "Tourism and hospitality", note: "Rooms, food and drink, transfers, agents" },
  { code: "services", label: "Services", note: "Fees for work, staff and contractors" },
  { code: "retail", label: "Shops and restaurants", note: "Sales at the counter, stock, delivery" },
  { code: "other", label: "Something else", note: "A plain starting set" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STEPS = ["The company", "Money", "Tax", "Ready"];
const EASE = [0.2, 0.8, 0.2, 1];

const GST_CHOICES = [
  { code: "general", label: "Yes, general", rate: "8%" },
  { code: "tourism", label: "Yes, tourism", rate: "17%" },
  { code: "both", label: "Yes, both", rate: "8% and 17%" },
  { code: "none", label: "Not registered", rate: "" },
];

// A TIN is seven digits, the tax, and a three-digit sequence (1000001GST501). A hint, never a block.
const looksLikeTin = (s) => /^\d{7}[A-Z]{2,4}\d{3}$/i.test(s.replace(/\s/g, ""));

export default function OpenBooks() {
  const { open, error: contextError } = useCompany();
  const still = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState({
    name: "",
    registrationNo: "",
    country: "MV",
    industry: "construction",
    currency: "MVR",
    yearStarts: 1,
    gst: "general",
    registered: true,
    tin: "",
    period: "month",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const where = COUNTRIES.find((c) => c.code === f.country);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const isMv = f.country === "MV";
  const registered = isMv ? f.gst !== "none" : f.registered;

  function go(to) {
    setErr("");
    if (to > step && step === 0 && f.name.trim().length < 2) {
      setErr("What is the company called?");
      return;
    }
    if (to > step && step === 1 && !/^[A-Z]{3}$/.test(f.currency)) {
      setErr("A currency is three letters, like MVR or USD.");
      return;
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  async function finish() {
    setSaving(true);
    setErr("");
    try {
      const tin = f.tin.trim().toUpperCase() || undefined;
      await open({
        name: f.name.trim(),
        registrationNo: f.registrationNo.trim() || undefined,
        country: f.country,
        industry: f.industry,
        baseCurrency: f.currency,
        yearStarts: Number(f.yearStarts),
        gstRegistered: registered,
        gstSector: isMv && registered ? f.gst : undefined,
        gstPeriod: registered ? f.period : undefined,
        tin: registered ? tin : undefined,
        gstNumber: registered ? tin : undefined,
      });
    } catch (ex) {
      setErr(ex.message || "The books could not be opened.");
      setSaving(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (step < 3) go(step + 1);
    else finish();
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <header className="h-16 border-b-2 border-[var(--ink)] bg-[var(--surface)]">
        <div className="h-full mx-auto max-w-[640px] px-5 flex items-center gap-3">
          <AILogo size={28} />
          <span className="text-[18px] font-semibold tracking-[-.02em]">Sentryfi</span>
          <span className="ml-auto font-display text-[12px] font-bold uppercase tracking-[.12em] text-[var(--ink-muted)] tabular-nums">
            Step {step + 1} of 4
          </span>
        </div>
      </header>

      {/* The staff: four readings, filled as they are taken. */}
      <div className="mx-auto max-w-[640px] px-5 pt-6">
        <ol className="grid grid-cols-4 gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => i < step && go(i)}
                disabled={i >= step}
                aria-current={i === step ? "step" : undefined}
                className="w-full text-left group disabled:cursor-default"
              >
                <span
                  className={`block h-2 transition-colors duration-500 ${
                    i < step ? "bg-[var(--ink)]" : i === step ? "bg-[#F2C300]" : "bg-[var(--border)]"
                  }`}
                />
                <span
                  className={`mt-2 block font-display text-[12px] font-bold uppercase tracking-[.1em] ${
                    i === step ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
                  } ${i < step ? "group-hover:underline underline-offset-4" : ""}`}
                >
                  {s}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={onSubmit} className="mx-auto max-w-[640px] px-5 pt-8 pb-40 sm:pb-16" noValidate>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={still ? false : { opacity: 0, x: 28 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={still ? undefined : { opacity: 0, x: -28 * dir }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {step === 0 && (
              <>
                <Title sub="The name on your registration certificate. You will be its administrator.">Open your books</Title>
                <Field label="Company name" htmlFor="ob-name">
                  <input id="ob-name" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus autoComplete="organization" placeholder="Coralmark Builders Pvt Ltd" className={INPUT} />
                </Field>
                <Field label="Registration number" hint="From the business registry, if it is to hand." htmlFor="ob-reg" optional>
                  <input id="ob-reg" value={f.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} placeholder="C-0123/2024" className={INPUT + " tabular-nums"} />
                </Field>
                <Group label="Where is it?">
                  <div className="flex flex-wrap gap-2">
                    {COUNTRIES.map((c) => (
                      <Chip key={c.code} on={f.country === c.code} onClick={() => setF((x) => ({ ...x, country: c.code, currency: c.currency }))}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                </Group>
                <Group label="What does it do?" hint="This picks the accounts you start with. An accountant can change them.">
                  <div role="radiogroup" aria-label="What does it do?" className="grid sm:grid-cols-2 border-t-2 border-[var(--ink)]">
                    {INDUSTRIES.map((x) => (
                      <Choice key={x.code} on={f.industry === x.code} onClick={() => set("industry", x.code)} title={x.label} note={x.note} />
                    ))}
                  </div>
                </Group>
              </>
            )}

            {step === 1 && (
              <>
                <Title sub="What the books are kept in, and when the year closes.">Money</Title>
                <Group label="The books are kept in">
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([where.currency, "MVR", "USD", "AED"])].map((c) => (
                      <Chip key={c} on={f.currency === c} onClick={() => set("currency", c)}>
                        {c}
                      </Chip>
                    ))}
                    <input
                      aria-label="Another currency"
                      value={["MVR", "USD", "AED"].includes(f.currency) ? "" : f.currency}
                      onChange={(e) => set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                      placeholder="Other"
                      className="h-11 w-[92px] px-3 border-2 border-[var(--border)] bg-[var(--surface)] font-display text-[15px] font-bold uppercase tracking-[.08em] outline-none focus:border-[var(--ink)]"
                    />
                  </div>
                  <p className="mt-3 flex gap-2 text-[14px] leading-[1.45] text-[var(--ink-muted)]">
                    <Lock size={15} className="shrink-0 mt-0.5 text-[var(--ink)]" aria-hidden="true" />
                    <span>
                      <strong className="text-[var(--ink)] font-semibold">This cannot change once the books have entries.</strong> Money in other currencies is
                      still kept in its own currency, at the rate of the day.
                    </span>
                  </p>
                </Group>
                <Field label="The year starts in" hint={isMv ? "MIRA's year runs January to December unless you were told otherwise." : "The first month of the financial year."} htmlFor="ob-year">
                  <select id="ob-year" value={f.yearStarts} onChange={(e) => set("yearStarts", Number(e.target.value))} className={INPUT + " appearance-none"}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Title sub={isMv ? "It decides what can be claimed back on what you buy, and what your invoices must show." : `It decides whether ${where.tax} can be claimed back on what you buy.`}>
                  Tax
                </Title>
                {isMv ? (
                  <Group label="Is the company registered for GST?">
                    <div role="radiogroup" aria-label="GST registration" className="border-t-2 border-[var(--ink)]">
                      {GST_CHOICES.map((g) => (
                        <Choice key={g.code} on={f.gst === g.code} onClick={() => set("gst", g.code)} title={g.label} aside={g.rate} />
                      ))}
                    </div>
                    <p className="mt-3 text-[14px] leading-[1.45] text-[var(--ink-muted)]">
                      Registration is required once sales pass MVR 1 million a year. Resorts, guesthouses, dive schools and tourist vessels register
                      whatever they sell.
                    </p>
                  </Group>
                ) : (
                  <Group label={`Is the company registered for ${where.tax}?`}>
                    <div className="flex gap-2">
                      <Chip on={f.registered} onClick={() => set("registered", true)}>Yes</Chip>
                      <Chip on={!f.registered} onClick={() => set("registered", false)}>No</Chip>
                    </div>
                  </Group>
                )}
                {registered && (
                  <>
                    <Field
                      label={isMv ? "TIN" : `${where.tax} number`}
                      htmlFor="ob-tin"
                      optional
                      hint={
                        isMv && f.tin && !looksLikeTin(f.tin)
                          ? "That does not look like a TIN (seven digits, GST, three digits). Check it, or add it later."
                          : "Every invoice you send has to show it. You can add it later."
                      }
                    >
                      <input id="ob-tin" value={f.tin} onChange={(e) => set("tin", e.target.value)} placeholder={where.number} className={INPUT + " tabular-nums uppercase"} />
                    </Field>
                    <Group label="How often do you file?">
                      <div className="flex gap-2">
                        <Chip on={f.period === "month"} onClick={() => set("period", "month")}>Every month</Chip>
                        <Chip on={f.period === "quarter"} onClick={() => set("period", "quarter")}>Every quarter</Chip>
                      </div>
                      <p className="mt-3 text-[14px] text-[var(--ink-muted)]">Due on the 28th after each period. Sentryfi counts down to it.</p>
                    </Group>
                  </>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <Title sub="Check it once. Anything here can be looked at again in settings.">Ready to open</Title>
                <dl className="border-t-2 border-[var(--ink)]">
                  {[
                    ["Company", f.name.trim(), 0],
                    ["Registration", f.registrationNo.trim() || "Not given", 0],
                    ["Where", where.label, 0],
                    ["What it does", INDUSTRIES.find((x) => x.code === f.industry).label, 0],
                    ["Kept in", f.currency, 1],
                    ["Year starts", MONTHS[f.yearStarts - 1], 1],
                    [
                      where.tax,
                      registered ? (isMv ? `${GST_CHOICES.find((g) => g.code === f.gst).label}, filed ${f.period === "month" ? "monthly" : "quarterly"}` : `Registered, filed ${f.period === "month" ? "monthly" : "quarterly"}`) : "Not registered",
                      2,
                    ],
                    ...(registered ? [[isMv ? "TIN" : "Number", f.tin.trim().toUpperCase() || "Add it later", 2]] : []),
                  ].map(([k, v, s]) => (
                    <div key={k} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_auto] gap-3 items-baseline py-3.5 border-b border-[var(--border)]">
                      <dt className="text-[14px] text-[var(--ink-muted)]">{k}</dt>
                      <dd className="text-[15px] font-semibold break-words">{v}</dd>
                      <button type="button" onClick={() => go(s)} className="text-[14px] font-semibold text-[var(--link,#0F4C5C)] underline underline-offset-4">
                        Change
                      </button>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 bg-[var(--ink)] text-white px-5 py-4 flex items-start gap-3">
                  <Check size={18} strokeWidth={3} className="text-[#F2C300] mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-[15px] leading-[1.45]">
                    <strong className="font-semibold">30 days free, from today.</strong> No card. When it ends, the books stay readable and exportable.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {(err || contextError) && (
          <p role="alert" className="mt-6 border-2 border-[var(--danger)] px-4 py-3 text-[14px] text-[var(--danger)]">
            {err || contextError}
          </p>
        )}

        {/* On a phone the buttons sit at the thumb, over the page. */}
        <div className="fixed sm:static bottom-0 inset-x-0 bg-[var(--surface)] sm:bg-transparent border-t-2 sm:border-0 border-[var(--ink)] px-5 sm:px-0 py-4 sm:py-0 sm:mt-10 flex items-center gap-4 max-w-[640px] mx-auto">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="h-14 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="group ml-auto flex-1 sm:flex-none h-14 px-7 inline-flex items-center justify-center gap-3 bg-[var(--ink)] text-[#F2C300] font-display text-[16px] font-bold uppercase tracking-[.1em] hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Opening the books
              </>
            ) : (
              <>
                {step === 3 ? "Open the books" : "Continue"}
                <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  "w-full h-14 px-4 border-2 border-[var(--border)] bg-[var(--surface)] text-[16px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--ink)]";

function Title({ children, sub }) {
  return (
    <div className="mb-8">
      <h1 className="font-display font-bold uppercase text-[clamp(38px,8vw,56px)] leading-[.92]">{children}</h1>
      {sub && <p className="mt-3 text-[16px] leading-[1.5] text-[var(--ink-muted)] max-w-[48ch]">{sub}</p>}
    </div>
  );
}

function Field({ label, hint, htmlFor, optional, children }) {
  return (
    <div className="mb-6">
      <label htmlFor={htmlFor} className="mb-2 flex items-baseline gap-2 font-display text-[13px] font-bold uppercase tracking-[.12em]">
        {label}
        {optional && <span className="normal-case tracking-normal font-sans font-normal text-[13px] text-[var(--ink-muted)]">if you have it</span>}
      </label>
      {children}
      {hint && <p className="mt-2 text-[14px] leading-[1.45] text-[var(--ink-muted)]">{hint}</p>}
    </div>
  );
}

function Group({ label, hint, children }) {
  return (
    <fieldset className="mb-7">
      <legend className="mb-2 font-display text-[13px] font-bold uppercase tracking-[.12em]">{label}</legend>
      {hint && <p className="-mt-1 mb-3 text-[14px] text-[var(--ink-muted)]">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-11 px-4 border-2 font-display text-[15px] font-bold uppercase tracking-[.08em] transition-colors ${
        on ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

// A ruled choice: the chosen one carries the yellow, as the thing being decided.
function Choice({ on, onClick, title, note, aside }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-[var(--border)] sm:odd:border-r flex items-center gap-3 transition-colors ${
        on ? "bg-[#F2C300] text-[#141414]" : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className={`h-5 w-5 shrink-0 border-2 flex items-center justify-center ${on ? "border-[#141414] bg-[#141414]" : "border-[var(--ink-muted)]"}`} aria-hidden="true">
        {on && <Check size={13} strokeWidth={3.5} className="text-[#F2C300]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{title}</span>
        {note && <span className={`block text-[13.5px] ${on ? "text-[#3D3A2A]" : "text-[var(--ink-muted)]"}`}>{note}</span>}
      </span>
      {aside && <span className="font-display text-[16px] font-bold tabular-nums">{aside}</span>}
    </button>
  );
}
