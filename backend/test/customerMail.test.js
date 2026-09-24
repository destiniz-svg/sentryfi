/**
 * What goes to customers by itself: nothing until turned on; a late invoice's
 * reminder on the latest reminder day reached, once; the month's statement in
 * the first days of the month, once, to a customer who owes and has an email.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as sales from "../src/ledger/sales";
import * as mail from "../src/ledger/customerMail";

afterAll(closePool);

describe("statements and reminders", () => {
  it("sends nothing until on, then each reminder and statement once", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client);
      const { companyId, userId } = co;
      await client.query("INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')", [companyId]);
      await assumeIdentity(client, { companyId, userId });
      const party = (await client.query("INSERT INTO counterparties (company_id, name, kind, email) VALUES ($1,'Lagoon Resort','{customer}','accounts@lagoon.test') RETURNING id", [companyId])).rows[0].id;
      const { invoice } = await sales.raise(client, { companyId, userId, counterpartyId: party, gstTreatment: "none_unregistered", issueDate: "2026-08-01", dueDate: "2026-08-15", lines: [{ description: "Work", amount: "1000" }] });
      await sales.post(client, { companyId, userId, invoiceId: invoice.id });

      expect(await mail.due(client, { companyId, on: "2026-09-01" })).toEqual({ statements: [], reminders: [] });
      await mail.save(client, { companyId, userId, monthlyStatements: true, reminders: true, reminderDays: [14, 3, 30] });

      // 17 days late: the 14-day reminder, not the 3-day one it passed.
      const d = await mail.due(client, { companyId, on: "2026-09-01" });
      expect(d.reminders.map((r) => r.key)).toEqual([`reminder:${invoice.id}:14`]);
      expect(d.statements).toHaveLength(1);
      expect(d.statements[0].owed).toBe("1,000.00");
      for (const x of [...d.statements.map((s) => ({ ...s, kind: "statement" })), ...d.reminders.map((r) => ({ ...r, kind: "reminder" }))]) {
        await mail.logSent(client, { companyId, key: x.key, kind: x.kind, counterpartyId: x.counterpartyId, invoiceId: x.invoiceId, to: x.email });
      }
      expect(await mail.due(client, { companyId, on: "2026-09-02" })).toEqual({ statements: [], reminders: [] });
      // Past the 5th, no statement; at 30 days late, the next reminder.
      const later = await mail.due(client, { companyId, on: "2026-09-14" });
      expect(later.statements).toEqual([]);
      expect(later.reminders.map((r) => r.key)).toEqual([`reminder:${invoice.id}:30`]);
    }));
});
