/**
 * People in a company, against a real Postgres.
 *
 * The properties that matter: a link lets exactly one person in, once, with
 * the role it was made for; a wrong or used link lets nobody in; the last
 * administrator cannot be taken away; and every change is written down.
 */

import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcrypt";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as people from "../src/ledger/people";

afterAll(closePool);

// Each route is its own transaction; here one transaction plays several, so
// step back out of the app role between them, the way a new request would.
const fresh = (client) => client.query("RESET ROLE");

async function anAdmin(client) {
  const { companyId, userId } = await aCompanyWith(client);
  await assumeIdentity(client, { companyId, userId });
  await client.query(`INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,'administrator')`, [userId, companyId]);
  return { companyId, userId };
}

describe("adding people", () => {
  it("lets a new person in once, by link, with the role it was made for", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await anAdmin(client);
      const email = `new+${Math.random().toString(36).slice(2)}@sentryfi.invalid`;
      const made = await people.add(client, { companyId, userId, email, role: "site_staff" });
      expect(made.added).toBe(false);

      await fresh(client);
      const seen = await people.readInvite(client, { token: made.token });
      expect(seen).toMatchObject({ email, role: "site_staff", company: "Test Co" });

      await fresh(client);
      const joined = await people.acceptInvite(client, { token: made.token, name: "Hassan", password: "longenough1" });
      expect(joined.companyId).toBe(companyId);

      await fresh(client);
      await expect(people.acceptInvite(client, { token: made.token, name: "Again", password: "longenough1" }))
        .rejects.toThrow(/already been used/);

      await fresh(client);
      await assumeIdentity(client, { companyId, userId });
      const { members, invites, changes } = await people.list(client, { companyId });
      expect(members.find((m) => m.email === email).roles).toEqual(["site_staff"]);
      expect(invites).toHaveLength(0);
      expect(changes.map((c) => c.change).sort()).toEqual(["invited", "joined"]);
    }));

  it("lets nobody in with a wrong secret, or someone else's password", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await anAdmin(client);
      const made = await people.add(client, { companyId, userId, email: "someone@sentryfi.invalid", role: "viewer" });
      const wrong = made.token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
      await fresh(client);
      await expect(people.readInvite(client, { token: wrong })).rejects.toThrow(/does not exist/);
      await fresh(client);
      await expect(people.readInvite(client, { token: "not-a-link" })).rejects.toThrow(/not a Sentryfi invitation/);

      // An existing login proves itself with its own password.
      await fresh(client);
      const hashOf = await bcrypt.hash("the-right-one", 4);
      await client.query(`INSERT INTO users (name, email, password_hash) VALUES ('Aisha','aisha@sentryfi.invalid',$1)`, [hashOf]);
      await assumeIdentity(client, { companyId, userId });
      const second = await people.add(client, { companyId, userId, email: "Aisha@Sentryfi.invalid", role: "viewer" });
      expect(second).toMatchObject({ added: true, name: "Aisha" });
      await expect(people.add(client, { companyId, userId, email: "aisha@sentryfi.invalid", role: "viewer" }))
        .rejects.toThrow(/already has that role/);
    }));

  it("keeps the last administrator, and writes every change down", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await anAdmin(client);
      await expect(people.removeRole(client, { companyId, userId, memberId: userId, role: "administrator" }))
        .rejects.toThrow(/only administrator/);

      await fresh(client);
      await client.query(`INSERT INTO users (name, email, password_hash) VALUES ('Two','two@sentryfi.invalid','x')`);
      await assumeIdentity(client, { companyId, userId });
      await people.add(client, { companyId, userId, email: "two@sentryfi.invalid", role: "administrator" });
      await people.removeRole(client, { companyId, userId, memberId: userId, role: "administrator" });

      const { members, changes } = await people.list(client, { companyId });
      expect(members.map((m) => m.name)).toEqual(["Two"]);
      expect(changes.map((c) => c.change)).toContain("removed");
      await expect(client.query("UPDATE people_changes SET change = 'added'")).rejects.toThrow(/permission denied/);
    }));
});
