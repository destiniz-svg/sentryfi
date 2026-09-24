# What a qualified person must confirm

Started 23 September 2026. Everything here changes what the product posts, so none of it may be settled by inference. Each item says who can answer it and what single document or answer settles it. An item leaves this list when it is answered, with the source recorded in the reference file it belongs to.

## 1. Is GST charged on goods at the point of import? — SETTLED 23 September 2026, by document

**No.** The owner produced a Maldives Customs Assessment Notice (A 3494, 6 September 2026, registry R3531-00PO/2026, CPC 4000-030) for a consignment from Axis Link LLC-FZ Dubai. It shows:

| Line | Amount (MVR) |
|---|---|
| Total invoice value | AED 286.00 |
| Total CIF value | 1,392.48 |
| Processing charge | 13.00 |
| Duty amount | 0.00 |
| Non-registration processing fee | 130.15 |
| **Total to be paid** | **143.15** |

There is no GST line on the notice, and no field for one. Customs assesses duty and fees; GST is not collected at the border. This matches MIRA's scope (tax on goods and services supplied in the Maldives), matches the input tax rules barring a claim on what is not supplied here, and matches what the owner said from the start. The passage in `international-tax-and-einvoicing.md` claiming a border charge was wrong and has been corrected.

**Consequence for the books:** duty, Customs fees, freight, insurance, port and clearing charges and the bank's fee are all part of what the goods cost. There is nothing to reclaim at the border, so no trapped cash and no import-tax receivable. GST appears when the goods are sold.

## 1a. What drives the processing charge and the non-registration processing fee?

On the notice above, with duty at zero, the fees were still MVR 143.15. Two observations, both to be confirmed:

- Maldives Export/Import Law (31/79) is reported to charge a **revenue fee of MVR 1 per MVR 100 of value**, that is 1%. The MVR 13.00 processing charge is consistent with 1% of a base around MVR 1,300.
- The **non-registration processing fee of MVR 130.15 is exactly ten times the processing charge**, which suggests 10% of the same base, charged because the importer is not registered with Customs as an importer.

If that reading is right, registering as an importer removes a 10% charge from every consignment, which on this small shipment was larger than everything else Customs took. **Answered by:** Maldives Customs, or the clearing agent, against the fee schedule. It is worth an hour of somebody's time: the product should tell an owner what registering would have saved them this year.

## 1b. Is the clearing agent GST-registered?

The clearing agent's invoice (Real Zone LLP, INV-171-2026, MVR 4,897.38) charges "S/C 1.5%" and **no GST**. If the agent is not registered, there is no input tax to claim on clearing charges and the whole invoice is cost — which is the unregistered-supplier case the bill flow already handles. If the agent is registered and simply did not charge GST, that is the agent's problem and the invoice is not a valid tax invoice. **Answered by:** the agent's TIN and GST registration status, which the product should hold against the supplier record and check once.

## 2. When may input tax on an import be claimed, and is there a time limit?

Research suggested a twelve-month limit on claiming input tax. If import GST exists, the date it may be claimed (the customs date, the invoice date, or the payment date) decides which return it lands in. **Answered by:** a Maldivian accountant, or MIRA's input tax guidance.

## 3. Duty drawback and re-export

What is recoverable when goods are re-exported or returned to the supplier, and how it is claimed. Affects whether duty paid is a cost or a receivable on goods that leave again. **Answered by:** Maldives Customs, or a clearing agent.

## 4. The real bank charges

TT and letter-of-credit fee schedules at BML and MIB, and the spread each applies against the published rate. The references use international averages. **Settled by:** one bank charge advice for a transfer, and one LC advice.

## 5. The real charges on a clearing agent's invoice

Port handling, delivery order, documentation and storage charges as actually billed in Malé, so the product can offer the right cost types rather than a generic list. **Settled by:** one clearing agent invoice for a recent container.

## 6. Green tax

Rates found in research: US$12 per guest per night at resorts and US$6 at guesthouses, from 2025. Not yet built and not yet verified against MIRA. **Answered by:** MIRA's green tax guidance.

## 7. Income tax: what is deductible and when

The owner's understanding on 23 September 2026 is that income tax deducts all cost. The timing is what needs confirming: stock is deducted when the goods are sold rather than when they are bought, capital items are deducted over their life rather than at once, and some costs are disallowed outright. **Answered by:** a Maldivian accountant against the Income Tax Act, and it decides what the tax computation screen shows.

## 8. Construction and property judgements

Whether "pay when paid" clauses bind in the Maldives, and when control passes on an off-plan property sale under Maldivian contract law. Both change when revenue is recognised. **Answered by:** a Maldivian lawyer or auditor.


## 9. Disbursements on a clearing agent's invoice

Whether MIRA treats a charge paid by an agent on the importer's behalf as a disbursement outside the agent's taxable supply, and what the invoice must show for the importer to claim the GST on the underlying charge (for example the 8% GST on MPL port handling). This decides whether the app claims that tax, and who the underlying invoice must name. **Answered by:** a Maldivian accountant, against MIRA's GST guidance on agents and disbursements.

## 10. The Customs figure is Customs' figure — SETTLED 23 September 2026, by the owner

Customs values a consignment by its own rules: its own exchange rate (published at <https://customs.gov.mv/eServices/exchangeRate>), and uplifts it applies as it sees fit. The assessed CIF is therefore not a figure the product can or should reproduce. An attempt to reverse-engineer one notice (the fees fitting a base of MVR 1,301.50, 8.4% above the pegged cross) found three readings that fit the same numbers, which is the point: it is not ours to compute.

**The rule.** The assessed figures are authoritative and are recorded as charged. The product does not recalculate them, does not flag them as wrong for disagreeing with the invoice, and does not ask the owner to explain Customs' arithmetic. It stores the assessed CIF, each fee as it appears, and the notice's number and date, and it keeps the supplier's invoice beside it at the company's own rate, labelled, never reconciled.

**What the product does instead** is described in PRODUCT.md under "It reads, asks, and learns": it recognises each charge on the document, asks when a line is unclear, and remembers the answer.

The Customs rate table remains useful for one thing only, later: a rough estimate of duty and fees *before* goods are ordered, shown as an estimate and replaced by the notice when it arrives.

## Input Tax Statement: the 17% column (added 24 September 2026)

Tourism GST has been 17% since 1 July 2025, but the Input Tax Statement template we copied (v23.1) has columns for 6, 8, 12 and 16% only. Sentryfi now writes a "GST Charged at 17%" column after the 16% one, so 17% bills are listed and the statement adds up to the return. **To confirm:** the column's exact heading and position in MIRA's current template, and whether GST paid at Customs is listed with Customs as the supplier and the declaration number as the invoice number (Sentryfi uses the shipment's reference until a declaration number is stored).

## Non-resident withholding tax (added 24 September 2026)

Sentryfi keeps tax back from payments to suppliers marked as non-resident, owes it on 2250 "Withholding tax to pay", and lists each month's payments for the MIRA 602, due by the 15th of the next month. The kinds of payment and rates it offers (ledger/tax.js, the Maldives pack) are: rent for property in the Maldives 10%; royalties and the right to use intellectual property 10%; interest not paid to a bank or approved lender 10%; technical, professional or management fees 10%; work done in the Maldives by a non-resident contractor 5% (a bill before parliament in August 2026 would make it 10%); another section 55 payment 10%. **To confirm:** the exact section 55 categories and their letters as MIRA 602 lists them, the contractor rate in force, whether the payer may bear the tax (grossing up), and the MIRA 602's columns so the CSV can match it.
