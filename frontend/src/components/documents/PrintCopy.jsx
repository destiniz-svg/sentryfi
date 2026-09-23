import { createPortal } from "react-dom";
import { DocumentPaper } from "./DocumentPaper";

/**
 * What the printer gets: the paper at full size, straight under <body>, with
 * everything else hidden and the page set to the paper's size. Printing to
 * PDF from here is the PDF. Nothing shows on screen.
 */
export function PrintCopy({ model }) {
  const s = model.size;
  const page = s.receipt ? `${s.paper}mm auto` : `${s.width}mm ${s.height}mm`;
  return createPortal(
    <div className="print-doc">
      <style>{`
        .print-doc{display:none}
        @media print{
          @page{size:${page};margin:${s.receipt ? "0" : "12mm 0"}}
          html,body{background:#fff !important;height:auto !important}
          body > *:not(.print-doc){display:none !important}
          .print-doc{display:block}
          .print-doc .sd{min-height:0 !important;${s.receipt ? `margin:0 auto;` : "padding-top:0 !important;padding-bottom:0 !important;"}}
          .print-doc .sd.modern .band{margin-top:0}
        }
      `}</style>
      <div style={s.receipt ? { width: `${s.paper}mm` } : undefined}>
        <DocumentPaper model={model} />
      </div>
    </div>,
    document.body
  );
}
