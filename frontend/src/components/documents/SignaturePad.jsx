import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Sign with a finger, a pen or a mouse. The strokes are drawn in ink on a
 * transparent canvas and handed back as a PNG trimmed to the signature, so it
 * sits on the paper the way a photographed one does, without the paper.
 */
export function SignaturePad({ onDone, onCancel }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16181d";
  }, []);

  const at = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(...at(e));
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext("2d");
    ctx.lineTo(...at(e));
    ctx.stroke();
    setEmpty(false);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvas.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  function use() {
    const c = canvas.current;
    const { data, width, height } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < x0) return;
    const pad = 6;
    const out = document.createElement("canvas");
    out.width = x1 - x0 + pad * 2;
    out.height = y1 - y0 + pad * 2;
    out.getContext("2d").drawImage(c, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
    onDone(out.toDataURL("image/png"));
  }

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label="Sign here"
          className="w-full h-[140px] rounded-md bg-white touch-none cursor-crosshair border border-dashed border-[var(--border)]"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {empty && <p className="absolute inset-x-0 bottom-3 text-center text-[12px] text-[var(--ink-muted)] pointer-events-none">Sign here</p>}
        <div className="absolute left-4 right-4 bottom-9 border-t border-[var(--border)] pointer-events-none" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="outline" onClick={clear} disabled={empty} className="ml-auto">
          Clear
        </Button>
        <Button type="button" onClick={use} disabled={empty}>
          Use this signature
        </Button>
      </div>
    </div>
  );
}
