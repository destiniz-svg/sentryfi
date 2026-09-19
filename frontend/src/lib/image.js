/**
 * Getting a photograph into a state worth reading.
 *
 * The build plan asked for this from the start — "client-side compress and
 * strip EXIF" — and it was never built, so whatever came off the phone went
 * straight to the reader untouched. Three things were wrong with that, and
 * they show up worst on a picture chosen from the gallery rather than taken
 * on the spot.
 *
 * **Rotation.** A phone writes the orientation into the file's EXIF rather
 * than rotating the pixels. A portrait photograph is very often stored as a
 * landscape image with a note saying "turn this". Anything that ignores the
 * note reads the text sideways, and a model reading sideways text returns
 * exactly what was reported: a few fields filled and the rest blank.
 *
 * **Size.** A modern phone photograph is 4000px across and several megabytes.
 * Over a site connection that is slow, and past 10MB the upload is refused
 * outright. A bill does not need 12 megapixels to be legible.
 *
 * **Everything else in the frame.** A photograph taken on a desk is mostly
 * desk. Nothing here crops — guessing where the paper ends would lose figures
 * — but the size cap at least keeps the paper a decent share of the pixels
 * that survive.
 *
 * A PDF is passed through untouched. It is already the document.
 */

// Long edge. Enough that small print on an A4 bill survives, small enough
// that a page is a few hundred kilobytes rather than several megabytes.
const MAX_EDGE = 2200;
const QUALITY = 0.86;

/** Anything that is not an image is the document already. */
const isImage = (file) => file && file.type && file.type.startsWith("image/");

export async function prepareForReading(file) {
  if (!isImage(file)) return { file, changed: false, reason: "not an image" };

  let bitmap;
  try {
    // `from-image` is what applies the EXIF orientation, so the pixels come
    // out the way a person sees them rather than the way they were stored.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // An unusual format, or a browser without it. Send the original rather
    // than failing: a worse read beats no read.
    return { file, changed: false, reason: "could not be decoded here" };
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Paper is white, and a JPEG has no transparency to fall back on.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) return { file, changed: false, reason: "could not be re-encoded" };

  // If the original was already small and correctly oriented, keep it: a
  // second JPEG encode only loses detail.
  if (blob.size >= file.size && scale === 1) {
    return { file, changed: false, reason: "already fine" };
  }

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return {
    file: new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }),
    changed: true,
    was: { width, height, bytes: file.size },
    now: { width: w, height: h, bytes: blob.size },
  };
}
