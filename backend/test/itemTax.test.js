/**
 * An item's GST class, and the model that works it out. The model here is a
 * stand-in that answers from a table, so the rules around it are what is
 * tested: a sure answer is kept and marked as the model's, an unsure or
 * unknown one is not, and a person's answer is never overwritten. The prompt
 * carries MIRA's lists and the traps inside them.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { guessTax } from "../src/ledger/stock";
import { itemTaxPrompt, itemTaxValidator } from "../src/services/itemTax";

afterAll(closePool);

const ANSWERS = {
  "Rice, 25 kg bag": { tax: "zero_rated", why: "Rice is on Schedule 1.", confidence: "high" },
  "Cement, 50 kg bag": { tax: "standard", why: "Building materials are standard.", confidence: "high" },
  "Office rent": { tax: "exempt", why: "Rent of property is exempt.", confidence: "medium" },
  Oil: { tax: "zero_rated", why: "Could be cooking oil.", confidence: "low" },
  Widget: { tax: "unknown", why: "", confidence: "low" },
};
const asked = [];
const ask = async (item) => (asked.push(item), ANSWERS[item.name]);

async function withItems(client) {
  const { companyId, userId } = await aCompanyWith(client);
  const item = async (name, tax = null) =>
    (await client.query("INSERT INTO stock_items (company_id, name, unit, created_by, tax, tax_by) VALUES ($1,$2,'each',$3,$4,$5) RETURNING id", [companyId, name, userId, tax, tax && "you"])).rows[0].id;
  const row = async (id) => (await client.query("SELECT tax, tax_by, tax_why FROM stock_items WHERE id = $1", [id])).rows[0];
  return { companyId, item, row };
}

describe("an item's GST class", () => {
  it("keeps a sure answer from the model, and says it was the model's", () =>
    inRollback(async (client) => {
      const { companyId, item, row } = await withItems(client);
      for (const [name, tax] of [["Rice, 25 kg bag", "zero_rated"], ["Cement, 50 kg bag", "standard"], ["Office rent", "exempt"]]) {
        const id = await item(name);
        const out = await guessTax(client, { companyId, itemId: id, ask });
        expect(out).toMatchObject({ tax, taxBy: "ai" });
        expect(await row(id)).toMatchObject({ tax, tax_by: "ai" });
        expect((await row(id)).tax_why).toBeTruthy();
      }
      expect(asked.at(-1)).toMatchObject({ name: "Office rent", pack: "MV" });
    }));

  it("leaves it for a person when the model is unsure or does not know", () =>
    inRollback(async (client) => {
      const { companyId, item, row } = await withItems(client);
      for (const name of ["Oil", "Widget"]) {
        const id = await item(name);
        const out = await guessTax(client, { companyId, itemId: id, ask });
        expect(out.tax).toBeNull();
        expect(await row(id)).toMatchObject({ tax: null, tax_by: null });
      }
    }));

  it("never asks about, or changes, what a person said", () =>
    inRollback(async (client) => {
      const { companyId, item, row } = await withItems(client);
      const id = await item("Rice, 25 kg bag", "standard");
      const before = asked.length;
      expect(await guessTax(client, { companyId, itemId: id, ask })).toMatchObject({ tax: "standard", taxBy: "you" });
      expect(asked.length).toBe(before);
      expect(await row(id)).toMatchObject({ tax: "standard", tax_by: "you" });
    }));

  it("answers with what is known when there is no model", () =>
    inRollback(async (client) => {
      const { companyId, item } = await withItems(client);
      expect(await guessTax(client, { companyId, itemId: await item("Rice, 25 kg bag"), ask: null })).toMatchObject({ tax: null });
    }));
});

describe("what the model is told", () => {
  it("names MIRA's lists and the traps in them", () => {
    const p = itemTaxPrompt({ name: "Kerosene", unit: "litre", kind: "product", pack: "MV" });
    expect(p).toMatch(/rice, sugar and flour/);
    expect(p).toMatch(/kerosene, jet fuel and lubricating oils are standard/);
    expect(p).toMatch(/rent from leasing/);
    expect(p).toMatch(/"Kerosene"/);
    expect(itemTaxPrompt({ name: "x", unit: "each", kind: "product", pack: "GENERIC" })).toMatch(/answer unknown/);
  });

  it("turns anything it cannot use into unknown and low", () => {
    expect(itemTaxValidator.parse({ tax: "reduced", why: 3, confidence: "certain" })).toEqual({ tax: "unknown", why: "", confidence: "low" });
  });
});
