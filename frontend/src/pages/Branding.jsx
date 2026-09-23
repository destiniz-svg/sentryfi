import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, X, Check, Copy, Trash2, PenLine, Pencil, ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";

/**
 * The brand kit and every kind of document, set up beside the paper.
 *
 * Two panes, as a form beside what it makes: on the left one question at a
 * time (what are you editing, then a few tabs), on the right the paper, drawn
 * as it changes and never scrolled away. Saving sits in a quiet bar along the
 * foot, with a way to undo everything since the last save.
 *
 * Each kind of document chooses a design. The ready-made ones stay as they
 * are; changing one keeps a copy as the company's own, so a good starting
 * point is never lost and a company can hold several of its own side by side.
 * The sample documents are made up: nothing on them is anyone's business.
 */

const STARTERS = ["#16181d", "#0b5cad", "#0f7b6c", "#b4262d", "#c8741a", "#5b3fa8"];
const MAX_COPIES = 12;
const newId = () => crypto.randomUUID().slice(0, 8);

const BRAND_TABS = [
  ["identity", "Look"],
  ["details", "Details"],
  ["sign", "Signature"],
  ["payment", "Payment"],
  ["industry", "Industry"],
];
const KIND_TABS = [
  ["design", "Design"],
  ["content", "What shows"],
  ["wording", "Wording"],
];
const GROUPS = [
  { label: "Sales documents", kinds: ["quote", "sales_order", "invoice", "credit_note", "delivery_note"] },
  { label: "Purchase documents", kinds: ["purchase_order", "goods_received"] },
];

export default function Branding() {
  const { companyId, can } = useCompany();
  const [round, setRound] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["branding", companyId, "all"],
    queryFn: async () => {
      const [b, t] = await Promise.all([apiClient.get("/documents/brand"), apiClient.get("/documents/templates")]);
      return { ...b.data, templates: t.data.templates };
    },
    enabled: Boolean(companyId),
  });
  if (isLoading || !data) return <Skeleton className="h-[80vh] rounded-2xl" />;
  return <Workspace key={`${companyId}:${round}`} start={data} mayChange={can("manage_settings")} onUndo={() => setRound((r) => r + 1)} />;
}

function Workspace({ start, mayChange, onUndo }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [brand, setBrand] = useState(() => ({ ...earlierOf(start.earlier), ...stripFixed(start.brand) }));
  const [libs, setLibs] = useState(() => Object.fromEntries(Object.keys(SAMPLES).map((k) => [k, libraryOf(start.templates[k])])));
  const [changed, setChanged] = useState(() => new Set());
  const [brandDirty, setBrandDirty] = useState(false);
  const [target, setTarget] = useState("brand");
  const [kind, setKind] = useState("invoice");
  const [brandTab, setBrandTab] = useState("identity");
  const [kindTab, setKindTab] = useState("design");
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
  const onKind = target !== "brand";
  const tab = onKind ? kindTab : brandTab;
  const priced = SAMPLES[kind].priced !== false;

  const setB = (k) => (e) => {
    setBrand((b) => ({ ...b, [k]: e?.target ? e.target.value : e }));
    setBrandDirty(true);
  };
  const setLib = (k, next) => {
    setLibs((all) => ({ ...all, [k]: next }));
    setChanged((c) => new Set(c).add(k));
  };
  const choose = (value) => {
    setTarget(value);
    if (value !== "brand") {
      setKind(value);
      setSize(null);
    }
  };

  /** A new copy of a design, put in use. */
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
      const settings = { ...resolve(next[k]), ...Object.fromEntries(DESIGN_KEYS.map((key) => [key, source[key]])) };
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

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] lg:overflow-hidden lg:grid lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] lg:h-[calc(100dvh-128px)] lg:min-h-[620px]">
      {/* ---- the form */}
      <section className={cn("lg:flex lg:flex-col lg:min-h-0 lg:border-r lg:border-[var(--border)]", view === "preview" && "hidden lg:flex")} aria-label="Edit">
        <header className="px-5 sm:px-7 pt-6 border-b border-[var(--border)]">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight">Branding and documents</h1>
            <ViewSwitch view={view} setView={setView} />
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1">Your brand once, then a design for each kind of document.</p>
          <div className="mt-5">
            <Box label="Editing" id="b-target">
              <select id="b-target" value={target} onChange={(e) => choose(e.target.value)} className={SELECT} data-testid="editing">
                <option value="brand">Your brand, on every document</option>
                {GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.kinds.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]} · {designName(libs[k])}
                        {changed.has(k) ? " · not saved" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Box>
          </div>
          <div className="flex gap-5 mt-3 -mb-px overflow-x-auto" role="tablist">
            {(onKind ? KIND_TABS : BRAND_TABS).map(([id, l]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => (onKind ? setKindTab(id) : setBrandTab(id))}
                className={cn("h-11 shrink-0 text-[14px] font-medium border-b-2 transition-colors", tab === id ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]")}
              >
                {l}
              </button>
            ))}
          </div>
        </header>

        <fieldset disabled={!mayChange} className="px-5 sm:px-7 py-6 lg:flex-1 lg:overflow-y-auto min-w-0 space-y-7">
          {!mayChange && <p className="text-[13px] text-[var(--ink-muted)]">Only someone who manages settings can change these.</p>}

          {!onKind && tab === "identity" && (
            <>
              <Group title="Logo">
                <ImagePick label="Logo" value={brand.logo} onChange={setB("logo")} hint="PNG, SVG or JPEG. A transparent PNG or an SVG looks best." testid="logo" />
              </Group>
              <Group title="Colour" note={palette.length > 0 ? "from your logo first" : undefined}>
                <div className="flex flex-wrap items-center gap-2">
                  {[...palette, ...STARTERS.filter((s) => !palette.includes(s))].slice(0, 10).map((c) => (
                    <button key={c} type="button" onClick={() => setB("accent")(c)} aria-label={`Colour ${c}`} aria-pressed={(brand.accent || "#16181d") === c} className={cn("h-9 w-9 rounded-full border-2 transition-transform", (brand.accent || "#16181d") === c ? "border-[var(--ink)] scale-110" : "border-transparent")} style={{ background: c }} />
                  ))}
                  <label className="h-9 px-3 rounded-full bg-[var(--surface-2)] text-[13px] inline-flex items-center gap-2 cursor-pointer">
                    <input type="color" value={brand.accent || "#16181d"} onChange={setB("accent")} className="h-5 w-5 border-0 p-0 bg-transparent" aria-label="Any colour" />
                    Any
                  </label>
                </div>
                {brand.accent && readable(brand.accent) !== brand.accent && (
                  <p className="text-[12px] text-[var(--ink-muted)] mt-2">Too light for text on white paper, so headings in it are drawn a little darker; bands and fills keep your colour.</p>
                )}
              </Group>
              <Group title="Typeface">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(FONTS).map(([k, f]) => (
                    <Chip key={k} on={(brand.font || "barlow") === k} onClick={() => setB("font")(k)} className="justify-start text-[15px]" style={{ fontFamily: `"${f.family}"` }}>
                      {f.label}
                    </Chip>
                  ))}
                </div>
              </Group>
            </>
          )}

          {!onKind && tab === "details" && (
            <>
              <Group title="On the paper">
                <div className="space-y-2.5">
                  <Box label="Name as it appears" id="b-name">
                    <input id="b-name" value={brand.name || ""} onChange={setB("name")} placeholder={fixed.legalName} className={INPUT} />
                  </Box>
                  <Box label="Line under the name" id="b-tag">
                    <input id="b-tag" value={brand.tagline || ""} onChange={setB("tagline")} placeholder="Civil works and equipment hire" className={INPUT} />
                  </Box>
                  <Box label="Address" id="b-address">
                    <textarea id="b-address" value={brand.address || ""} onChange={setB("address")} rows={2} className={AREA} />
                  </Box>
                </div>
              </Group>
              <Group title="Contact">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Box label="Phone" id="b-phone">
                    <input id="b-phone" value={brand.phone || ""} onChange={setB("phone")} inputMode="tel" className={INPUT} />
                  </Box>
                  <Box label="Email" id="b-email">
                    <input id="b-email" value={brand.email || ""} onChange={setB("email")} inputMode="email" className={INPUT} />
                  </Box>
                  <Box label="Website" id="b-web" className="sm:col-span-2">
                    <input id="b-web" value={brand.website || ""} onChange={setB("website")} placeholder="www.example.mv" className={INPUT} />
                  </Box>
                </div>
                <p className="text-[12px] text-[var(--ink-muted)] mt-3">
                  TIN, GST number and registration come from <Link to="/settings?tab=tax" className="underline underline-offset-2">Tax settings</Link>, and always print on a tax invoice.
                </p>
              </Group>
            </>
          )}

          {!onKind && tab === "sign" && (
            <>
              <Group title="Signature">
                <SignatureField value={brand.signature} onChange={setB("signature")} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                  <Box label="Signed by" id="b-signatory">
                    <input id="b-signatory" value={brand.signatory || ""} onChange={setB("signatory")} className={INPUT} />
                  </Box>
                  <Box label="Their title" id="b-sigtitle">
                    <input id="b-sigtitle" value={brand.signatoryTitle || ""} onChange={setB("signatoryTitle")} placeholder="Managing Director" className={INPUT} />
                  </Box>
                </div>
              </Group>
              <Group title="Company stamp">
                <ImagePick label="Company stamp" value={brand.stamp} onChange={setB("stamp")} clearPaper hint="Stamp a white sheet and photograph it: the paper is taken out." testid="stamp" />
              </Group>
              <p className="text-[12px] text-[var(--ink-muted)]">Which documents carry them is set for each kind, under What shows.</p>
            </>
          )}

          {!onKind && tab === "payment" && (
            <>
              <Group title="How to pay you">
                <Box label="Bank and account" id="b-pay" hint="Prints on invoices, quotes and sales orders. A QR code can carry it too.">
                  <textarea id="b-pay" value={brand.paymentDetails ?? fixed.paymentDetails ?? ""} onChange={setB("paymentDetails")} rows={4} placeholder={"Bank of Maldives\nAccount 7730000000000\nAccount name: Your Company Pvt Ltd"} className={AREA} />
                </Box>
              </Group>
              <Group title="Footer">
                <Box label="At the foot of every page" id="b-footer">
                  <textarea id="b-footer" value={brand.footer || ""} onChange={setB("footer")} rows={2} placeholder="Thank you for your business." className={AREA} />
                </Box>
              </Group>
            </>
          )}

          {!onKind && tab === "industry" && (
            <Group title="Start from your industry">
              <p className="text-[13px] text-[var(--ink-muted)] -mt-1 mb-3">Designs, columns and wording for every kind of document at once, kept as copies named after the industry. The designs you had stay.</p>
              <div className="space-y-2">
                {Object.entries(PRESETS).map(([k, pr]) => (
                  <button key={k} type="button" data-testid={`preset-${k}`} onClick={() => applyPreset(pr)} className="group w-full rounded-[10px] bg-[var(--surface-2)] px-4 py-3 text-left hover:bg-[var(--ink)] hover:text-[var(--surface)] transition-colors">
                    <span className="block text-[14px] font-medium">{pr.label}</span>
                    <span className="block text-[12px] text-[var(--ink-muted)] group-hover:text-inherit group-hover:opacity-75 leading-snug mt-0.5">{pr.hint}</span>
                  </button>
                ))}
              </div>
            </Group>
          )}

          {onKind && tab === "design" && (
            <DesignTab kind={kind} lib={lib} full={full} onPick={(inUse) => setLib(kind, { ...lib, inUse })} onLib={(l) => setLib(kind, l)} copyOf={copyOf} template={template} setT={setT} setSize={setSize} everyKind={everyKind} />
          )}

          {onKind && tab === "content" && (
            <>
              <Group title="Columns">
                <div className="flex flex-wrap gap-2">
                  {[["code", "Item code"], ["quantity", "Quantity"], ["unit", "Unit"], priced && ["rate", "Rate"]].filter(Boolean).map(([k, l]) => (
                    <Toggle key={k} on={template.columns[k]} onClick={() => setIn("columns", k, !template.columns[k])}>
                      {l}
                    </Toggle>
                  ))}
                </div>
              </Group>
              <Group title="On the paper">
                <div className="flex flex-wrap gap-2">
                  {[["logo", "Logo"], ["signature", "Signature"], ["stamp", "Stamp"], priced && ["payment", "How to pay"], priced && ["words", "Total in words"], ["footer", "Footer"]].filter(Boolean).map(([k, l]) => (
                    <Toggle key={k} on={template.show[k]} onClick={() => setIn("show", k, !template.show[k])}>
                      {l}
                    </Toggle>
                  ))}
                </div>
              </Group>
              <Group title="QR code">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(QR_KINDS).map(([k, l]) => (
                    <Chip key={k} on={template.qr === k} onClick={() => setT("qr", k)}>
                      {l}
                    </Chip>
                  ))}
                </div>
                {qrHint(template.qr, kind, full) && <p className="text-[12px] text-[var(--ink-muted)] mt-2 leading-snug">{qrHint(template.qr, kind, full)}</p>}
              </Group>
            </>
          )}

          {onKind && tab === "wording" && (
            <>
              <Group title="Heading">
                <Box label="Title" id="t-title" hint={kind === "invoice" && full.gstRegistered ? "A GST-registered company's invoice always says Tax Invoice; a title here prints under it." : undefined}>
                  <input id="t-title" value={template.title} onChange={(e) => setT("title", e.target.value)} placeholder={KIND_LABEL[kind]} className={INPUT} />
                </Box>
              </Group>
              <Group title="Notes and terms">
                <div className="space-y-2.5">
                  <Box label="Notes" id="t-notes">
                    <textarea id="t-notes" value={template.notes} onChange={(e) => setT("notes", e.target.value)} rows={2} placeholder="Please quote the number with your payment." className={AREA} />
                  </Box>
                  <Box label="Terms" id="t-terms">
                    <textarea id="t-terms" value={template.terms} onChange={(e) => setT("terms", e.target.value)} rows={2} placeholder="Payment within 30 days of the date above." className={AREA} />
                  </Box>
                </div>
              </Group>
              <Group title="Language">
                <div className="flex flex-wrap gap-2">
                  <Chip on={template.language === "en"} onClick={() => setT("language", "en")}>
                    English
                  </Chip>
                  <Chip on={template.language === "en-dv"} onClick={() => setT("language", "en-dv")}>
                    English and Dhivehi
                  </Chip>
                </div>
                {template.language === "en-dv" && <p className="text-[12px] text-[var(--ink-muted)] mt-2 leading-snug">The Dhivehi labels are suggestions. Have someone who writes Dhivehi every day check them; each can be changed below.</p>}
              </Group>
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)]">
                  Rename labels <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {Object.entries(LABELS).map(([k, l]) => (
                    <Box key={k} label={l} id={`lb-${k}`}>
                      <input id={`lb-${k}`} aria-label={`Label for ${l}`} value={template.labels[k] || ""} onChange={(e) => setIn("labels", k, e.target.value)} placeholder={l} className={INPUT} />
                    </Box>
                  ))}
                </div>
                {template.language === "en-dv" && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {Object.entries(DV_LABELS).map(([k, d]) => (
                      <Box key={k} label={`${LABELS[k]}, in Dhivehi`} id={`dv-${k}`}>
                        <input id={`dv-${k}`} dir="rtl" lang="dv" aria-label={`Dhivehi label for ${LABELS[k]}`} value={template.dvLabels[k] || ""} onChange={(e) => setIn("dvLabels", k, e.target.value)} placeholder={d} className={INPUT} style={{ fontFamily: "\"Noto Sans Thaana\", sans-serif" }} />
                      </Box>
                    ))}
                  </div>
                )}
              </details>
            </>
          )}
        </fieldset>
      </section>

      {/* ---- the paper */}
      <div className={cn("bg-[var(--surface-2)] lg:flex lg:flex-col lg:min-h-0 min-w-0 rounded-[14px] lg:rounded-none", view === "edit" && "hidden lg:flex")}>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pt-4">
          <div className="lg:hidden w-full flex justify-end">
            <ViewSwitch view={view} setView={setView} />
          </div>
          {onKind ? (
            <p className="text-[13px] text-[var(--ink-muted)]">
              <b className="font-semibold text-[var(--ink)]">{KIND_LABEL[kind]}</b> · {designName(lib)}
            </p>
          ) : (
            <label className="text-[13px] text-[var(--ink-muted)] inline-flex items-center gap-1">
              Shown on
              <select aria-label="Document shown" value={kind} onChange={(e) => (setKind(e.target.value), setSize(null))} className="bg-transparent font-semibold text-[var(--ink)] outline-none cursor-pointer">
                {Object.keys(SAMPLES).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-0.5 p-0.5 rounded-full bg-[var(--surface)] ml-auto" role="group" aria-label="Preview size">
            {Object.entries(SIZES).map(([k, s]) => (
              <button key={k} type="button" onClick={() => setSize(k)} aria-pressed={(size || template.size) === k} className={cn("h-7 px-2.5 rounded-full text-[12px] font-medium", (size || template.size) === k ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                {s.label.replace("Receipt ", "")}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("px-4 sm:px-10 py-6 lg:flex-1 lg:overflow-auto", model.size.receipt && "flex flex-col items-center")} data-testid="brand-preview">
          <div className={model.size.receipt ? "w-[300px]" : "max-w-[700px] mx-auto"}>
            <FittedPaper model={model} />
          </div>
          <p className="text-[12px] text-[var(--ink-muted)] mt-3 text-center">A made-up {KIND_LABEL[kind].toLowerCase()}, drawn exactly as yours will be.</p>
        </div>
      </div>

      {/* ---- the foot */}
      {mayChange && (
        <footer className={cn("lg:col-span-2 sticky bottom-[92px] md:bottom-0 lg:static z-10 items-center", dirty ? "flex" : "hidden md:flex", " gap-3 px-5 sm:px-7 py-3.5 border-t border-[var(--border)] bg-[var(--surface)] rounded-b-[14px] lg:rounded-none")}>
          <span className="text-[13px] text-[var(--ink-muted)] mr-auto" data-testid="unsaved">
            {dirty ? "Changes not saved yet" : "Everything is saved"}
          </span>
          {dirty && (
            <Button type="button" variant="outline" onClick={onUndo} disabled={saving}>
              Undo changes
            </Button>
          )}
          <Button variant="accent" onClick={save} disabled={saving || !dirty} data-testid="save-brand">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save
          </Button>
        </footer>
      )}
    </div>
  );
}

/** The designs a kind can use: the company's own copies, and the ready-made ones. */
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
        <Group title="Your designs">
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
                      className="h-8 w-full rounded-md border border-[var(--ink)] px-2 text-[13px] outline-none bg-[var(--surface)]"
                    />
                  ) : (
                    <div className="flex items-center -mr-1.5">
                      <IconButton label={`Rename ${c.name}`} onClick={() => setRenaming(c.id)} icon={Pencil} />
                      <IconButton label={`Copy ${c.name}`} onClick={() => copy(c.from, templateOfCopy(c), `${c.name}, copy`)} icon={Copy} />
                      <IconButton
                        label={`Delete ${c.name}`}
                        icon={Trash2}
                        onClick={() => onLib({ inUse: lib.inUse === id ? (DESIGNS[c.from] ? c.from : "classic") : lib.inUse, copies: lib.copies.filter((x) => x.id !== c.id) })}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </Group>
      )}
      <Group title="Ready-made" note="changing one keeps your own copy">
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(DESIGNS).map(([id, d]) => (
            <Card key={id} model={thumb(designTemplate(id))} name={d.label} hint={d.hint} light={d.light} inUse={lib.inUse === id} onPick={() => onPick(id)} testid={`design-${id}`}>
              <IconButton label={`Copy ${d.label} to make it your own`} onClick={() => copy(id, designTemplate(id), `${d.label}, yours`)} icon={Copy} />
            </Card>
          ))}
        </div>
      </Group>
      <Group title="Usual paper">
        <div className="flex flex-wrap gap-2">
          {Object.entries(SIZES).map(([k, s]) => (
            <Chip
              key={k}
              on={template.size === k}
              onClick={() => {
                setT("size", k);
                setSize(null);
              }}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Group>
      <button type="button" onClick={everyKind} className="text-[14px] font-medium underline underline-offset-4 decoration-[var(--border)] hover:decoration-[var(--ink)]">
        Use {designName(lib)} on every kind of document
      </button>
    </>
  );
}

// ------------------------------------------------------------------ parts

/** A field whose label sits inside its box, above what is typed. */
const INPUT = "w-full bg-transparent outline-none text-[15px] text-[var(--ink)] h-7 placeholder:text-[var(--ink-muted)] placeholder:opacity-70";
const AREA = "w-full bg-transparent outline-none text-[15px] text-[var(--ink)] leading-snug resize-none py-0.5 placeholder:text-[var(--ink-muted)] placeholder:opacity-70";
const SELECT = "w-full bg-transparent outline-none text-[15px] text-[var(--ink)] h-7 -ml-0.5 pr-6 cursor-pointer appearance-none";

function Box({ label, id, hint, className, children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="relative block rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 pt-2 pb-1.5 cursor-text transition-colors focus-within:border-[var(--ink)] hover:border-[var(--ink-muted)]">
        <span className="block text-[12px] text-[var(--ink-muted)] leading-4">{label}</span>
        {children}
        {children?.type === "select" && <ChevronDown size={16} aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />}
      </label>
      {hint && <p className="text-[12px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function Group({ title, note, children }) {
  return (
    <section>
      <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-3">
        {title}
        {note && <span className="font-sans font-normal normal-case tracking-normal"> · {note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Chip({ on, onClick, className, style, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={Boolean(on)} style={style} className={cn("h-10 px-4 rounded-[10px] text-[14px] font-medium inline-flex items-center transition-colors", on ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]", className)}>
      {children}
    </button>
  );
}

/** A chip that is on or off, and says which with a tick as well as colour. */
function Toggle({ on, onClick, children }) {
  return (
    <Chip on={on} onClick={onClick} className="gap-1.5 pl-3">
      <Check size={14} aria-hidden="true" className={on ? "" : "opacity-0"} />
      {children}
    </Chip>
  );
}

function ViewSwitch({ view, setView }) {
  return (
    <div className="lg:hidden flex shrink-0 p-0.5 rounded-full bg-[var(--surface-2)]" role="group" aria-label="Show">
      {[
        ["edit", "Edit"],
        ["preview", "Paper"],
      ].map(([v, l]) => (
        <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("h-8 px-3.5 rounded-full text-[13px] font-medium", view === v ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)]")}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Card({ model, name, hint, light, inUse, onPick, children, testid }) {
  return (
    <div className={cn("rounded-[12px] p-2 min-w-0 bg-[var(--surface-2)] transition-shadow", inUse ? "ring-2 ring-[var(--ink)]" : "hover:ring-1 hover:ring-[var(--ink-muted)]")}>
      <button type="button" onClick={onPick} aria-pressed={inUse} title={hint} className="block w-full text-left" data-testid={testid}>
        <div className="h-[118px] overflow-hidden rounded-md bg-white pointer-events-none" aria-hidden="true">
          <FittedPaper model={model} />
        </div>
      </button>
      <button type="button" onClick={onPick} className="block w-full text-left mt-2 px-0.5 text-[13px] font-medium truncate" title={name}>
        {name}
      </button>
      <div className="flex items-center gap-1 min-h-8 -mb-1 px-0.5">
        <span className={cn("flex-1 text-[12px] truncate", inUse ? "text-[var(--ink)] font-medium" : "text-[var(--ink-muted)]")}>{inUse ? "In use" : light ? "Light" : ""}</span>
        {children}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]">
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function qrHint(qr, kind, brand) {
  if (qr === "verify") return ["invoice", "credit_note"].includes(kind) ? "Once issued, the code opens a page that confirms it came from you, unchanged. Drafts carry none." : "Only invoices and credit notes are kept as issued, so only they can carry this code.";
  if (qr === "pay") return brand.paymentDetails ? "Carries your payment details, so a phone can copy the account number." : "Add how to pay you under Your brand, Payment, first.";
  if (qr === "website") return brand.website ? `Opens ${brand.website}.` : "Add your website under Your brand, Details, first.";
  return null;
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

/** Sign here with a finger, or photograph one signed on paper. */
function SignatureField({ value, onChange }) {
  const [drawing, setDrawing] = useState(false);
  if (drawing)
    return (
      <SignaturePad
        onCancel={() => setDrawing(false)}
        onDone={(png) => {
          onChange(png);
          setDrawing(false);
        }}
      />
    );
  return (
    <ImagePick label="Signature" value={value} onChange={onChange} clearPaper hint="Sign with a finger or mouse, or sign white paper and photograph it." testid="signature">
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-20 w-32 shrink-0 rounded-[10px] bg-[repeating-conic-gradient(#f1f2f4_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden ring-1 ring-[var(--border)]">
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
      {hint && <p className="text-[12px] text-[var(--ink-muted)] mt-2 leading-snug">{hint}</p>}
    </div>
  );
}
