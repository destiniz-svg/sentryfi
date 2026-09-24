/**
 * The files in a zip, as text. Stored and deflated entries (every zip a
 * bookkeeping system exports), read from the central directory with Node's
 * own zlib; nothing to install. Refuses anything it cannot read rather than
 * guessing.
 */
const zlib = require("zlib");

function unzip(buffer, { maxBytes = 60 * 1024 * 1024 } = {}) {
  const b = Buffer.from(buffer);
  // The end-of-central-directory record, searched for from the end.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That is not a zip file.");
  const count = b.readUInt16LE(eocd + 10);
  let at = b.readUInt32LE(eocd + 16);
  const files = {};
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(at) !== 0x02014b50) throw new Error("The zip's directory is damaged.");
    const method = b.readUInt16LE(at + 10);
    const packed = b.readUInt32LE(at + 20);
    const size = b.readUInt32LE(at + 24);
    const nameLen = b.readUInt16LE(at + 28);
    const extraLen = b.readUInt16LE(at + 30);
    const commentLen = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.slice(at + 46, at + 46 + nameLen).toString("utf8");
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.slice(start, start + packed);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`${name} is packed in a way this cannot read.`);
    total += data.length;
    if (total > maxBytes) throw new Error("That zip is larger than a backup should be.");
    if (size && data.length !== size) throw new Error(`${name} did not unpack to its own size.`);
    files[name.split("/").pop()] = data.toString("utf8").replace(/^﻿/, "");
  }
  return files;
}

module.exports = { unzip };
