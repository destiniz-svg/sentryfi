import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadFont } from "@/lib/documents";

/**
 * The paper. One drawing for every document, every layout and every size:
 * the live preview beside a form, the printed page, the PDF (print, then
 * "Save as PDF") and the customer's link all draw this, so what is seen is
 * what is sent.
 *
 * Sized in millimetres and points, not screen pixels, so A4 prints as A4 and
 * an 80 mm receipt as 80 mm. Styles are its own (the .sd- rules below), not
 * the app's, so the app's theme never leaks onto paper.
 */

const CSS = `
.sd{position:relative;background:#fff;color:#16181d;box-sizing:border-box;line-height:1.4;font-size:var(--sd-fs);-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden}
.sd *{box-sizing:border-box}
.sd p{margin:0}
.sd .mute{color:#5b6068}
.sd .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sd .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-weight:700;font-size:calc(var(--sd-fs)*9);letter-spacing:.12em;color:rgba(22,24,29,.06);transform:rotate(-28deg)}
.sd .head{display:flex;justify-content:space-between;gap:8mm;align-items:flex-start}
.sd .logo{max-height:18mm;max-width:55mm;object-fit:contain;display:block}
.sd .name{font-weight:700;font-size:calc(var(--sd-fs)*1.45);line-height:1.15}
.sd .title{font-weight:700;font-size:calc(var(--sd-fs)*2.3);line-height:1;letter-spacing:-.01em;text-align:right}
.sd .meta{border-collapse:collapse;margin-left:auto;margin-top:3mm}
.sd .meta td{padding:.6mm 0 .6mm 5mm;vertical-align:top}
.sd .meta td:first-child{padding-left:0;color:#5b6068}
.sd .meta td:last-child{text-align:right;font-weight:600}
.sd .lbl{font-size:calc(var(--sd-fs)*.78);text-transform:uppercase;letter-spacing:.09em;font-weight:600;color:#5b6068;margin-bottom:1.2mm}
.sd table.lines{width:100%;border-collapse:collapse;margin-top:7mm}
.sd table.lines thead{display:table-header-group}
.sd table.lines th{font-size:calc(var(--sd-fs)*.78);text-transform:uppercase;letter-spacing:.08em;font-weight:600;text-align:left;padding:2mm 2mm;border-bottom:.35mm solid #16181d}
.sd table.lines th.num{text-align:right}
.sd table.lines td{padding:2.2mm 2mm;border-bottom:.2mm solid #e3e4e7;vertical-align:top}
.sd table.lines tr{break-inside:avoid}
.sd table.lines th:first-child,.sd table.lines td:first-child{padding-left:0}
.sd table.lines th:last-child,.sd table.lines td:last-child{padding-right:0}
.sd .totals{margin-left:auto;width:72mm;margin-top:4mm;border-collapse:collapse}
.sd .totals td{padding:1.4mm 0}
.sd .totals tr.strong td{border-top:.35mm solid #16181d;font-weight:700;font-size:calc(var(--sd-fs)*1.2);padding-top:2.2mm}
.sd .words{text-align:right;font-size:calc(var(--sd-fs)*.88);margin-top:1.5mm}
.sd .blocks{display:grid;grid-template-columns:1fr 1fr;gap:5mm 10mm;margin-top:9mm;break-inside:avoid}
.sd .pre{white-space:pre-line}
.sd .sign{display:flex;align-items:flex-end;gap:8mm;margin-top:10mm;break-inside:avoid}
.sd .sign img.sig{max-height:16mm;max-width:50mm;display:block}
.sd .sign img.stamp{max-height:26mm;max-width:30mm;display:block;opacity:.92}
.sd .sigline{border-top:.25mm solid #16181d;padding-top:1.2mm;min-width:50mm}
.sd .foot{margin-top:10mm;padding-top:3mm;border-top:.2mm solid #e3e4e7;font-size:calc(var(--sd-fs)*.82);color:#5b6068;text-align:center}
/* modern */
.sd.modern .band{margin:calc(var(--sd-pad)*-1) calc(var(--sd-pad)*-1) 0;padding:9mm var(--sd-pad) 8mm;background:var(--sd-accent);color:var(--sd-on)}
.sd.modern .band .mute{color:inherit;opacity:.8}
.sd.modern .band .title{color:var(--sd-on)}
.sd.modern .tile{background:#fff;border-radius:2.5mm;padding:2mm 3mm;display:inline-block;margin-bottom:3mm}
.sd.modern table.lines th{background:var(--sd-wash);border-bottom:none;color:var(--sd-accent-text)}
.sd.modern table.lines th:first-child{padding-left:2mm}
.sd.modern table.lines td:first-child{padding-left:2mm}
.sd.modern .totals tr.strong td{border-top:none;background:var(--sd-accent);color:var(--sd-on);padding:2.4mm 2mm}
/* classic */
.sd.classic .rule{height:.9mm;background:var(--sd-accent);margin:6mm 0 0}
.sd.classic .title{color:var(--sd-accent-text)}
/* compact */
.sd.compact{--sd-fs:8pt}
.sd.compact .title{font-size:calc(var(--sd-fs)*1.9)}
.sd.compact table.lines td{padding:1.2mm 1.5mm}
.sd.compact table.lines th{padding:1.4mm 1.5mm}
.sd.compact .title{color:var(--sd-accent-text)}
/* receipt */
.sd.receipt{text-align:center}
.sd.receipt .logo{margin:0 auto 2mm;max-width:40mm;max-height:14mm}
.sd.receipt .name{font-size:calc(var(--sd-fs)*1.25)}
.sd.receipt .title{text-align:center;font-size:calc(var(--sd-fs)*1.35);margin:3mm 0 1.5mm}
.sd.receipt .dash{border-top:.3mm dashed #16181d;margin:2.5mm 0}
.sd.receipt .row{display:flex;justify-content:space-between;gap:2mm;text-align:left}
.sd.receipt .item{text-align:left;margin:1.2mm 0}
.sd.receipt .strong{font-weight:700;font-size:calc(var(--sd-fs)*1.15)}
@media print{.sd{overflow:visible}}
`;

function Watermark({ text }) {
  return text ? (
    <div className="wm" aria-hidden="true">
      {text}
    </div>
  ) : null;
}

function From({ m, modern }) {
  const logo = m.from.logo && <img className="logo" src={m.from.logo} alt="" />;
  return (
    <div style={{ minWidth: 0 }}>
      {logo && (modern ? <span className="tile">{logo}</span> : <div style={{ marginBottom: "3mm" }}>{logo}</div>)}
      <p className="name">{m.from.name}</p>
      {m.from.tagline && <p className="mute">{m.from.tagline}</p>}
      {m.from.legalName && <p className="mute">{m.from.legalName}</p>}
      {m.from.lines.map((l, i) => (
        <p key={i} className="mute">
          {l}
        </p>
      ))}
      {m.from.ids.length > 0 && <p style={{ marginTop: "1mm", fontWeight: 600 }}>{m.from.ids.join("   ·   ")}</p>}
    </div>
  );
}

function TitleBlock({ m }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <p className="title">{m.title}</p>
      {m.subtitle && <p className="mute" style={{ textAlign: "right", marginTop: "1.5mm" }}>{m.subtitle}</p>}
      <table className="meta">
        <tbody>
          {m.meta.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Parties({ m }) {
  if (!m.to?.name && !m.subject) return null;
  return (
    <div style={{ display: "flex", gap: "10mm", marginTop: "8mm", justifyContent: "space-between" }}>
      {m.to?.name && (
        <div style={{ minWidth: 0 }}>
          <p className="lbl">{m.toLabel}</p>
          <p style={{ fontWeight: 600, fontSize: "calc(var(--sd-fs)*1.1)" }}>{m.to.name}</p>
          {m.to.address && <p className="mute pre">{m.to.address}</p>}
          {m.to.tin && <p className="mute">TIN {m.to.tin}</p>}
        </div>
      )}
      {m.subject && (
        <div style={{ minWidth: 0, textAlign: "right", maxWidth: "50%" }}>
          <p className="lbl">{m.subject.label}</p>
          <p>{m.subject.value}</p>
        </div>
      )}
    </div>
  );
}

function Lines({ m }) {
  return (
    <table className="lines">
      <thead>
        <tr>
          {m.columns.map((c) => (
            <th key={c.key} className={c.num ? "num" : undefined} style={c.grow ? { width: "100%" } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {m.lines.map((l, i) => (
          <tr key={i}>
            {m.columns.map((c) => (
              <td key={c.key} className={c.num ? "num" : undefined}>
                {l[c.key] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ m }) {
  return (
    <div style={{ breakInside: "avoid" }}>
      <table className="totals">
        <tbody>
          {m.totals.map((t) => (
            <tr key={t.label} className={t.strong ? "strong" : undefined}>
              <td>{t.label}</td>
              <td className="num">{t.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.words && <p className="words mute">{m.words}</p>}
      {m.inBase.map((l) => (
        <p key={l} className="words" style={{ fontWeight: 600 }}>
          {l}
        </p>
      ))}
    </div>
  );
}

function Blocks({ m }) {
  const blocks = [m.notes, m.terms, m.payment].filter(Boolean);
  if (!blocks.length) return null;
  return (
    <div className="blocks">
      {blocks.map((b) => (
        <div key={b.label}>
          <p className="lbl">{b.label}</p>
          <p className="pre">{b.text}</p>
        </div>
      ))}
    </div>
  );
}

function Sign({ m }) {
  if (!m.signature && !m.stamp) return null;
  return (
    <div className="sign">
      {m.signature && (
        <div>
          {m.signature.image && <img className="sig" src={m.signature.image} alt="" />}
          <div className="sigline">
            {m.signature.name && <p style={{ fontWeight: 600 }}>{m.signature.name}</p>}
            {m.signature.title && <p className="mute">{m.signature.title}</p>}
          </div>
        </div>
      )}
      {m.stamp && <img className="stamp" src={m.stamp} alt="" />}
    </div>
  );
}

function Receipt({ m }) {
  return (
    <>
      {m.from.logo && <img className="logo" src={m.from.logo} alt="" />}
      <p className="name">{m.from.name}</p>
      {m.from.lines.map((l, i) => (
        <p key={i} className="mute">
          {l}
        </p>
      ))}
      {m.from.ids.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <p className="title">{m.title}</p>
      {m.meta.map((r) => (
        <div key={r.label} className="row">
          <span className="mute">{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      {m.to?.name && (
        <div className="row">
          <span className="mute">{m.toLabel}</span>
          <span>{m.to.name}</span>
        </div>
      )}
      <div className="dash" />
      {m.lines.map((l, i) => (
        <div key={i} className="item">
          <p>{l.description}</p>
          <div className="row">
            <span className="mute">{[l.quantity && `${l.quantity}${l.unit ? " " + l.unit : ""}`, l.rate && `× ${l.rate}`].filter(Boolean).join(" ")}</span>
            <span className="num">{l.amount}</span>
          </div>
        </div>
      ))}
      <div className="dash" />
      {m.totals.map((t) => (
        <div key={t.label} className={`row${t.strong ? " strong" : ""}`}>
          <span>{t.label}</span>
          <span className="num">{t.value}</span>
        </div>
      ))}
      {m.inBase.map((l) => (
        <p key={l} style={{ marginTop: "1mm" }}>
          {l}
        </p>
      ))}
      {m.words && <p className="mute" style={{ marginTop: "2mm" }}>{m.words}</p>}
      {m.payment && (
        <>
          <div className="dash" />
          <p className="pre">{m.payment.text}</p>
        </>
      )}
      {m.footer && <p className="mute pre" style={{ marginTop: "3mm" }}>{m.footer}</p>}
    </>
  );
}

export function DocumentPaper({ model: m, className = "" }) {
  loadFont(m.font);
  const pad = m.size.receipt ? "3mm" : m.size.width < 160 ? "11mm" : "16mm";
  const fs = m.size.receipt ? (m.size.paper === 58 ? "7pt" : "8pt") : m.size.width < 160 ? "8.5pt" : "9.5pt";
  const style = {
    width: `${m.size.width}mm`,
    minHeight: m.size.height ? `${m.size.height}mm` : undefined,
    padding: `${m.size.receipt ? "4mm" : pad} ${pad}`,
    fontFamily: `"${m.font.family}", system-ui, sans-serif`,
    "--sd-fs": fs,
    "--sd-pad": pad,
    "--sd-accent": m.accent,
    "--sd-accent-text": m.accentText,
    "--sd-on": m.onAccent,
    "--sd-wash": m.wash,
  };
  return (
    <article className={`sd ${m.layout} ${className}`} style={style} data-testid="paper">
      <style>{CSS}</style>
      <Watermark text={m.watermark} />
      {m.layout === "receipt" ? (
        <Receipt m={m} />
      ) : (
        <>
          {m.layout === "modern" ? (
            <div className="band">
              <div className="head">
                <From m={m} modern />
                <TitleBlock m={m} />
              </div>
            </div>
          ) : (
            <>
              <div className="head">
                <From m={m} />
                <TitleBlock m={m} />
              </div>
              {m.layout === "classic" && <div className="rule" />}
            </>
          )}
          <Parties m={m} />
          <Lines m={m} />
          <Totals m={m} />
          <Blocks m={m} />
          <Sign m={m} />
          {m.footer && <p className="foot pre">{m.footer}</p>}
        </>
      )}
    </article>
  );
}

/**
 * The paper shrunk to fit the space it is shown in, at its true proportions.
 * Printing undoes the shrink (see the print rules in DocumentView).
 */
export function FittedPaper({ model, max = 1 }) {
  const box = useRef(null);
  const paper = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const fit = () => {
      if (!box.current || !paper.current) return;
      const s = Math.min(max, box.current.clientWidth / paper.current.offsetWidth);
      setScale(s);
      setHeight(paper.current.offsetHeight * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box.current);
    ro.observe(paper.current);
    return () => ro.disconnect();
  }, [max]);
  // Fonts arrive after the first draw and change the height.
  useEffect(() => {
    document.fonts?.ready.then(() => paper.current && setHeight(paper.current.offsetHeight * scale));
  }, [model.font, scale]);
  return (
    <div ref={box} className="w-full" style={{ height: height ?? undefined }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "max-content" }} className="shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_28px_rgba(0,0,0,.08)] print:shadow-none print:!transform-none">
        <div ref={paper}>
          <DocumentPaper model={model} />
        </div>
      </div>
    </div>
  );
}
