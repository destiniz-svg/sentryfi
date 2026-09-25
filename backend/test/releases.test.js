/**
 * Releases: versions unique and newest first, every item well formed, and a
 * release announced to every bell exactly once.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { RELEASES } from "../src/releases";
import { announce } from "../src/services/releases";

afterAll(closePool);

const parts = (v) => v.split(".").map(Number);
const newer = (a, b) => { const [x, y] = [parts(a), parts(b)]; for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

describe("releases", () => {
  it("are numbered newest first, each item said plainly and opening somewhere", () => {
    RELEASES.forEach((r, i) => {
      expect(r.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
      if (i > 0) expect(newer(RELEASES[i - 1].version, r.version)).toBe(true);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const it of r.items) {
        expect(["new", "improved", "fixed"]).toContain(it.kind);
        expect(it.title && it.body && it.area).toBeTruthy();
        expect(it.href.startsWith("/")).toBe(true);
      }
    });
  });

  it("announces the newest release once, to everyone in every company", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1,$2,'administrator')", [companyId, userId]);
      await client.query("DELETE FROM release_announcements WHERE version = $1", [RELEASES[0].version]);
      const quiet = { pushTo: async () => 0 };
      expect(await announce(client, { push: quiet })).toBeGreaterThanOrEqual(1);
      expect(await announce(client, { push: quiet })).toBe(0);
      const { rows } = await client.query("SELECT kind, title, href FROM notifications WHERE user_id = $1 AND company_id = $2", [userId, companyId]);
      expect(rows).toEqual([{ kind: "release", title: `New in Sentryfi ${RELEASES[0].version}: ${RELEASES[0].title}`, href: `/whats-new#v${RELEASES[0].version}` }]);
    }));
});
