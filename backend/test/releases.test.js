/**
 * Releases: versions unique and newest first, every item well formed, and a
 * release announced to every bell exactly once.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { RELEASES } from "../src/releases";
import { roundUp, headlines, weekOf, needOf } from "../src/services/releases";

// The role table sits beside the server settings, which refuse to load without these.
process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "releases-test-secret-long-enough-to-pass-validation";

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

  it("rounds the week up once, telling each person only what their role can use", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      const site = (await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Ali', $1, 'x') RETURNING id", [`ali+${Math.random()}@sentryfi.invalid`])).rows[0].id;
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1,$2,'administrator'), ($1,$3,'site_staff')", [companyId, userId, site]);
      await client.query("DELETE FROM release_announcements");
      const quiet = { pushTo: async () => 0 };
      expect(await headlines(client, { push: quiet })).toBe(0);
      // Not Sunday morning yet: nothing.
      expect(await roundUp(client, { now: new Date("2026-09-26T08:00:00Z"), push: quiet })).toBe(0);
      const sunday = new Date("2026-09-27T05:00:00Z"); // 10:00 in Malé
      expect(weekOf(sunday)).toEqual({ key: "2026-W39", due: true });
      expect(await roundUp(client, { now: sunday, push: quiet })).toBeGreaterThanOrEqual(2);
      expect(await roundUp(client, { now: sunday, push: quiet })).toBe(0);
      const note = async (u) => (await client.query("SELECT title, href FROM notifications WHERE user_id = $1 AND company_id = $2 AND kind = 'release'", [u, companyId])).rows;
      const owner = await note(userId);
      const ali = await note(site);
      const count = (t) => Number(t.match(/(\d+) change/)[1]);
      expect(owner).toHaveLength(1);
      expect(ali).toHaveLength(1);
      expect(count(ali[0].title)).toBeLessThan(count(owner[0].title));
      expect(owner[0].href).toBe(`/whats-new#v${RELEASES[0].version}`);
      expect(needOf({ area: "Team", href: "/payroll" })).toBe("run_payroll");
      expect(needOf({ area: "Website", href: "/" })).toBe(false);
    }));
});
