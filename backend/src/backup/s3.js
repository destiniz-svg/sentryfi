const crypto = require("crypto");

/**
 * Put and get one object in an S3-compatible bucket, signed with AWS
 * Signature Version 4. Two calls do not justify the AWS SDK; this is the
 * published algorithm and nothing else. Keys are limited to characters that
 * need no escaping, so the canonical path is the path as written.
 */

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function config() {
  const c = {
    bucket: process.env.BACKUP_BUCKET,
    endpoint: (process.env.BACKUP_ENDPOINT || "").replace(/\/$/, ""),
    region: process.env.BACKUP_REGION || "auto",
    accessKeyId: process.env.BACKUP_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_SECRET_ACCESS_KEY,
  };
  const missing = Object.entries(c).filter(([, v]) => !v || String(v).includes("${{")).map(([k]) => k);
  return { ...c, missing };
}

function signed(method, key, body, c) {
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) throw new Error(`Backup key "${key}" has characters that need escaping.`);
  const url = new URL(`${c.endpoint}/${c.bucket}/${key}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payload = sha256(body || "");
  const headers = { host: url.host, "x-amz-content-sha256": payload, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = [
    method,
    url.pathname,
    "",
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    payload,
  ].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  let k = hmac(`AWS4${c.secretAccessKey}`, day);
  for (const part of [c.region, "s3", "aws4_request"]) k = hmac(k, part);
  const signature = crypto.createHmac("sha256", k).update(toSign).digest("hex");
  delete headers.host;
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  return { url: url.toString(), headers };
}

async function put(key, body) {
  const c = config();
  if (c.missing.length) throw new Error(`Backup storage is not set up: ${c.missing.join(", ")}.`);
  const { url, headers } = signed("PUT", key, body, c);
  const res = await fetch(url, { method: "PUT", headers, body });
  if (!res.ok) throw new Error(`The bucket refused the backup: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function get(key) {
  const c = config();
  if (c.missing.length) throw new Error(`Backup storage is not set up: ${c.missing.join(", ")}.`);
  const { url, headers } = signed("GET", key, "", c);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`The bucket would not return the backup: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { put, get, config, signed };
