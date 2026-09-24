/**
 * Sentryfi's own customers: the trial each company gets, and what the
 * developer dashboard reads about them.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { trialOf, customers, extendTrial, setPlan, removeCustomer, removePerson } from "../src/ledger/platform";
import { postEntry } from "../src/ledger/post";

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

describe("removing a customer", () => {
  it("takes a company with posted books away entirely, with its only person, and leaves the seal on for everyone else", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client);
      const other = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (user_id, company_id, role) VALUES ($1, $2, 'administrator')", [co.userId, co.companyId]);
      const { rows: acc } = await client.query("SELECT id, code FROM accounts WHERE company_id = $1 ORDER BY code LIMIT 2", [co.companyId]);
      await postEntry(client, {
        companyId: co.companyId, userId: co.userId, date: "2026-09-15", source: "bill", narrative: "Something to remove",
        lines: [{ accountId: acc[0].id, debit: "10.00" }, { accountId: acc[1].id, credit: "10.00" }],
      });
      const { rows: named } = await client.query("SELECT name FROM companies WHERE id = $1", [co.companyId]);
      // Posting took on the app's role; the dashboard's request never does.
      await client.query("RESET ROLE");

      await expect(removeCustomer(client, { companyId: co.companyId, confirm: "wrong", actor: "dev@example.test", reason: "Test" })).rejects.toThrow(/Type the company's name/);
      const out = await removeCustomer(client, { companyId: co.companyId, confirm: named[0].name, actor: "dev@example.test", reason: "Test account" });
      expect(out.people).toHaveLength(1);

      const count = async (sql, id) => Number((await client.query(sql, [id])).rows[0].n);
      expect(await count("SELECT count(*) AS n FROM companies WHERE id = $1", co.companyId)).toBe(0);
      expect(await count("SELECT count(*) AS n FROM journal_lines WHERE company_id = $1", co.companyId)).toBe(0);
      expect(await count("SELECT count(*) AS n FROM users WHERE id = $1", co.userId)).toBe(0);
      expect(await count("SELECT count(*) AS n FROM companies WHERE id = $1", other.companyId)).toBe(1);

      // The seal is back on: another company's journal still refuses deletion.
      const { rows: acc2 } = await client.query("SELECT id FROM accounts WHERE company_id = $1 ORDER BY code LIMIT 2", [other.companyId]);
      const e = await postEntry(client, {
        companyId: other.companyId, userId: other.userId, date: "2026-09-15", source: "bill", narrative: "Stays",
        lines: [{ accountId: acc2[0].id, debit: "5.00" }, { accountId: acc2[1].id, credit: "5.00" }],
      });
      await client.query("SAVEPOINT s");
      await expect(client.query("DELETE FROM journal_entries WHERE id = $1", [e.id ?? e.entryId ?? e])).rejects.toThrow(/cannot be deleted|permission/);
      await client.query("ROLLBACK TO SAVEPOINT s");
      await client.query("RESET ROLE");

      // Someone with no company goes on their own; a kept account never does.
      const { rows: u } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Lone', 'lone@example.test', 'x') RETURNING id");
      await expect(removePerson(client, { userId: u[0].id, confirm: "lone@example.test", actor: "dev@example.test", reason: "Test", keep: ["lone@example.test"] })).rejects.toThrow(/kept/);
      await removePerson(client, { userId: u[0].id, confirm: "lone@example.test", actor: "dev@example.test", reason: "Test sign-up" });
      expect(await count("SELECT count(*) AS n FROM users WHERE id = $1", u[0].id)).toBe(0);
    }));
});
