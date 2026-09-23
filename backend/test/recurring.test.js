/**
 * Repeat billing. The properties: a month keeps its day (the 31st bills on
 * the last day of a shorter month and comes back); every missed date is
 * raised in turn; a schedule stops at its end date and while paused; and one
 * set to go in the books by itself does.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as recurring from "../src/ledger/recurring";

afterAll(closePool);

describe("the next date", () => {
  it("keeps the day of the month, and weeks are seven days", () => {
    expect(recurring.nextDate("2026-01-31", "month", 31)).toBe("2026-02-28");
    expect(recurring.nextDate("2026-02-28", "month", 31)).toBe("2026-03-31");
    expect(recurring.nextDate("2026-11-30", "quarter", 30)).toBe("2027-02-28");
    expect(recurring.nextDate("2024-02-29", "year", 29)).toBe("2025-02-28");
    expect(recurring.nextDate("2026-12-29", "week", 29)).toBe("2027-01-05");
  });
});

describe("a schedule", () => {
  it("raises each missed invoice, puts them in the books when told to, and stops at its end", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await client.query(
        `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')`,
        [companyId]
      );
      await assumeIdentity(client, { companyId, userId });
      const tenant = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'A tenant','{customer}') RETURNING id", [companyId])).rows[0].id;
      const id = await recurring.create(client, {
        companyId, userId, counterpartyId: tenant, name: "Office rent", every: "month", startsOn: "2026-01-31", endsOn: "2026-05-31",
        gstTreatment: "none_unregistered", postAutomatically: true, lines: [{ description: "Rent, office 2", quantity: 1, unitPrice: "12000" }],
      });

      const raised = await recurring.runDue(client, { companyId, userId, today: "2026-04-15" });
      expect(raised.map((r) => r.on)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
      const { rows } = await client.query("SELECT status, gross_laari FROM sales_invoices WHERE recurring_id = $1 ORDER BY issue_date", [id]);
      expect(rows.map((r) => [r.status, String(r.gross_laari)])).toEqual([["posted", "1200000"], ["posted", "1200000"], ["posted", "1200000"]]);
      expect(await recurring.runDue(client, { companyId, userId, today: "2026-04-15" })).toEqual([]);

      await recurring.pause(client, { companyId, userId, id, paused: true });
      expect(await recurring.runDue(client, { companyId, userId, today: "2026-12-31" })).toEqual([]);
      await recurring.pause(client, { companyId, userId, id, paused: false });
      // The end date stops it: April and May, and nothing after.
      expect((await recurring.runDue(client, { companyId, userId, today: "2026-12-31" })).map((r) => r.on)).toEqual(["2026-04-30", "2026-05-31"]);
      const [s] = await recurring.list(client, { companyId });
      expect(s).toMatchObject({ raised: 5, finished: true, each: "12,000.00", everyText: "every month" });
    }));
});
