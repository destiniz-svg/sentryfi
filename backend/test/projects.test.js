/**
 * A construction project, end to end: a MVR 1,000,000 contract with 10%
 * retention capped at 5% of the contract, a budget by kind of cost, a
 * subcontract committed and part-billed, two cumulative progress claims each
 * certified for less than claimed, and half the retention released.
 *
 * The properties: each certificate is the certified value to date less what
 * was certified before; retention stops at its cap; what is invoiced plus the
 * retention held is exactly the revenue; committed falls as bills arrive
 * against it; the forecast takes whichever is larger of budget and spent plus
 * committed; and a claim out of order is refused.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { postBill } from "../src/ledger/bills";
import * as projects from "../src/ledger/projects";

afterAll(closePool);

async function aContract(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income'),
       ($1,'5200','Labour','expense'), ($1,'5300','Subcontractors','expense')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows: acc } = await client.query("SELECT code, id FROM accounts WHERE company_id = $1", [companyId]);
  co.code = Object.fromEntries(acc.map((a) => [a.code, a.id]));
  const party = async (name, kind) => (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,$2,$3) RETURNING id", [companyId, name, `{${kind}}`])).rows[0].id;
  co.customer = await party("A housing authority", "customer");
  co.sub = await party("A subcontractor", "supplier");
  co.projectId = (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,'40 houses') RETURNING id", [companyId])).rows[0].id;
  await projects.configure(client, { companyId, userId, projectId: co.projectId, counterpartyId: co.customer, contract: "1000000", retentionPct: 10, retentionCapPct: 5 });
  await projects.setBudget(client, {
    companyId, userId, projectId: co.projectId,
    lines: [
      { accountId: co.code["5100"], amount: "400000" },
      { accountId: co.code["5200"], amount: "200000" },
      { accountId: co.code["5300"], amount: "150000" },
    ],
  });
  co.bill = async (net, { commitmentId } = {}) => {
    const { rows } = await client.query(
      `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status, project_id, commitment_id)
       VALUES ($1,$2,'2026-07-10',$3,0,$3,'none_unregistered','draft',$4,$5) RETURNING id`,
      [companyId, co.sub, String(net), co.projectId, commitmentId || null]
    );
    await postBill(client, { companyId, userId, billId: rows[0].id, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });
  };
  co.summary = () => projects.summary(client, { companyId, projectId: co.projectId });
  return co;
}

describe("a construction contract", () => {
  it("certifies cumulative claims, holds retention to its cap, and releases it", () =>
    inRollback(async (client) => {
      const co = await aContract(client);
      const { companyId, userId, projectId } = co;

      const c1 = await projects.claim(client, { companyId, userId, projectId, periodTo: "2026-07-31", claimedToDate: "300000" });
      await expect(projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", claimedToDate: "400000" })).rejects.toThrow(/not been certified yet/);
      await expect(projects.certify(client, { companyId, userId, claimId: c1.id, certifiedToDate: "300001", on: "2026-08-05" })).rejects.toThrow(/More than was claimed/);
      const r1 = await projects.certify(client, { companyId, userId, claimId: c1.id, certifiedToDate: "280000", on: "2026-08-05" });
      expect([r1.certificate, r1.retention, r1.due]).toEqual([28000000n, 2800000n, 25200000n]);

      await expect(projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", claimedToDate: "250000" })).rejects.toThrow(/not less than the last one/);
      const c2 = await projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", claimedToDate: "700000" });
      const r2 = await projects.certify(client, { companyId, userId, claimId: c2.id, certifiedToDate: "650000", on: "2026-09-05" });
      // Retention would be 65,000 to date, but stops at 5% of the contract: 50,000.
      expect([r2.certificate, r2.retention, r2.due]).toEqual([37000000n, 2200000n, 34800000n]);

      let s = await co.summary();
      expect(s).toMatchObject({ claimed: "700,000.00", certified: "650,000.00", retentionHeld: "50,000.00", revenue: "650,000.00" });
      // Invoiced: 252,000 + 348,000, each with 8% GST on top.
      expect(s.invoiced).toBe("648,000.00");
      expect(s.claims.map((c) => [c.number, c.certificate, c.retention, c.invoiced])).toEqual([
        [1, "280,000.00", "28,000.00", "252,000.00"],
        [2, "370,000.00", "22,000.00", "348,000.00"],
      ]);

      await expect(projects.releaseRetention(client, { companyId, userId, projectId, amount: "60000", on: "2026-12-01" })).rejects.toThrow(/Only MVR 50,000.00/);
      await projects.releaseRetention(client, { companyId, userId, projectId, amount: "25000", on: "2026-12-01" });
      s = await co.summary();
      expect(s).toMatchObject({ retentionHeld: "25,000.00", revenue: "650,000.00", invoiced: "675,000.00" });
      expect((await projects.entries(client, { companyId, projectId, figure: "retention" })).length).toBe(3);
    }));

  it("tracks spent, committed and the forecast, and says what is over budget", () =>
    inRollback(async (client) => {
      const co = await aContract(client);
      const { companyId, userId, projectId } = co;
      const sub = await projects.commit(client, { companyId, userId, projectId, counterpartyId: co.sub, description: "Roofing subcontract", accountId: co.code["5300"], amount: "150000" });
      await projects.commit(client, { companyId, userId, projectId, description: "Labour gang, September", accountId: co.code["5200"], amount: "80000" });
      await co.bill(12000000);
      await co.bill(6000000, { commitmentId: sub });
      const { rows: lab } = await client.query(
        `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, status, project_id)
         VALUES ($1,$2,'2026-07-20',15000000,0,15000000,'none_unregistered','draft',$3) RETURNING id`,
        [companyId, co.sub, projectId]
      );
      const billSplit = await import("../src/ledger/billSplit");
      await billSplit.save(client, { companyId, userId, billId: lab[0].id, lines: [{ kind: "cost", description: "Labour, July", amount: "150000", accountId: co.code["5200"] }] });
      await postBill(client, { companyId, userId, billId: lab[0].id, accounts: { expense: co.accounts.expense, payable: co.accounts.payable, taxReclaimable: co.accounts.taxReclaimable } });

      const s = await co.summary();
      const by = Object.fromEntries(s.lines.map((l) => [l.name, [l.budget, l.spent, l.committed, l.forecast]]));
      expect(by).toEqual({
        Materials: ["400,000.00", "120,000.00", "0.00", "400,000.00"],
        Labour: ["200,000.00", "150,000.00", "80,000.00", "230,000.00"],
        Subcontractors: ["150,000.00", "60,000.00", "90,000.00", "150,000.00"],
      });
      expect(s).toMatchObject({ spent: "330,000.00", committed: "170,000.00", forecastCost: "780,000.00", costToComplete: "450,000.00", forecastMargin: "220,000.00", overBudget: ["Labour"] });
      expect((await projects.entries(client, { companyId, projectId, figure: "spent", accountId: co.code["5300"] })).map((e) => e.amount)).toEqual(["60,000.00"]);
    }));
});

describe("variations, the bill of quantities and hours", () => {
  it("changes the contract only when a variation is approved, and lets claims follow it", () =>
    inRollback(async (client) => {
      const co = await aContract(client);
      const { companyId, userId, projectId } = co;
      const vo1 = await projects.vary(client, { companyId, userId, projectId, description: "Extra boundary wall", amount: "120000" });
      const vo2 = await projects.vary(client, { companyId, userId, projectId, description: "Omit landscaping", amount: "-20000" });
      expect([vo1.number, vo2.number]).toEqual([1, 2]);
      let s = await co.summary();
      expect([s.contract, s.originalContract, s.variationsPending]).toEqual(["1,000,000.00", "1,000,000.00", "100,000.00"]);
      await expect(projects.claim(client, { companyId, userId, projectId, periodTo: "2026-07-31", claimedToDate: "1050000" })).rejects.toThrow(/more than the contract/);
      await projects.decideVariation(client, { companyId, userId, variationId: vo1.id, approved: true, on: "2026-07-20" });
      await projects.decideVariation(client, { companyId, userId, variationId: vo2.id, approved: false });
      await expect(projects.decideVariation(client, { companyId, userId, variationId: vo2.id, approved: true })).rejects.toThrow(/already rejected/);
      s = await co.summary();
      expect([s.contract, s.originalContract, s.variationsPending]).toEqual(["1,120,000.00", "1,000,000.00", "0.00"]);
      expect(s.variations.map((v) => v.status)).toEqual(["approved", "rejected"]);
      await projects.claim(client, { companyId, userId, projectId, periodTo: "2026-07-31", claimedToDate: "1050000" });
      // An omission that would leave the contract below what is claimed is refused.
      const vo3 = await projects.vary(client, { companyId, userId, projectId, description: "Omit the wall again", amount: "-120000" });
      await expect(projects.decideVariation(client, { companyId, userId, variationId: vo3.id, approved: true })).rejects.toThrow(/already claimed/);
    }));

  it("measures a claim from the bill of quantities, and never past it", () =>
    inRollback(async (client) => {
      const co = await aContract(client);
      const { companyId, userId, projectId } = co;
      await projects.setBoq(client, { companyId, userId, projectId, items: [
        { ref: "1.1", description: "Excavation", unit: "m3", quantity: "400", rate: "250" },
        { ref: "2.1", description: "Blockwork", unit: "m2", quantity: "1200.5", rate: "300" },
      ] });
      let s = await co.summary();
      expect(s.boqTotal).toBe("460,150.00");
      const [dig, blocks] = s.boq;
      const c1 = await projects.claim(client, { companyId, userId, projectId, periodTo: "2026-07-31", measured: [{ boqId: dig.id, done: "400" }, { boqId: blocks.id, done: "100.25" }] });
      expect(c1.value).toBe(13007500n); // 100,000 + 30,075
      await expect(projects.setBoq(client, { companyId, userId, projectId, items: [] })).rejects.toThrow(/stays as it is/);
      await projects.certify(client, { companyId, userId, claimId: c1.id, certifiedToDate: "130075", on: "2026-08-05" });
      await expect(projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", measured: [{ boqId: blocks.id, done: "1300" }] })).rejects.toThrow(/more than the 1200.5/);
      await expect(projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", measured: [{ boqId: blocks.id, done: "50" }] })).rejects.toThrow(/not less than last time/);
      // Excavation stays at 400 where the last claim left it; 50,000 of approved variations on top.
      const c2 = await projects.claim(client, { companyId, userId, projectId, periodTo: "2026-08-31", measured: [{ boqId: blocks.id, done: "600" }], claimedToDate: "50000" });
      expect(c2.value).toBe(33000000n);
      s = await co.summary();
      expect(s.boq.map((b) => [b.done, b.doneValue])).toEqual([["400", "100,000.00"], ["600", "180,000.00"]]);
    }));

  it("keeps hours worked with their value, and posts nothing", () =>
    inRollback(async (client) => {
      const co = await aContract(client);
      const { companyId, userId, projectId } = co;
      const before = (await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n;
      await projects.logHours(client, { companyId, userId, projectId, workedOn: "2026-07-01", who: "Site foreman", hours: "8.5", rate: "90" });
      await projects.logHours(client, { companyId, userId, projectId, workedOn: "2026-07-02", who: "Mason", hours: "7" });
      await expect(projects.logHours(client, { companyId, userId, projectId, workedOn: "2026-07-02", who: "Mason", hours: "25" })).rejects.toThrow(/at most 24/);
      const s = await co.summary();
      expect([s.hours.total, s.hours.value, s.hours.entries.length]).toEqual(["15.5", "765.00", 2]);
      expect((await client.query("SELECT count(*)::int AS n FROM journal_entries WHERE company_id = $1", [companyId])).rows[0].n).toBe(before);
    }));
});
