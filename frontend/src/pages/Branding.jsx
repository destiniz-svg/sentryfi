import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, X, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { compose, templateWith, withPreset, SIZES, LAYOUTS, FONTS, LABELS, DV_LABELS, PRESETS, SAMPLES, KIND_LABEL, readable, loadFont } from "@/lib/documents";
import { prepare, paletteOf } from "@/lib/images";
import { FIELD } from "@/lib/shipments";
import { cn } from "@/lib/utils";

/**
 * The brand kit and the invoice template, with the paper beside them drawn
 * as you change them. Set once; every document the company sends draws from
 * it. The sample is made up: nothing on it is anyone's real business.
 */

const STARTERS = ["#16181d", "#0b5cad", "#0f7b6c", "#b4262d", "#c8741a", "#5b3fa8"];
const TEXTAREA = FIELD.replace("h-11", "min-h-[84px] py-2.5");

export default function Branding() {
  const { companyId, can } = useCompany();
  const { data, isLoading } = useQuery({
    queryKey: ["branding", companyId, "all"],
    queryFn: async () => {
      const [b, t] = await Promise.all([apiClient.get("/documents/brand"), apiClient.get("/documents/templates")]);
      return { ...b.data, templates: t.data.templates };
    },
    enabled: Boolean(companyId),
  });
  if (isLoading || !data) return <Skeleton className="h-[80vh] rounded-2xl" />;
  return <Editor key={companyId} start={data} mayChange={can("manage_settings")} />;
}

function Editor({ start, mayChange }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [brand, setBrand] = useState(() => ({ ...earlierOf(start.earlier), ...stripFixed(start.brand) }));
  const [kind, setKind] = useState("invoice");
  const [templates, setTemplates] = useState(() => Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, templateWith(start.templates[k])])));
  const [changed, setChanged] = useState(() => new Set());
  const template = templates[kind];
  const [size, setSize] = useState(template.size);
  const priced = SAMPLES[kind].priced !== false;
  const [palette, setPalette] = useState([]);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("design");

  useEffect(() => {
    if (brand.logo) paletteOf(brand.logo).then(setPalette, () => setPalette([]));
  }, [brand.logo]);
  Object.values(FONTS).forEach(loadFont);

  const fixed = start.brand; // TIN, GST number, registration: kept in Tax settings
  const full = { ...fixed, ...brand, name: brand.name || fixed.legalName };
  const model = compose({ data: sampleFor(full, kind), brand: full, template, size });

  const setB = (k) => (e) => setBrand((b) => ({ ...b, [k]: e?.target ? e.target.value : e }));
  const edit = (fn) => {
    setTemplates((all) => ({ ...all, [kind]: fn(all[kind]) }));
    setChanged((c) => new Set(c).add(kind));
  };
  const setT = (k, v) => edit((t) => ({ ...t, [k]: v }));
  const setIn = (group, k, v) => edit((t) => ({ ...t, [group]: { ...t[group], [k]: v } }));

  async function save() {
    setSaving(true);
    try {
      const { savedAt, ...b } = brand; // eslint-disable-line no-unused-vars
      await apiClient.put("/documents/brand", clean(b));
      for (const k of changed) await apiClient.put(`/documents/templates/${k}`, { template: templates[k] });
      setChanged(new Set());
      await qc.invalidateQueries({ queryKey: ["branding", companyId] });
      toast.success("Saved", "Every document from now on is drawn this way. Invoices and credit notes already issued keep how they looked.");
    } catch (err) {
      toast.error("Could not save", err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Branding and documents"
        description="Your logo, colour and details, set once. Every invoice, quote and order draws from them."
        actions={
          mayChange && (
            <Button onClick={save} disabled={saving} data-testid="save-brand">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save
            </Button>
          )
        }
      />

      <div className="lg:hidden flex gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-4 w-fit">
        {["design", "preview"].map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={cn("h-9 px-5 rounded-full text-[14px] font-medium capitalize", view === v ? "bg-[var(--surface)] shadow-sm text-[var(--ink)]" : "text-[var(--ink-muted)]")}>
            {v}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 items-start">
        <fieldset disabled={!mayChange} className={cn("space-y-4 min-w-0", view === "preview" && "hidden lg:block")}>
          {!mayChange && <p className="text-[13px] text-[var(--ink-muted)]">Only someone who manages settings can change these.</p>}

          <Panel title="Logo and colour">
            <ImagePick label="Logo" value={brand.logo} onChange={setB("logo")} hint="PNG, SVG or JPEG. A transparent PNG or an SVG looks best." testid="logo" />
            <div className="mt-4">
              <p className="text-[13px] font-medium mb-2">Colour{palette.length > 0 && <span className="text-[var(--ink-muted)] font-normal">, from your logo first</span>}</p>
              <div className="flex flex-wrap items-center gap-2">
                {[...palette, ...STARTERS.filter((s) => !palette.includes(s))].slice(0, 10).map((c) => (
                  <button key={c} type="button" onClick={() => setBrand((b) => ({ ...b, accent: c }))} aria-label={`Colour ${c}`} className={cn("h-9 w-9 rounded-full border-2 transition-transform", (brand.accent || "#16181d") === c ? "border-[var(--ink)] scale-110" : "border-transparent")} style={{ background: c }} />
                ))}
                <label className="h-9 px-3 rounded-full border border-[var(--border)] text-[13px] inline-flex items-center gap-2 cursor-pointer">
                  <input type="color" value={brand.accent || "#16181d"} onChange={setB("accent")} className="h-5 w-5 border-0 p-0 bg-transparent" aria-label="Any colour" />
                  Any
                </label>
              </div>
              {brand.accent && readable(brand.accent) !== brand.accent && (
                <p className="text-[12px] text-[var(--ink-muted)] mt-2">Too light for text on white paper, so headings in it are drawn a little darker; bands and fills keep your colour.</p>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[13px] font-medium mb-2">Typeface</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FONTS).map(([k, f]) => (
                  <button key={k} type="button" onClick={() => setBrand((b) => ({ ...b, font: k }))} className={cn("h-11 rounded-xl border text-[15px] px-3 text-left", (brand.font || "barlow") === k ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)]")} style={{ fontFamily: `"${f.family}"` }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Your details on the paper">
            <Field label="Name as it appears" id="b-name">
              <input id="b-name" value={brand.name || ""} onChange={setB("name")} placeholder={fixed.legalName} className={FIELD} />
            </Field>
            <Field label="Line under the name" id="b-tag">
              <input id="b-tag" value={brand.tagline || ""} onChange={setB("tagline")} placeholder="Civil works and equipment hire" className={FIELD} />
            </Field>
            <Field label="Address" id="b-address">
              <textarea id="b-address" value={brand.address || ""} onChange={setB("address")} rows={2} className={TEXTAREA} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" id="b-phone">
                <input id="b-phone" value={brand.phone || ""} onChange={setB("phone")} className={FIELD} />
              </Field>
              <Field label="Email" id="b-email">
                <input id="b-email" value={brand.email || ""} onChange={setB("email")} className={FIELD} />
              </Field>
            </div>
            <Field label="Website" id="b-web">
              <input id="b-web" value={brand.website || ""} onChange={setB("website")} className={FIELD} />
            </Field>
            <p className="text-[12px] text-[var(--ink-muted)]">
              TIN, GST number and registration come from <Link to="/settings?tab=tax" className="underline">Tax settings</Link>, and always print on a tax invoice.
            </p>
          </Panel>

          <Panel title="Stamp and signature">
            <div className="grid grid-cols-2 gap-3">
              <ImagePick label="Stamp" value={brand.stamp} onChange={setB("stamp")} clearPaper hint="A photo on white paper works: the paper is taken out." testid="stamp" />
              <ImagePick label="Signature" value={brand.signature} onChange={setB("signature")} clearPaper hint="Sign on white paper and photograph it." testid="signature" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Signed by" id="b-signatory">
                <input id="b-signatory" value={brand.signatory || ""} onChange={setB("signatory")} className={FIELD} />
              </Field>
              <Field label="Their title" id="b-sigtitle">
                <input id="b-sigtitle" value={brand.signatoryTitle || ""} onChange={setB("signatoryTitle")} placeholder="Managing Director" className={FIELD} />
              </Field>
            </div>
          </Panel>

          <Panel title="Payment and footer">
            <Field label="How to pay you" id="b-pay">
              <textarea id="b-pay" value={brand.paymentDetails ?? fixed.paymentDetails ?? ""} onChange={setB("paymentDetails")} rows={3} placeholder={"Bank of Maldives\nAccount 7730000000000\nAccount name: Your Company Pvt Ltd"} className={TEXTAREA} />
            </Field>
            <Field label="Footer" id="b-footer">
              <textarea id="b-footer" value={brand.footer || ""} onChange={setB("footer")} rows={2} placeholder="Thank you for your business." className={TEXTAREA} />
            </Field>
          </Panel>

          <Panel title="Start from your industry">
            <p className="text-[13px] text-[var(--ink-muted)] -mt-1">Sets layouts, columns and wording for every kind of document at once. Change anything afterwards.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(PRESETS).map(([k, pr]) => (
                <button
                  key={k}
                  type="button"
                  data-testid={`preset-${k}`}
                  onClick={() => {
                    setTemplates((all) => Object.fromEntries(Object.entries(all).map(([kk, t]) => [kk, withPreset(t, pr, kk)])));
                    setChanged(new Set(Object.keys(SAMPLES)));
                    setSize(withPreset(templates[kind], pr, kind).size);
                    toast.success(`${pr.label} applied`, "Every kind of document now starts from it. Save to keep it.");
                  }}
                  className="rounded-xl border border-[var(--border)] p-3 text-left hover:border-[var(--ink)]"
                >
                  <span className="block text-[14px] font-medium">{pr.label}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)] leading-snug mt-0.5">{pr.hint}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Each kind of document">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of document">
              {Object.keys(SAMPLES).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setSize(templates[k].size);
                  }}
                  className={cn("h-9 px-3.5 rounded-full border text-[13px] font-medium", kind === k ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]" : "border-[var(--border)]")}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="text-[13px] font-medium mt-4 mb-2">Layout</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(LAYOUTS).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setT("layout", k)} title={l.hint} className={cn("rounded-xl border p-3 text-left", template.layout === k ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)]")}>
                  <span className="block text-[14px] font-medium">{l.label}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)] leading-snug mt-0.5">{l.hint}</span>
                </button>
              ))}
            </div>
            <Field label="Usual paper" id="t-size">
              <select id="t-size" value={template.size} onChange={(e) => {
                setT("size", e.target.value);
                setSize(e.target.value);
              }} className={FIELD}>
                {Object.entries(SIZES).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-[13px] font-medium mt-4 mb-1.5">Columns</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[["code", "Item code"], ["quantity", "Quantity"], ["unit", "Unit"], priced && ["rate", "Rate"]].filter(Boolean).map(([k, l]) => (
                <Tick key={k} label={l} checked={template.columns[k]} onChange={(v) => setIn("columns", k, v)} />
              ))}
            </div>
            <p className="text-[13px] font-medium mt-4 mb-1.5">On the paper</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[["logo", "Logo"], ["stamp", "Stamp"], ["signature", "Signature"], priced && ["payment", "How to pay"], priced && ["words", "Total in words"], ["footer", "Footer"]].filter(Boolean).map(([k, l]) => (
                <Tick key={k} label={l} checked={template.show[k]} onChange={(v) => setIn("show", k, v)} />
              ))}
            </div>
            <Field label="Title" id="t-title" hint={kind === "invoice" && full.gstRegistered ? "A GST-registered company's invoice always says Tax Invoice; a title here prints under it." : undefined}>
              <input id="t-title" value={template.title} onChange={(e) => setT("title", e.target.value)} placeholder={KIND_LABEL[kind]} className={FIELD} />
            </Field>
            <Field label="Notes" id="t-notes">
              <textarea id="t-notes" value={template.notes} onChange={(e) => setT("notes", e.target.value)} rows={2} placeholder="Please quote the invoice number with your payment." className={TEXTAREA} />
            </Field>
            <Field label="Terms" id="t-terms">
              <textarea id="t-terms" value={template.terms} onChange={(e) => setT("terms", e.target.value)} rows={2} placeholder="Payment within 30 days of the invoice date." className={TEXTAREA} />
            </Field>
            <Field label="Language" id="t-lang" hint={template.language === "en-dv" ? "The Dhivehi labels are suggestions. Have someone who writes Dhivehi every day check them; each can be changed under Rename labels." : undefined}>
              <select id="t-lang" value={template.language} onChange={(e) => setT("language", e.target.value)} className={FIELD}>
                <option value="en">English</option>
                <option value="en-dv">English and Dhivehi</option>
              </select>
            </Field>
            <details className="mt-4">
              <summary className="text-[13px] font-medium cursor-pointer">Rename labels</summary>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {Object.entries(LABELS).map(([k, l]) => (
                  <input key={k} aria-label={`Label for ${l}`} value={template.labels[k] || ""} onChange={(e) => setIn("labels", k, e.target.value)} placeholder={l} className={FIELD.replace("h-11", "h-10")} />
                ))}
              </div>
              {template.language === "en-dv" && (
                <>
                  <p className="text-[13px] font-medium mt-4 mb-2">In Dhivehi</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(DV_LABELS).map(([k, d]) => (
                      <input key={k} dir="rtl" lang="dv" aria-label={`Dhivehi label for ${LABELS[k]}`} value={template.dvLabels[k] || ""} onChange={(e) => setIn("dvLabels", k, e.target.value)} placeholder={d} className={FIELD.replace("h-11", "h-10")} style={{ fontFamily: "\"Noto Sans Thaana\", sans-serif" }} />
                    ))}
                  </div>
                </>
              )}
            </details>
          </Panel>
        </fieldset>

        <div className={cn("lg:sticky lg:top-4 min-w-0", view === "design" && "hidden lg:block")}>
          <div className="flex flex-wrap gap-1 p-1 rounded-full bg-[var(--surface-2)] mb-3 w-fit" role="group" aria-label="Preview size">
            {Object.entries(SIZES).map(([k, s]) => (
              <button key={k} type="button" onClick={() => setSize(k)} className={cn("h-8 px-3.5 rounded-full text-[13px] font-medium", size === k ? "bg-[var(--surface)] shadow-sm text-[var(--ink)]" : "text-[var(--ink-muted)]")}>
                {s.label.replace("Receipt ", "")}
              </button>
            ))}
          </div>
          <div className={cn("rounded-2xl bg-[var(--surface-2)] p-3 sm:p-5 lg:max-h-[calc(100vh-140px)] overflow-auto", model.size.receipt && "flex justify-center")} data-testid="brand-preview">
            <div className={model.size.receipt ? "w-[300px]" : ""}>
              <FittedPaper model={model} />
            </div>
          </div>
          <p className="text-[12px] text-[var(--ink-muted)] mt-2">A made-up {KIND_LABEL[kind].toLowerCase()}, drawn exactly as yours will be.</p>
        </div>
      </div>
    </div>
  );
}

/** The sample, with or without GST as this company would charge it. */
function sampleFor(brand, kind) {
  const s = { ...SAMPLES[kind], status: SAMPLES[kind].status === "draft" ? "posted" : SAMPLES[kind].status };
  if (brand.gstRegistered || s.priced === false || kind === "purchase_order") return s;
  return { ...s, gstTreatment: "none_unregistered", gstRatePercent: null, priceNote: null, totals: { ...s.totals, tax: "0.00", gross: s.totals.net } };
}

/** The old profile's details, the first time; its logo only if it is an image we can keep. */
function earlierOf(e) {
  if (!e) return {};
  const { logo, ...rest } = e;
  const out = Object.fromEntries(Object.entries(rest).filter(([, v]) => v));
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo || "")) out.logo = logo;
  return out;
}

const FIXED = ["legalName", "registrationNo", "tin", "gstNumber", "gstRegistered", "baseCurrency"];
function stripFixed(b) {
  const out = { ...b };
  FIXED.forEach((k) => delete out[k]);
  return out;
}
function clean(b) {
  const out = {};
  for (const [k, v] of Object.entries(stripFixed(b))) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, id, hint, children }) {
  return (
    <div className="mt-3 first:mt-0">
      <label htmlFor={id} className="block text-[13px] font-medium mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function Tick({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 text-[14px] cursor-pointer">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function ImagePick({ label, value, onChange, hint, clearPaper = false, testid }) {
  const input = useRef(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium mb-1.5">{label}</p>
      <div className="flex items-center gap-3">
        <div className="h-16 w-24 shrink-0 rounded-xl border border-dashed border-[var(--border)] bg-[repeating-conic-gradient(#f1f2f4_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden">
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-[var(--ink-muted)]">None</span>}
        </div>
        <div className="flex flex-col items-start gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            data-testid={`${testid}-file`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                onChange(await prepare(file, { max: clearPaper ? 600 : 800, clearPaper }));
              } catch (err) {
                toast.error("Could not use that image", err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="text-[12px] text-[var(--danger)] font-medium inline-flex items-center gap-1 px-1">
              <X size={12} /> Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-[12px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
