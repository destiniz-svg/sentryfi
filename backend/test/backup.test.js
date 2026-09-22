/**
 * A backup, restored, against a real Postgres.
 *
 * The properties that matter: a backup loaded into an empty database gives
 * back every row, every company's seal verifies, and the books add up to what
 * they did when it was taken; a backup altered afterwards is caught, both by
 * the encryption and, underneath it, by the seal.
 */

import { describe, it, expect, afterAll } from "vitest";
import zlib from "zlib";
import crypto from "crypto";
import { Client } from "pg";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { encrypt, decrypt, dump, restoreInto, scratchUrl } from "../src/backup";

afterAll(closePool);

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const SCRATCH = "sentryfi_backup_test";

async function admin(sql) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function restored(data) {
  await admin(`DROP DATABASE IF EXISTS ${SCRATCH}`);
  await admin(`CREATE DATABASE ${SCRATCH}`);
  try {
    return await restoreInto(scratchUrl(url, SCRATCH), data);
  } finally {
    await admin(`DROP DATABASE IF EXISTS ${SCRATCH}`);
  }
}

describe("backups", () => {
  it("encrypts so that a changed byte or the wrong key is refused", () => {
    const k = crypto.randomBytes(32);
    const file = encrypt(Buffer.from("the books"), k);
    expect(decrypt(file, k).toString()).toBe("the books");
    const bent = Buffer.from(file);
    bent[20] ^= 1;
    expect(() => decrypt(bent, k)).toThrow();
    expect(() => decrypt(file, crypto.randomBytes(32))).toThrow();
  });

  it("restores into an empty database with every seal intact, and catches a doctored backup", () =>
    inRollback(async (client) => {
      const { companyId, userId, accounts } = await aCompanyWith(client, { name: "Backed Up Co" });
      await assumeIdentity(client, { companyId, userId });
      for (const [day, amount] of [["2026-09-01", "1,000.00"], ["2026-09-02", "250.50"], ["2026-09-03", "75.25"]]) {
        await postEntry(client, {
          companyId, userId, date: day, source: "opening_balance", narrative: `Entry ${day}`,
          lines: [
            { accountId: accounts.expense, debit: amount },
            { accountId: accounts.payable, credit: amount },
          ],
        });
      }
      await client.query("RESET ROLE");

      const { data, manifest } = await dump(client);
      const ours = manifest.books.find((b) => b.company_id === companyId);
      expect(ours).toMatchObject({ entries: "3", debits: "132575", credits: "132575" });

      const good = await restored(data);
      expect(good.problems).toEqual([]);
      expect(good.ok).toBe(true);

      // Someone edits an amount in the backup and re-packs it.
      const text = zlib.gunzipSync(data).toString("utf8");
      const doctored = text.replace(/("debit_laari":)25050\b/, "$125000");
      expect(doctored).not.toBe(text);
      const bad = await restored(zlib.gzipSync(Buffer.from(doctored)));
      expect(bad.ok).toBe(false);
      expect(bad.problems.join(" ")).toMatch(/seal|debits/);
    }), 120_000);
});
