import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, X, Check, Copy, Trash2, PenLine, Pencil, Palette, Building2, Landmark, Factory, Stamp, FileText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { SignaturePad } from "@/components/documents/SignaturePad";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import {
  compose, withPreset, libraryOf, resolve, designTemplate, designName,
  SIZES, DESIGNS, DESIGN_KEYS, FONTS, LABELS, DV_LABELS, PRESETS, SAMPLES, KIND_LABEL, QR_KINDS, readable, loadFont,
} from "@/lib/documents";
import { prepare, paletteOf } from "@/lib/images";
import { FIELD } from "@/lib/shipments";
import { cn } from "@/lib/utils";

/**
 * The brand kit and every kind of document, set up in one workspace: what
 * to change on the left, a short form in the middle, the paper on the right,
 * drawn as it changes. Nothing on the page scrolls away from the paper.
 *
 * Each kind of document chooses a design. The ready-made ones stay as they
 * are; changing one keeps a copy as the company's own, so a good starting
 * point is never lost and a company can hold several of its own side by side.
 * The sample documents are made up: nothing on them is anyone's business.
 */

const STARTERS = ["#16181d", "#0b5cad", "#0f7b6c", "#b4262d", "#c8741a", "#5b3fa8"];
const TEXTAREA = FIELD.replace("h-11", "min-h-[84px] py-2.5");
const MAX_COPIES = 12;
const newId = () => crypto.randomUUID().slice(0, 8);

const BRAND = [
  { id: "identity", label: "Logo, colour and type", icon: Palette },
  { id: "details", label: "Company details", icon: Building2 },
  { id: "sign", label: "Signature and stamp", icon: Stamp },
  { id: "payment", label: "Payment and footer", icon: Landmark },
  { id: "industry", label: "Start from your industry", icon: Factory },
];
const GROUPS = [
  { label: "Sales", kinds: ["quote", "sales_order", "invoice", "credit_note", "delivery_note"] },
  { label: "Purchases", kinds: ["purchase_order", "goods_received"] },
];
const TABS = [
  ["design", "Design"],
  ["content", "What shows"],
  ["wording", "Wording"],
];

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
  return <Workspace key={companyId} start={data} mayChange={can("manage_settings")} />;
}

function Workspace({ start, mayChange }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [brand, setBrand] = useState(() => ({ ...earlierOf(start.earlier), ...stripFixed(start.brand) }));
  const [libs, setLibs] = useState(() => Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, libraryOf(start.templates[k])])));
  const [changed, setChanged] = useState(() => new Set());
  const [brandDirty, setBrandDirty] = useState(false);
  const [section, setSection] = useState("identity");
  const [kind, setKind] = useState("invoice");
  const [tab, setTab] = useState("design");
  const [size, setSize] = useState(null);
  const [view, setView] = useState("edit");
  const [palette, setPalette] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (brand.logo) paletteOf(brand.logo).then(setPalette, () => setPalette([]));
  }, [brand.logo]);
  Object.values(FONTS).forEach(loadFont);

  const dirty = brandDirty || changed.size > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    const stay = (e) => e.preventDefault();
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [dirty]);

  const fixed = start.brand; // TIN, GST number, registration: kept in Tax settings
  const full = { ...fixed, ...brand, name: brand.name || fixed.legalName };
  const lib = libs[kind];
  const template = resolve(lib);
  const model = compose({ data: sampleFor(full, kind), brand: full, template, size: size || template.size, verifyUrl: `${window.location.origin}/v/sample` });
  const onKind = section.startsWith("kind:");

  const setB = (k) => (e) => {
    setBrand((b) => ({ ...b, [k]: e?.target ? e.target.value : e }));
    setBrandDirty(true);
  };
  const setLib = (k, next) => {
    setLibs((all) => ({ ...all, [k]: next }));
    setChanged((c) => new Set(c).add(k));
  };
  const openKind = (k) => {
    setSection("kind:" + k);
    setKind(k);
    setSize(null);
  };

  /** A new copy of what a kind has in use (or of a given design), put in use. */
  function copyOf(k, from, settings, name) {
    const l = libs[k];
    if (l.copies.length >= MAX_COPIES) {
      toast.error("That is the most there can be", `Up to ${MAX_COPIES} designs of your own for each kind of document. Delete one first.`);
      return null;
    }
    const id = newId();
    return { inUse: "copy:" + id, copies: [...l.copies, { id, name: unique(l.copies, name), from, settings }] };
  }

  /** Change the kind's design in use. A ready-made one is copied first and left as it was. */
  function edit(fn) {
    let l = lib;
    if (!l.inUse.startsWith("copy:")) {
      const label = DESIGNS[l.inUse]?.label || "Design";
      l = copyOf(kind, l.inUse, resolve(l), `${label}, yours`);
      if (!l) return;
      toast.success(`Kept as your own: ${l.copies.at(-1).name}`, `The ready-made ${label} stays as it was.`);
    }
    setLib(kind, { ...l, copies: l.copies.map((c) => ("copy:" + c.id === l.inUse ? { ...c, settings: fn(templateOfCopy(c)) } : c)) });
  }
  const setT = (k, v) => edit((t) => ({ ...t, [k]: v }));
  const setIn = (group, k, v) => edit((t) => ({ ...t, [group]: { ...t[group], [k]: v } }));

  function everyKind() {
    const source = template;
    const name = designName(lib);
    const next = { ...libs };
    for (const k of Object.keys(SAMPLES)) {
      if (k === kind) continue;
      if (!lib.inUse.startsWith("copy:")) {
        next[k] = { ...next[k], inUse: lib.inUse };
        continue;
      }
      // A copy carries the design across; each kind keeps its own title, notes and terms.
      const own = resolve(next[k]);
      const settings = { ...own, ...Object.fromEntries(DESIGN_KEYS.map((key) => [key, source[key]])) };
      const existing = next[k].copies.find((c) => c.name === name);
      if (existing) next[k] = { inUse: "copy:" + existing.id, copies: next[k].copies.map((c) => (c === existing ? { ...c, settings } : c)) };
      else if (next[k].copies.length < MAX_COPIES) {
        const id = newId();
        next[k] = { inUse: "copy:" + id, copies: [...next[k].copies, { id, name, from: source.layout, settings }] };
      }
    }
    setLibs(next);
    setChanged(new Set(Object.keys(SAMPLES)));
    toast.success(`${name} on every document`, "Titles, notes and terms stay as each kind had them. Save to keep it.");
  }

  function applyPreset(pr) {
    const next = {};
    for (const k of Object.keys(SAMPLES)) {
      const l = libs[k];
      const settings = withPreset(resolve(l), pr, k);
      const existing = l.copies.find((c) => c.name === pr.label);
      if (existing) next[k] = { inUse: "copy:" + existing.id, copies: l.copies.map((c) => (c === existing ? { ...c, settings } : c)) };
      else {
        const id = newId();
        next[k] = l.copies.length < MAX_COPIES ? { inUse: "copy:" + id, copies: [...l.copies, { id, name: pr.label, from: settings.layout, settings }] } : l;
      }
    }
    setLibs(next);
    setChanged(new Set(Object.keys(SAMPLES)));
    setSize(null);
    toast.success(`${pr.label} applied`, `Every kind of document now uses a copy called ${pr.label}. Save to keep it.`);
  }

  async function save() {
    setSaving(true);
    try {
      if (brandDirty) {
        const { savedAt, ...b } = brand; // eslint-disable-line no-unused-vars
        await apiClient.put("/documents/brand", clean(b));
      }
      for (const k of changed) await apiClient.put(`/documents/templates/${k}`, { template: { ...libs[k], resolved: resolve(libs[k]) } });
      setChanged(new Set());
      setBrandDirty(false);
      await qc.invalidateQueries({ queryKey: ["branding", companyId] });
      toast.success("Saved", "Every document from now on is drawn this way. Invoices and credit notes already issued keep how they looked.");
    } catch (err) {
      toast.error("Could not save", err.message);
    } finally {
      setSaving(false);
    }
  }

  const where = onKind ? KIND_LABEL[kind] : BRAND.find((b) => b.id === section)?.label;

  return (
    <div>
      <PageHeader
        title="Branding and documents"
        description="Your brand once, then a design for each kind of document. The paper on the right is drawn as you change things."
        actions={
          mayChange && (
            <div className="flex items-center gap-3">
              {dirty && <span className="text-[13px] text-[var(--ink-muted)]" data-testid="unsaved">Not saved yet</span>}
              <Button variant="accent" onClick={save} disabled={saving || !dirty} data-testid="save-brand">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save
              </Button>
            </div>
          )
        }
      />

      {/* Under a desk width: what to change as one list, and the paper a tap away. */}
      <div className="lg:hidden sticky top-0 z-10 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-2 mb-4 bg-[var(--bg)] flex items-center gap-2">
        <select aria-label="What to change" value={section} onChange={(e) => (e.target.value.startsWith("kind:") ? openKind(e.target.value.slice(5)) : setSection(e.target.value))} className={cn(FIELD, "flex-1 min-w-0")}>
          <optgroup label="Your brand">
            {BRAND.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.kinds.map((k) => (
                <option key={k} value={"kind:" + k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex shrink-0 p-1 rounded-full bg-[var(--surface-2)]" role="group" aria-label="Show">
          {[
            ["edit", "Edit"],
            ["preview", "Paper"],
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("h-9 px-4 rounded-full text-[14px] font-medium", view === v ? "bg-[var(--surface)] shadow-sm text-[var(--ink)]" : "text-[var(--ink-muted)]")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[208px_minmax(340px,420px)_minmax(0,1fr)] lg:gap-5 lg:h-[calc(100dvh-216px)] lg:min-h-[600px]">
        {/* ---- what to change */}
        <nav aria-label="Brand and documents" className="hidden lg:block overflow-y-auto pr-1 -ml-1 pl-1">
          <NavGroup label="Your brand" note="On every document">
            {BRAND.map((b) => (
              <NavItem key={b.id} icon={b.icon} active={section === b.id} onClick={() => setSection(b.id)} label={b.label} />
            ))}
          </NavGroup>
          {GROUPS.map((g) => (
            <NavGroup key={g.label} label={g.label}>
              {g.kinds.map((k) => (
                <NavItem key={k} icon={FileText} active={section === "kind:" + k} onClick={() => openKind(k)} label={KIND_LABEL[k]} sub={designName(libs[k])} dot={changed.has(k)} testid={`kind-${k}`} />
              ))}
            </NavGroup>
          ))}
        </nav>

        {/* ---- the form */}
        <section className={cn("rounded-[14px] border border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col lg:min-h-0", view === "preview" && "hidden lg:flex")} aria-label={where}>
          <header className="px-5 pt-4 border-b border-[var(--border)]">
            <h2 className="font-display text-[19px] font-semibold tracking-tight">{where}</h2>
            <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 pb-3">
              {onKind ? (
                <>
                  Using <b className="font-semibold text-[var(--ink)]">{designName(lib)}</b>
                  {!lib.inUse.startsWith("copy:") && " · ready-made; a change keeps your own copy"}
                </>
              ) : (
                "Part of your brand: it is the same on every kind of document."
              )}
            </p>
            {onKind && (
              <div className="flex gap-5 -mb-px" role="tablist">
                {TABS.map(([id, l]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("h-10 text-[14px] font-medium border-b-2", tab === id ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </header>
          <fieldset disabled={!mayChange} className="p-5 lg:flex-1 lg:overflow-y-auto min-w-0 space-y-5">
            {!mayChange && <p className="text-[13px] text-[var(--ink-muted)]">Only someone who manages settings can change these.</p>}

            {section === "identity" && (
              <>
                <ImagePick label="Logo" value={brand.logo} onChange={setB("logo")} hint="PNG, SVG or JPEG. A transparent PNG or an SVG looks best." testid="logo" />
                <div>
                  <p className="text-[13px] font-medium mb-2">Colour{palette.length > 0 && <span className="text-[var(--ink-muted)] font-normal">, from your logo first</span>}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {[...palette, ...STARTERS.filter((s) => !palette.includes(s))].slice(0, 10).map((c) => (
                      <button key={c} type="button" onClick={() => setB("accent")(c)} aria-label={`Colour ${c}`} aria-pressed={(brand.accent || "#16181d") === c} className={cn("h-9 w-9 rounded-full border-2 transition-transform", (brand.accent || "#16181d") === c ? "border-[var(--ink)] scale-110" : "border-transparent")} style={{ background: c }} />
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
                <div>
                  <p className="text-[13px] font-medium mb-2">Typeface</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(FONTS).map(([k, f]) => (
                      <button key={k} type="button" onClick={() => setB("font")(k)} aria-pressed={(brand.font || "barlow") === k} className={cn("h-11 rounded-[10px] border text-[15px] px-3 text-left", (brand.font || "barlow") === k ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)]")} style={{ fontFamily: `"${f.family}"` }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === "details" && (
              <>
                <Field label="Name as it appears" id="b-name">
                  <input id="b-name" value={brand.name || ""} onChange={setB("name")} placeholder={fixed.legalName} className={FIELD} />
                </Field>
                <Field label="Line under the name" id="b-tag">
                  <input id="b-tag" value={brand.tagline || ""} onChange={setB("tagline")} placeholder="Civil works and equipment hire" className={FIELD} />
                </Field>
                <Field label="Address" id="b-address">
                  <textarea id="b-address" value={brand.address || ""} onChange={setB("address")} rows={2} className={TEXTAREA} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Phone" id="b-phone">
                    <input id="b-phone" value={brand.phone || ""} onChange={setB("phone")} inputMode="tel" className={FIELD} />
                  </Field>
                  <Field label="Email" id="b-email">
                    <input id="b-email" value={brand.email || ""} onChange={setB("email")} inputMode="email" className={FIELD} />
                  </Field>
                </div>
                <Field label="Website" id="b-web">
                  <input id="b-web" value={brand.website || ""} onChange={setB("website")} placeholder="www.example.mv" className={FIELD} />
                </Field>
                <p className="text-[12px] text-[var(--ink-muted)]">
                  TIN, GST number and registration come from <Link to="/settings?tab=tax" className="underline">Tax settings</Link>, and always print on a tax invoice.
                </p>
              </>
            )}

            {section === "sign" && (
              <>
                <SignatureField value={brand.signature} onChange={setB("signature")} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Signed by" id="b-signatory">
                    <input id="b-signatory" value={brand.signatory || ""} onChange={setB("signatory")} className={FIELD} />
                  </Field>
                  <Field label="Their title" id="b-sigtitle">
                    <input id="b-sigtitle" value={brand.signatoryTitle || ""} onChange={setB("signatoryTitle")} placeholder="Managing Director" className={FIELD} />
                  </Field>
                </div>
                <ImagePick label="Company stamp" value={brand.stamp} onChange={setB("stamp")} clearPaper hint="Stamp a white sheet and photograph it: the paper is taken out." testid="stamp" />
                <p className="text-[12px] text-[var(--ink-muted)]">Which documents carry them is set per kind, under What shows.</p>
              </>
            )}

            {section === "payment" && (
              <>
                <Field label="How to pay you" id="b-pay" hint="Prints on invoices, quotes and sales orders. A QR code can carry it too.">
                  <textarea id="b-pay" value={brand.paymentDetails ?? fixed.paymentDetails ?? ""} onChange={setB("paymentDetails")} rows={4} placeholder={"Bank of Maldives\nAccount 7730000000000\nAccount name: Your Company Pvt Ltd"} className={TEXTAREA} />
                </Field>
                <Field label="Footer" id="b-footer">
                  <textarea id="b-footer" value={brand.footer || ""} onChange={setB("footer")} rows={2} placeholder="Thank you for your business." className={TEXTAREA} />
                </Field>
              </>
            )}

            {section === "industry" && (
              <>
                <p className="text-[13px] text-[var(--ink-muted)]">Sets designs, columns and wording for every kind of document at once, as copies of your own called by the industry. Change anything afterwards; the designs you had are still there.</p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(PRESETS).map(([k, pr]) => (
                    <button key={k} type="button" data-testid={`preset-${k}`} onClick={() => applyPreset(pr)} className="rounded-[10px] border border-[var(--border)] p-3 text-left hover:border-[var(--ink)]">
                      <span className="block text-[14px] font-medium">{pr.label}</span>
                      <span className="block text-[12px] text-[var(--ink-muted)] leading-snug mt-0.5">{pr.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {onKind && tab === "design" && (
              <DesignTab kind={kind} lib={lib} full={full} onPick={(inUse) => setLib(kind, { ...lib, inUse })} onLib={(l) => setLib(kind, l)} copyOf={copyOf} template={template} setT={setT} setSize={setSize} everyKind={everyKind} />
            )}

            {onKind && tab === "content" && (
              <>
                <div>
                  <p className="text-[13px] font-medium mb-2">Columns</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {[["code", "Item code"], ["quantity", "Quantity"], ["unit", "Unit"], SAMPLES[kind].priced !== false && ["rate", "Rate"]].filter(Boolean).map(([k, l]) => (
                      <Tick key={k} label={l} checked={template.columns[k]} onChange={(v) => setIn("columns", k, v)} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-medium mb-2">On the paper</p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {[["logo", "Logo"], ["signature", "Signature"], ["stamp", "Stamp"], SAMPLES[kind].priced !== false && ["payment", "How to pay"], SAMPLES[kind].priced !== false && ["words", "Total in words"], ["footer", "Footer"]].filter(Boolean).map(([k, l]) => (
                      <Tick key={k} label={l} checked={template.show[k]} onChange={(v) => setIn("show", k, v)} />
                    ))}
                  </div>
                </div>
                <Field label="QR code" id="t-qr" hint={qrHint(template.qr, kind, full)}>
                  <select id="t-qr" value={template.qr} onChange={(e) => setT("qr", e.target.value)} className={FIELD}>
                    {Object.entries(QR_KINDS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {onKind && tab === "wording" && (
              <>
                <Field label="Title" id="t-title" hint={kind === "invoice" && full.gstRegistered ? "A GST-registered company's invoice always says Tax Invoice; a title here prints under it." : undefined}>
                  <input id="t-title" value={template.title} onChange={(e) => setT("title", e.target.value)} placeholder={KIND_LABEL[kind]} className={FIELD} />
                </Field>
                <Field label="Notes" id="t-notes">
                  <textarea id="t-notes" value={template.notes} onChange={(e) => setT("notes", e.target.value)} rows={2} placeholder="Please quote the number with your payment." className={TEXTAREA} />
                </Field>
                <Field label="Terms" id="t-terms">
                  <textarea id="t-terms" value={template.terms} onChange={(e) => setT("terms", e.target.value)} rows={2} placeholder="Payment within 30 days of the date above." className={TEXTAREA} />
                </Field>
                <Field label="Language" id="t-lang" hint={template.language === "en-dv" ? "The Dhivehi labels are suggestions. Have someone who writes Dhivehi every day check them; each can be changed below." : undefined}>
                  <select id="t-lang" value={template.language} onChange={(e) => setT("language", e.target.value)} className={FIELD}>
                    <option value="en">English</option>
                    <option value="en-dv">English and Dhivehi</option>
                  </select>
                </Field>
                <details>
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
              </>
            )}
          </fieldset>
        </section>

        {/* ---- the paper */}
        <div className={cn("lg:flex lg:flex-col lg:min-h-0 min-w-0", view === "edit" && "hidden lg:flex")}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select aria-label="Document shown" value={kind} onChange={(e) => (onKind ? openKind(e.target.value) : (setKind(e.target.value), setSize(null)))} className={FIELD.replace("w-full", "w-auto").replace("h-11", "h-9")}>
              {Object.keys(SAMPLES).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1 p-1 rounded-full bg-[var(--surface-2)] ml-auto" role="group" aria-label="Preview size">
              {Object.entries(SIZES).map(([k, s]) => (
                <button key={k} type="button" onClick={() => setSize(k)} aria-pressed={(size || template.size) === k} className={cn("h-8 px-3 rounded-full text-[13px] font-medium", (size || template.size) === k ? "bg-[var(--surface)] shadow-sm text-[var(--ink)]" : "text-[var(--ink-muted)]")}>
                  {s.label.replace("Receipt ", "")}
                </button>
              ))}
            </div>
          </div>
          <div className={cn("rounded-[14px] bg-[var(--surface-2)] p-3 sm:p-6 lg:flex-1 lg:overflow-auto", model.size.receipt && "flex justify-center items-start")} data-testid="brand-preview">
            <div className={model.size.receipt ? "w-[300px]" : "max-w-[760px] mx-auto"}>
              <FittedPaper model={model} />
            </div>
          </div>
          <p className="text-[12px] text-[var(--ink-muted)] mt-2">A made-up {KIND_LABEL[kind].toLowerCase()}, drawn exactly as yours will be.</p>
        </div>
      </div>
    </div>
  );
}

/** The designs a kind can use: ready-made ones, and the company's own copies. */
function DesignTab({ kind, lib, full, onPick, onLib, copyOf, template, setT, setSize, everyKind }) {
  const [renaming, setRenaming] = useState(null);
  const sample = sampleFor(full, kind);
  const thumb = (t) => compose({ data: sample, brand: full, template: t, size: "a4" });
  const copy = (from, settings, name) => {
    const l = copyOf(kind, from, settings, name);
    if (l) onLib(l);
  };
  return (
    <>
      {lib.copies.length > 0 && (
        <div>
          <p className="text-[13px] font-medium mb-2">Your designs</p>
          <div className="grid grid-cols-2 gap-3">
            {lib.copies.map((c) => {
              const id = "copy:" + c.id;
              return (
                <Card key={c.id} model={thumb(templateOfCopy(c))} name={c.name} inUse={lib.inUse === id} onPick={() => onPick(id)} testid={`design-${c.id}`}>
                  {renaming === c.id ? (
                    <input
                      autoFocus
                      aria-label="Name of this design"
                      defaultValue={c.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim().slice(0, 60) || c.name;
                        onLib({ ...lib, copies: lib.copies.map((x) => (x.id === c.id ? { ...x, name } : x)) });
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className={FIELD.replace("h-11", "h-8").replace("w-full", "w-full text-[13px]")}
                    />
                  ) : (
                    <div className="flex items-center gap-0.5 -mr-1.5">
                      <IconButton label={`Rename ${c.name}`} onClick={() => setRenaming(c.id)} icon={Pencil} />
                      <IconButton label={`Copy ${c.name}`} onClick={() => copy(c.from, templateOfCopy(c), `${c.name}, copy`)} icon={Copy} />
                      <IconButton
                        label={`Delete ${c.name}`}
                        icon={Trash2}
                        onClick={() => {
                          const copies = lib.copies.filter((x) => x.id !== c.id);
                          onLib({ inUse: lib.inUse === id ? c.from && DESIGNS[c.from] ? c.from : "classic" : lib.inUse, copies });
                        }}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <p className="text-[13px] font-medium mb-2">Ready-made</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(DESIGNS).map(([id, d]) => (
            <Card key={id} model={thumb(designTemplate(id))} name={d.label} hint={d.hint} light={d.light} inUse={lib.inUse === id} onPick={() => onPick(id)} testid={`design-${id}`}>
              <IconButton label={`Copy ${d.label} to make it your own`} onClick={() => copy(id, designTemplate(id), `${d.label}, yours`)} icon={Copy} />
            </Card>
          ))}
        </div>
      </div>
      <Field label="Usual paper" id="t-size">
        <select
          id="t-size"
          value={template.size}
          onChange={(e) => {
            setT("size", e.target.value);
            setSize(null);
          }}
          className={FIELD}
        >
          {Object.entries(SIZES).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Button type="button" variant="outline" onClick={everyKind} className="w-full">
        Use {designName(lib)} on every kind of document
      </Button>
    </>
  );
}

function Card({ model, name, hint, light, inUse, onPick, children, testid }) {
  return (
    <div className={cn("rounded-[10px] border p-2 min-w-0", inUse ? "border-[var(--ink)] ring-1 ring-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink-muted)]")}>
      <button type="button" onClick={onPick} aria-pressed={inUse} title={hint} className="block w-full text-left" data-testid={testid}>
        <div className="h-[118px] overflow-hidden rounded-md border border-[var(--border)] bg-white pointer-events-none" aria-hidden="true">
          <FittedPaper model={model} />
        </div>
      </button>
      <button type="button" onClick={onPick} className="block w-full text-left mt-2 text-[13px] font-medium truncate" title={name}>
        {name}
      </button>
      <div className="flex items-center gap-1 min-h-8 -mb-1">
        <span className={cn("flex-1 text-[12px] truncate", inUse ? "text-[var(--ink)] font-medium" : "text-[var(--ink-muted)]")}>{inUse ? "In use" : light ? "Light" : ""}</span>
        {children}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function NavGroup({ label, note, children }) {
  return (
    <div className="mb-4">
      <p className="px-3 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
        {label}
        {note && <span className="normal-case tracking-normal font-sans font-normal">, {note.toLowerCase()}</span>}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function NavItem({ icon: Icon, label, sub, active, onClick, dot, testid }) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} data-testid={testid} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-left", active ? "bg-[var(--ink)] text-[var(--surface)]" : "hover:bg-[var(--surface-2)]")}>
      <Icon size={16} aria-hidden="true" className={cn("shrink-0", active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]")} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium truncate">{label}</span>
        {sub && <span className={cn("block text-[12px] truncate", active ? "opacity-75" : "text-[var(--ink-muted)]")}>{sub}</span>}
      </span>
      {dot && <span className="h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" aria-label="Changed, not saved" />}
    </button>
  );
}

function qrHint(qr, kind, brand) {
  if (qr === "verify") return ["invoice", "credit_note"].includes(kind) ? "Once issued, the code opens a page that confirms it came from you, unchanged. Drafts carry none." : "Only invoices and credit notes are kept as issued, so only they can carry this code.";
  if (qr === "pay") return brand.paymentDetails ? "Carries your payment details, so a phone can copy the account number." : "Add how to pay you under Payment and footer first.";
  if (qr === "website") return brand.website ? `Opens ${brand.website}.` : "Add your website under Company details first.";
  return undefined;
}

/** "Minimal, yours", then "Minimal, yours 2": two copies never share a name. */
function unique(copies, name) {
  const taken = new Set(copies.map((c) => c.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n += 1;
  return `${name} ${n}`;
}

/** A copy's settings as a full template. */
function templateOfCopy(c) {
  return resolve({ inUse: "copy:" + c.id, copies: [c] });
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

function Field({ label, id, hint, children }) {
  return (
    <div>
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
    <label className="inline-flex items-center gap-2 text-[14px] cursor-pointer min-h-8">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
      {label}
    </label>
  );
}

/** Draw it here, or photograph one signed on paper. */
function SignatureField({ value, onChange }) {
  const [drawing, setDrawing] = useState(false);
  if (drawing)
    return (
      <div>
        <p className="text-[13px] font-medium mb-1.5">Signature</p>
        <SignaturePad
          onCancel={() => setDrawing(false)}
          onDone={(png) => {
            onChange(png);
            setDrawing(false);
          }}
        />
      </div>
    );
  return (
    <ImagePick label="Signature" value={value} onChange={onChange} clearPaper hint="Sign here with a finger or mouse, or sign white paper and photograph it." testid="signature">
      <Button type="button" variant="outline" onClick={() => setDrawing(true)} data-testid="draw-signature">
        <PenLine size={14} /> Sign here
      </Button>
    </ImagePick>
  );
}

function ImagePick({ label, value, onChange, hint, clearPaper = false, testid, children }) {
  const input = useRef(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-20 w-32 shrink-0 rounded-[10px] border border-dashed border-[var(--border)] bg-[repeating-conic-gradient(#f1f2f4_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden">
          {value ? <img src={value} alt={`${label} as it prints`} className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-[var(--ink-muted)]">None yet</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {children}
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="h-10 text-[13px] text-[var(--danger)] font-medium inline-flex items-center gap-1 px-1">
              <X size={13} /> Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-[12px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
