/** Numbers: the company's own start, carrying on from the highest number of that kind. */
import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import * as numbering from "../src/ledger/numbering";

afterAll(closePool);

describe("numbering", () => {
  it("uses the default until a start is chosen, and carries the run on", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      expect(await numbering.next(client, { companyId, kind: "quote" })).toBe("QT-0001");
      const cp = (await client.query("INSERT INTO counterparties (company_id, name, kind) VALUES ($1,'R','{customer}') RETURNING id", [companyId])).rows[0].id;
      await client.query("INSERT INTO orders (company_id, kind, number, counterparty_id, ordered_on, created_by) VALUES ($1,'quote','QT-0041',$2,'2026-09-01',$3)", [companyId, cp, userId]);
      expect(await numbering.next(client, { companyId, kind: "quote" })).toBe("QT-0042");
      expect(await numbering.save(client, { companyId, userId, kind: "quote", start: "ALT/QT-" })).toBe("ALT/QT-0042");
      await expect(numbering.save(client, { companyId, userId, kind: "quote", start: "Q1" })).rejects.toThrow(/End the start/);
      expect(await numbering.save(client, { companyId, userId, kind: "quote", start: "" })).toBe("QT-0042");
    }));
});
