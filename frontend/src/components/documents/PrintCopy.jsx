import { createPortal } from "react-dom";
import { DocumentPaper } from "./DocumentPaper";

/**
 * What the printer gets: the paper, straight under <body>, with everything
 * else hidden and the page set to the paper's size. Printing to PDF from here
 * is the PDF. Nothing shows on screen.
 *
 * The paper is as wide as its size says, and never wider than the page it is
 * printed on. Chrome takes the page size and margins asked for below; an
 * iPhone, an iPad and Safari do not, and print on their own paper with their
 * own margins, so a paper held at exactly 210mm ran off the right edge there.
 * Holding it to the printable width keeps every edge on the page.
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
          html,body{background:#fff !important;height:auto !important;margin:0 !important;padding:0 !important;overflow:visible !important}
          body > *:not(.print-doc){display:none !important}
          .print-doc{display:block;width:100%}
          .print-doc > div{width:100%;max-width:${s.receipt ? s.paper : s.width}mm;margin:0 auto}
          .print-doc .sd{min-height:0 !important;width:100% !important;max-width:${s.width}mm;${s.receipt ? `margin:0 auto;` : "padding-top:0 !important;padding-bottom:0 !important;"}}
          .print-doc .sd.modern .band{margin-top:0}
          .print-doc .sd table{table-layout:auto;max-width:100%}
          /* Squeezed onto a narrower page, the description wraps; quantities, units, rates and amounts stay whole. */
          .print-doc .sd table.lines th:not(.grow),.print-doc .sd table.lines td:not(.grow){white-space:nowrap}
          .print-doc .sd table.lines td.grow{overflow-wrap:anywhere}
        }
      `}</style>
      <div>
        <DocumentPaper model={model} />
      </div>
    </div>,
    document.body
  );
}
