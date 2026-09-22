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

## 10. The Customs exchange rate, and how an assessment is actually built up

Maldives Customs publishes the rates it accepts at <https://customs.gov.mv/eServices/exchangeRate> ("Customs accepted exchange rate for various currency", with a converter beside it). The page loads its table dynamically, so the figures could not be read automatically; the questions below are what the product needs from it, and each one changes a number on screen.

**a. Which rate applies to a given consignment?** The rate in force on the date of the declaration, the date of assessment, the date of arrival, or the date on the bill of lading. Two of those can straddle a rate change, and the one that applies decides the duty.

**b. How often does the table change, and when does a change take effect?** Daily, weekly or monthly, and from what hour. A product that stores "the Customs rate" without storing which day's table it came from cannot reproduce an old assessment.

**c. Which currencies are listed, and what happens to one that is not?** Whether an unlisted currency is crossed through the dollar, and at whose rate.

**d. Is it the same as the MMA rate?** The rufiyaa is pegged to the dollar, so a dollar invoice is predictable; every other currency is not, and the gap between the Customs table and the bank's rate is a real cost the importer never sees quoted.

**e. Is the rate shown on the assessment notice?** The notice examined shows the assessed CIF but not the rate or the build-up. If the rate is not printed, the product can only record the assessed figure and the date, not verify it.

**f. How is CIF built from an invoice value?** Whether Customs adds the actual freight and insurance from the documents, or a notional percentage where a courier shipment shows no separate freight.

### Why these matter: the arithmetic on a real notice does not close without them

From Assessment Notice A 3494 (6 September 2026), invoice AED 286.00, assessed CIF MVR 1,392.48, processing charge MVR 13.00, non-registration processing fee MVR 130.15:

- The non-registration fee is **exactly ten times** the processing charge. Taken as 10% and 1% of one base, that base is **MVR 1,301.50**, and 1% of it is 13.015 — the 13.00 on the notice, rounded.
- **CIF ÷ that base = 1.0699**, near enough 7%. So the fees appear to be charged on a figure roughly 7% below the assessed CIF, which would be the CIF before some element of freight or insurance.
- **The base against the invoice is MVR 4.5507 per AED**, which is **8.4% above the pegged cross rate** of MVR 4.1988 (MVR 15.42 per USD ÷ AED 3.6725 per USD). Either Customs values in a currency or at a rate that is not the peg cross, or the base already carries freight, or both.
- Taking the peg cross instead, the goods come to MVR 1,200.85 and the assessed CIF is **16.0% above** that — which would be a freight and insurance uplift, and is in the range a courier consignment attracts.

Three readings fit the same four numbers, and they differ by real money on a container. **Settled by:** the clearing agent's own worksheet for this assessment, or Customs' fee schedule and rate table, showing (i) the rate applied, (ii) what was added to reach CIF, and (iii) what base the 1% and 10% are charged on.

**Until it is settled,** a shipment stores the assessed CIF, the fees as charged, and the date of the notice, and shows the owner what was paid rather than a figure the product computed itself. The moment the rule is known, the product can do something better: estimate duty and fees **before** the goods are ordered, which is when the owner can still change the decision.

