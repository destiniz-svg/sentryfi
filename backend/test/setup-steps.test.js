/**
 * Getting the books going: each step is ticked off from the books themselves.
 */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { steps } from "../src/ledger/setup";

afterAll(closePool);

describe("getting the books going", () => {
  it("starts with nothing done, and a bill recorded ticks off the first bill", () =>
    inRollback(async (client) => {
      const co = await aCompanyWith(client);
      const before = await steps(client, { companyId: co.companyId });
      expect(before.total).toBe(8);
      expect(before.done).toBe(0);
      expect(before.steps.every((s) => s.why && s.href)).toBe(true);
      await client.query("INSERT INTO bills (company_id, received_by, status) VALUES ($1, $2, 'draft')", [co.companyId, co.userId]);
      await client.query("UPDATE companies SET tin = '1000000GST501' WHERE id = $1", [co.companyId]);
      const after = await steps(client, { companyId: co.companyId });
      expect(after.steps.find((s) => s.key === "bill").done).toBe(true);
      expect(after.steps.find((s) => s.key === "details").done).toBe(true);
      expect(after.done).toBe(2);
    }));
});
