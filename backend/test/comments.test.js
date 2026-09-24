/**
 * The team's conversation on a record. The properties: a mention tells that
 * person and makes them a follower; someone who cannot open the record is
 * refused until the writer lets them in, and then sees only the conversation;
 * answering an ask marks it answered, and either side can close it; a comment
 * is never deleted, only edited (keeping the old words) or taken down.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as comments from "../src/ledger/comments";

// The role table sits beside the server settings, which refuse to load without these.
process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://unused:unused@127.0.0.1:5432/unused";
process.env.JWT_SECRET ||= "comments-test-secret-long-enough-to-pass-validation";

afterAll(closePool);

async function person(client, companyId, name, role) {
  const { rows } = await client.query("INSERT INTO users (name, email, password_hash) VALUES ($1, $2, 'x') RETURNING id", [name, `${name.toLowerCase()}+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]);
  await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, $3)", [companyId, rows[0].id, role]);
  return rows[0].id;
}
// What each role may do, as far as these tests need it (the real table is middleware/company.js).
const CAN = { administrator: ["read", "record", "manage_people", "run_payroll"], accountant: ["read", "record", "run_payroll"], site_staff: ["capture"], cash_holder: ["spend_cash"] };
const as = (companyId, id, name, roles) => ({ companyId, user: { id, name }, roles, can: (a) => roles.some((r) => CAN[r].includes(a)) });

describe("comments", () => {
  it("tells whoever is mentioned or asked, and lets outsiders in only when asked to", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const aisha = await person(client, companyId, "Aisha", "accountant");
      const ali = await person(client, companyId, "Ali", "site_staff");
      const cashier = await person(client, companyId, "Hassan", "cash_holder");
      const { rows: p } = await client.query("INSERT INTO projects (company_id, name) VALUES ($1, 'Jetty') RETURNING id", [companyId]);
      const where = { kind: "project", id: p[0].id };
      const owner = as(companyId, userId, "Owner", ["administrator"]);
      await assumeIdentity(client, { companyId, userId });

      // Mentioning the accountant tells her, and she follows from now on.
      await comments.post(client, owner, { ...where, body: "@Aisha can you check the retention?", mentions: [aisha] });
      const { rows: n } = await client.query("SELECT kind, title, href FROM notifications WHERE user_id = $1", [aisha]);
      expect(n).toHaveLength(1);
      expect(n[0].kind).toBe("mention");
      expect(n[0].title).toBe("Owner mentioned you on Project Jetty");
      expect(n[0].href).toBe(`/projects/${where.id}?talk=1`);

      // Site staff cannot open projects: refused, then let in as a guest.
      await expect(comments.post(client, owner, { ...where, body: "@Ali which boat?", mentions: [ali] })).rejects.toMatchObject({ statusCode: 409, details: { cannotSee: [{ id: ali, name: "Ali" }], canLetIn: true } });
      await comments.post(client, owner, { ...where, body: "@Ali which boat?", askOf: ali, mentions: [ali], letIn: [ali], dueOn: "2026-10-01" });
      const { rows: toAli } = await client.query("SELECT kind, href FROM notifications WHERE user_id = $1", [ali]);
      expect(toAli.map((r) => r.kind)).toEqual(["ask"]);
      expect(toAli[0].href).toBe(`/talk/project/${where.id}`);

      // Ali sees the conversation, not the record, and his reply answers the ask.
      const aliReq = as(companyId, ali, "Ali", ["site_staff"]);
      const seen = await comments.thread(client, aliReq, where);
      expect(seen.record.opens).toBe(false);
      expect(seen.comments).toHaveLength(2);
      expect((await comments.asks(client, aliReq)).map((a) => a.status)).toEqual(["open"]);
      await comments.post(client, aliReq, { ...where, body: "The Thursday dhoni." });
      const waiting = await comments.asks(client, owner, { view: "asked" });
      expect(waiting.map((a) => a.status)).toEqual(["answered"]);
      // The owner hears the answer; so does Aisha, who follows.
      const { rows: heard } = await client.query("SELECT user_id, title FROM notifications WHERE title LIKE 'Ali %' ORDER BY title");
      expect(heard.find((h) => h.user_id === userId).title).toBe("Ali answered you on Project Jetty");
      expect(heard.find((h) => h.user_id === aisha).title).toBe("Ali commented on Project Jetty");

      // A guest cannot let anyone else in.
      await expect(comments.post(client, aliReq, { ...where, body: "@Hassan too", mentions: [cashier], letIn: [cashier] })).rejects.toMatchObject({ statusCode: 403 });
      // Someone who was never let in sees nothing.
      await expect(comments.thread(client, as(companyId, cashier, "Hassan", ["cash_holder"]), where)).rejects.toMatchObject({ statusCode: 403 });

      // Either side closes the ask; it leaves the list.
      await comments.settle(client, owner, waiting[0].id, true);
      expect(await comments.asks(client, owner, { view: "asked" })).toHaveLength(0);
    }));

  it("keeps what a comment said before an edit, and the line when taken down", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query("INSERT INTO memberships (company_id, user_id, role) VALUES ($1, $2, 'administrator')", [companyId, userId]);
      const aisha = await person(client, companyId, "Aisha", "accountant");
      const { rows: p } = await client.query("INSERT INTO projects (company_id, name) VALUES ($1, 'Jetty') RETURNING id", [companyId]);
      const where = { kind: "project", id: p[0].id };
      const owner = as(companyId, userId, "Owner", ["administrator"]);
      await assumeIdentity(client, { companyId, userId });
      const id = await comments.post(client, owner, { ...where, body: "Budget is 40k" });
      await comments.edit(client, owner, id, "Budget is 45k");
      await expect(comments.edit(client, as(companyId, aisha, "Aisha", ["accountant"]), id, "no")).rejects.toMatchObject({ statusCode: 403 });
      const { rows } = await client.query("SELECT body, earlier FROM comments WHERE id = $1", [id]);
      expect(rows[0].body).toBe("Budget is 45k");
      expect(rows[0].earlier[0].body).toBe("Budget is 40k");
      await comments.remove(client, owner, id);
      const t = await comments.thread(client, owner, where);
      expect(t.comments[0].body).toBeNull();
      expect(t.comments[0].removed.by).toBe("Test");
      // Nothing is ever deleted.
      await expect(client.query("DELETE FROM comments WHERE id = $1", [id])).rejects.toThrow(/permission denied/);
    }));
});
