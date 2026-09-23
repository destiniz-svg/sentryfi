/**
 * Documents. The properties: an invoice's paper carries the books' figures;
 * once issued, the copy kept is what was sent, whatever the brand or the
 * template say afterwards; a draft is always drawn as it is now.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { raise, post } from "../src/ledger/sales";
import * as documents from "../src/ledger/documents";

afterAll(closePool);

async function anInvoice(client) {
  const co = await aCompanyWith(client);
  const { companyId, userId } = co;
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,'1300','Money owed to us','asset'), ($1,'2200','GST we owe','liability'), ($1,'4100','Work invoiced','income')`,
    [companyId]
  );
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("INSERT INTO counterparties (company_id, name, kind, address) VALUES ($1,'A resort','{customer}','Male, Maldives') RETURNING id", [companyId]);
  const { invoice } = await raise(client, {
    companyId, userId, counterpartyId: rows[0].id, issueDate: "2026-09-20", dueDate: "2026-10-20", gstTreatment: "none_unregistered",
    purchaseOrder: "PO-77", lines: [{ description: "Excavator hire", quantity: 30, uom: "DAY", unitPrice: "3000" }],
  });
  return { ...co, invoiceId: invoice.id };
}

describe("documents", () => {
  it("draws an invoice with the books' figures and the company's brand", () =>
    inRollback(async (client) => {
      const co = await anInvoice(client);
      await client.query("UPDATE companies SET brand = $2 WHERE id = $1", [co.companyId, JSON.stringify({ accent: "#0055aa", name: "Brand name" })]);
      const d = await documents.show(client, { companyId: co.companyId, kind: "invoice", documentId: co.invoiceId });
      expect(d.issuedCopy).toBeNull();
      expect(d.data.lines[0]).toMatchObject({ description: "Excavator hire", quantity: "30", unit: "DAY", rate: "3,000.00", amount: "90,000.00" });
      expect(d.data.totals.gross).toBe("90,000.00");
      expect(d.data.to).toMatchObject({ name: "A resort", address: "Male, Maldives" });
      expect(d.data.reference).toBe("PO-77");
      expect(d.brand).toMatchObject({ accent: "#0055aa", name: "Brand name" });
    }));

  it("keeps the issued copy as it was sent, whatever changes afterwards", () =>
    inRollback(async (client) => {
      const co = await anInvoice(client);
      await client.query("UPDATE companies SET brand = $2 WHERE id = $1", [co.companyId, JSON.stringify({ accent: "#111111" })]);
      await client.query("INSERT INTO document_templates (company_id, kind, settings) VALUES ($1,'invoice','{\"layout\":\"classic\"}')", [co.companyId]);
      await post(client, { companyId: co.companyId, userId: co.userId, invoiceId: co.invoiceId });
      await client.query("UPDATE companies SET brand = $2 WHERE id = $1", [co.companyId, JSON.stringify({ accent: "#ff0000" })]);
      await client.query("UPDATE document_templates SET settings = '{\"layout\":\"modern\"}' WHERE company_id = $1", [co.companyId]);
      const d = await documents.show(client, { companyId: co.companyId, kind: "invoice", documentId: co.invoiceId });
      expect(d.issuedCopy.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.brand.accent).toBe("#111111");
      expect(d.template.layout).toBe("classic");
      expect(d.data.status).toBe("posted"); // as it stood the moment it was issued
    }));
});
