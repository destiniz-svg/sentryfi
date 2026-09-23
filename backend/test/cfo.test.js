/**
 * The CFO. The properties: the four figures add up from what they list; a
 * kind of cost running at twice its usual week is noticed, as is a bill far
 * above what its supplier usually charges and a customer sixty days late; a
 * rate the company records that moved is put into its own figures, with its
 * source and date; the brief is made once a day and kept.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity, postEntry } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import { raise, post } from "../src/ledger/sales";
import * as cfo from "../src/ledger/cfo";
import { ask } from "../src/ledger/cfoAsk";

afterAll(closePool);

const TODAY = "2026-09-23";

async function aBusiness(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId, accounts } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income'),
       ($1,'5400','Equipment and fuel','expense'), ($1,'3100','Owner''s stake','equity')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(rows.map((a) => [a.code, a.id]));
  const party = async (name, kind) => (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
  co.customer = await party("A resort", "customer");
  co.supplier = await party("A fuel supplier", "supplier");
  await postEntry(client, { companyId, userId, date: "2026-06-01", source: "adjustment", narrative: "Money put in", lines: [{ accountId: accounts.bank, debit: "100000" }, { accountId: co.code["3100"], credit: "100000" }] });
  co.bill = async (on, amount, due) => {
    const { rows: b } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, issue_date, due_date, net_laari, tax_laari, gross_laari, gst_treatment, status)
       VALUES ($1,$2,$3,$4,$5,0,$5,'none_unregistered','draft') RETURNING id`,
      [companyId, co.supplier, on, due || null, String(amount)]
    );
    await postBill(client, { companyId, userId, billId: b[0].id, accounts: { expense: co.code["5400"], payable: accounts.payable, taxReclaimable: accounts.taxReclaimable } });
    return b[0].id;
  };
  co.invoice = async (on, amount, due) => {
    const { invoice } = await raise(client, { companyId, userId, counterpartyId: co.customer, issueDate: on, dueDate: due, gstTreatment: "none_unregistered", lines: [{ description: "Work", amount }] });
    await post(client, { companyId, userId, invoiceId: invoice.id });
  };
  return co;
}

describe("the CFO", () => {
  it("keeps four figures that add up from what they list", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      await co.invoice("2026-06-15", "20000", "2026-07-15"); // long overdue
      await co.invoice("2026-09-20", "5000", "2026-10-10"); // due within 30 days
      await co.invoice("2026-09-20", "7000", "2026-12-31"); // beyond 30 days: not counted
      await co.bill("2026-09-01", 300000, "2026-09-28");
      const f = await cfo.figures(client, { companyId: co.companyId, today: TODAY });
      expect([f.cash, f.expectedIn, f.committedOut, f.forecast]).toEqual(["100,000.00", "25,000.00", "3,000.00", "122,000.00"]);
      expect(f.inParts.map((p) => p.amount)).toEqual(["20,000.00", "5,000.00"]);
      expect(f.short).toBe(false);
    }));

  it("notices a cost running hot, a bill far above the usual, and a customer sixty days late", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      // Fuel: 1,000 a week for twelve weeks, then 5,000 this week.
      for (let w = 12; w >= 1; w--) await co.bill(cfo.plus(TODAY, -7 * w - 1), 100000);
      await co.bill("2026-09-21", 500000);
      await co.invoice("2026-06-01", "8000", "2026-07-01");
      const seen = await cfo.noticed(client, { companyId: co.companyId, today: TODAY });
      const kinds = seen.map((s) => s.kind).sort();
      expect(kinds).toEqual(["bill", "late", "spend"]);
      const spend = seen.find((s) => s.kind === "spend");
      expect(spend.title).toBe("Equipment and fuel: MVR 5,000.00 this week");
      expect(spend.detail).toMatch(/About 5 times a usual week/);
      expect(spend.entries.length).toBe(1);
      expect(seen.find((s) => s.kind === "late").title).toBe("A resort owes MVR 8,000.00 from over sixty days ago");
    }));

  it("puts a rate that moved into the company's own figures, with its source and date", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      const { companyId, userId } = co;
      await client.query(
        `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status, currency, fx_rate, fc_net, fc_tax, fc_gross)
         VALUES ($1,$2,'2026-09-10',1542000,0,1542000,'none_unregistered','draft','USD','15.42',100000,0,100000) RETURNING id`,
        [companyId, co.supplier]
      ).then(async ({ rows }) => postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: co.code['5400'], payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } }));
      await client.query(
        `INSERT INTO exchange_rates (company_id, currency, on_date, rate, source, set_by) VALUES ($1,'USD','2026-09-10',15.42,'BML selling rate',$2), ($1,'USD','2026-09-22',15.60,'BML selling rate',$2)`,
        [companyId, userId]
      );
      const [note] = await cfo.market(client, { companyId, today: TODAY });
      expect(note).toMatchObject({ currency: "USD", moved: true, was: "15.42", rate: "15.6", source: "BML selling rate", on: "2026-09-22" });
      expect(note.text).toBe("USD moved from 15.42 (2026-09-10) to 15.6 (2026-09-22). On the USD 1,000.00 of bills in USD, that is about MVR 180.00 more to pay in rufiyaa.");
    }));

  it("makes the brief once a day and keeps it", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      await co.bill("2026-09-22", 50000, "2026-09-25");
      const b = await cfo.brief(client, { companyId: co.companyId, today: TODAY });
      expect(b.headline).toBe("Cash MVR 100,000.00. Over the next 30 days MVR 0.00 is due in and MVR 500.00 is due out, which leaves MVR 99,500.00.");
      expect(b.changed.on).toBe("2026-09-22");
      expect(b.changed.lines.length).toBeGreaterThan(0);
      expect(b.todo[0].text).toBe("Pay 1 bill due this week, MVR 500.00.");
      expect(b.learned).toMatch(/biggest cost|Equipment and fuel/);
      await co.bill("2026-09-22", 70000);
      const again = await cfo.brief(client, { companyId: co.companyId, today: TODAY });
      expect(again.headline).toBe(b.headline);
      const fresh = await cfo.brief(client, { companyId: co.companyId, today: TODAY, fresh: true });
      expect(fresh.headline).not.toBe(b.headline);
      expect(cfo.asText(fresh)[0]).toBe(fresh.headline);
    }));

  it("checks the business the way a CFO would, and ranks what needs acting on first", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      await co.invoice("2026-07-01", "30000", "2026-07-31"); // one customer, unpaid
      await co.bill("2026-08-15", 9000000); // MVR 90,000 of costs in the quarter
      const checks = await cfo.health(client, { companyId: co.companyId, today: TODAY });
      const by = Object.fromEntries(checks.map((c) => [c.name, c]));
      // Cash 100,000 against costs of 30,000 a month.
      expect(by["Runway"]).toMatchObject({ value: "3.3 months", verdict: "watch" });
      // 30,000 owed on 30,000 earned in 90 days.
      expect(by["Days to get paid"]).toMatchObject({ value: "90 days", verdict: "act" });
      expect(by["Biggest customer"]).toMatchObject({ value: "100% of sales", verdict: "act" });
      expect(by["Profit margin, last 90 days"].verdict).toBe("act");
      expect(by["Up to date"].value).toBe("Bank explained");
      const rank = { act: 0, watch: 1, good: 2 };
      expect(checks.map((c) => rank[c.verdict])).toEqual([...checks.map((c) => rank[c.verdict])].sort());
      for (const c of checks) expect(c.explain.length).toBeGreaterThan(10);
    }));

  it("answers a question from what its tools read, and cites only what they returned", () =>
    inRollback(async (client) => {
      const co = await aBusiness(client);
      await co.invoice("2026-09-01", "4000", "2026-09-30");
      const asked = [];
      // A stand-in model: looks up unpaid invoices, then answers citing the one it saw and one it made up.
      const model = async ({ contents, config }) => {
        asked.push(config.tools[0].functionDeclarations.length);
        const last = contents[contents.length - 1].parts[0];
        if (!last.functionResponse) return { functionCalls: [{ name: "documents", args: { kind: "invoices", unpaid: true } }], candidates: [{ content: { role: "model", parts: [] } }] };
        const doc = last.functionResponse.response.result.documents[0];
        return { text: `A resort owes MVR ${doc.stillOwed} on ${doc.number}, and more on INV-FAKE-9.` };
      };
      const r = await ask(client, { companyId: co.companyId, today: TODAY, company: "Test", question: "Who owes us?" }, model);
      expect(r.answer).toMatch(/owes MVR 4,000.00 on /);
      expect(r.looked).toEqual([{ tool: "documents", args: { kind: "invoices", unpaid: true } }]);
      expect(r.sources.length).toBe(1);
      expect(r.sources[0].kind).toBe("invoice");
      expect(r.answer).toContain(r.sources[0].ref);
      expect(asked).toEqual([7, 7]);
    }));
});
