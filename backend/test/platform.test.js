/**
 * Sentryfi's own customers: the trial each company gets, and what the
 * developer dashboard reads about them.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { trialOf, customers, extendTrial, setPlan } from "../src/ledger/platform";

afterAll(closePool);

const now = async (client, id) => trialOf((await client.query("SELECT plan, trial_ends_at FROM companies WHERE id = $1", [id])).rows[0]);

describe("the trial", () => {
  it("counts down thirty days, ends, and does not apply to a paying or developer company", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(trialOf({ plan: "trial", trial_ends_at: "2026-10-24T12:00:00Z" }, now)).toMatchObject({ daysLeft: 30, ended: false });
    expect(trialOf({ plan: "trial", trial_ends_at: "2026-09-24T11:00:00Z" }, now)).toMatchObject({ daysLeft: 0, ended: true });
    expect(trialOf({ plan: "paid", trial_ends_at: "2026-09-01T00:00:00Z" }, now)).toMatchObject({ ended: false, daysLeft: null });
    expect(trialOf({ plan: "developer", trial_ends_at: null }, now).ended).toBe(false);
  });

  it("an extension starts from the later of today and the end", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (user_id, company_id, role) VALUES ($1, $2, 'administrator') ON CONFLICT DO NOTHING", [co.userId, co.companyId]);
      await client.query("UPDATE companies SET plan = 'trial', trial_ends_at = now() - interval '2 days' WHERE id = $1", [co.companyId]);
      let r = await now(client, co.companyId);
      expect(r.ended).toBe(true);

      await extendTrial(client, { companyId: co.companyId, days: 7, actor: "dev@example.test", reason: "Asked for a week" });
      r = await now(client, co.companyId);
      expect(r).toMatchObject({ ended: false, daysLeft: 7 });

      await setPlan(client, { companyId: co.companyId, plan: "developer", actor: "dev@example.test", reason: "Our own" });
      const { companies } = await customers(client);
      const mine = companies.find((c) => c.id === co.companyId);
      expect(mine.trial.plan).toBe("developer");
      expect(mine.owner).toBeTruthy();
      expect(mine.usage).toMatchObject({ entries: expect.any(Number), bills: expect.any(Number) });
      const { rows } = await client.query("SELECT action FROM platform_events WHERE detail->>'companyId' = $1 ORDER BY id", [co.companyId]);
      expect(rows.map((x) => x.action)).toEqual(["extend_trial", "set_plan"]);
    }));
});
