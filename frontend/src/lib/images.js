/**
 * Images for the brand kit, handled in the browser before they are sent: a
 * logo shrunk to a sensible size, a stamp or signature photographed on white
 * paper with the paper taken out, and the colours a logo is made of.
 */

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not an image this browser can read."));
    img.src = src;
  });
}

const asDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });

/**
 * A file as a PNG data URL no wider or taller than `max` pixels. With
 * `clearPaper`, near-white pixels become transparent, so a signature or
 * stamp photographed on paper sits on the document without a white box.
 */
export async function prepare(file, { max = 800, clearPaper = false } = {}) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image: PNG, JPEG, WebP or SVG.");
  const src = await asDataUrl(file);
  if (file.type === "image/svg+xml" && !clearPaper) return src; // sharp at any size already
  const img = await load(src);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h);
  if (clearPaper) {
    const d = g.getImageData(0, 0, w, h);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const light = Math.min(p[i], p[i + 1], p[i + 2]);
      // Paper fades out between 200 and 235, so ink edges stay soft.
      if (light > 235) p[i + 3] = 0;
      else if (light > 200) p[i + 3] = Math.round(p[i + 3] * ((235 - light) / 35));
    }
    g.putImageData(d, 0, 0);
  }
  return c.toDataURL("image/png");
}

/** The colours a logo is made of, most used first, leaving out white and near-greys. */
export async function paletteOf(src, count = 5) {
  const img = await load(src);
  const n = 64;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, n, n);
  const p = g.getImageData(0, 0, n, n).data;
  const buckets = new Map();
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 200) continue;
    const [r, gr, b] = [p[i], p[i + 1], p[i + 2]];
    const hi = Math.max(r, gr, b);
    const lo = Math.min(r, gr, b);
    if (lo > 230) continue; // paper
    const saturated = hi - lo > 28;
    if (!saturated && hi > 90) continue; // mid greys say nothing about a brand; near-black does
    const key = (r >> 4) * 256 + (gr >> 4) * 16 + (b >> 4);
    const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, weight: saturated ? 1.6 : 1 };
    e.r += r;
    e.g += gr;
    e.b += b;
    e.n += 1;
    buckets.set(key, e);
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  const picked = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n * b.weight - a.n * a.weight)) {
    const rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    if (picked.some((q) => Math.hypot(q[0] - rgb[0], q[1] - rgb[1], q[2] - rgb[2]) < 60)) continue;
    picked.push(rgb);
    if (picked.length === count) break;
  }
  return picked.map((rgb) => "#" + rgb.map(hex).join(""));
}
