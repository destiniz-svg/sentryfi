# Imports and trade: a domain reference for Sentryfi

*Last researched: 22 September 2026*

Sentryfi is built for small importing businesses — the Maldivian trader who
brings in a container of household goods, the electronics shop that airfreights
phones, the boutique that pays a supplier in Guangzhou by TT. This document is
the ledger's reference for what happens between a supplier's invoice and a
landed, sellable item on a shelf: which Incoterm applies, who pays what, how
customs values goods, how freight cost is spread across a shipment, what each
payment method really costs, and how established accounting systems
(QuickBooks, Xero, Zoho Books, Odoo, ERPNext, SAP Business One) model landed
cost — what they get right and where users get stuck. Every section ends with
"what this means for the ledger": the fields to capture and postings to make.

Nothing here is legal or customs advice. Rules differ by country; where a
Maldives-specific rule could not be verified from a public source, it is
flagged rather than guessed.

---

## 1. Incoterms 2020

Incoterms are eleven three-letter rules published by the International
Chamber of Commerce. They fix who arranges and pays for transport and
insurance, who clears customs, and — separately from cost — the exact point
where **risk** of loss or damage passes from seller to buyer. Cost and risk do
not always transfer at the same point, which is the most misunderstood fact
about Incoterms. [OVRSEA: Incoterms 2020 explained](https://www.ovrsea.com/insights/en/guides/incoterms-2020-who-pays-what), [Refopedia: Incoterms 2020](https://refopedia.com/entries/incoterms-2020)

Incoterms govern the buyer/seller relationship and freight allocation. They
say nothing about customs valuation for duty purposes (Section 2) — though a
CIF price already includes freight and insurance, which is exactly what most
customs regimes tax.

### The eleven rules

| Code | Name | Seller pays up to | Risk transfers | Import clearance |
|---|---|---|---|---|
| **EXW** | Ex Works | Nothing — collected at seller's door | On goods being made available | Buyer |
| **FCA** | Free Carrier | Delivery to buyer's named carrier | On handover to first carrier | Buyer |
| **CPT** | Carriage Paid To | Freight to named destination | On handover to first carrier (origin) | Buyer |
| **CIP** | Carriage & Insurance Paid To | Freight + insurance to destination | On handover to first carrier (origin) | Buyer |
| **DAP** | Delivered at Place | Transport to named place, unloaded by buyer | On arrival, ready to unload | Buyer |
| **DPU** | Delivered at Place Unloaded | Transport + unloading | After unloading | Buyer |
| **DDP** | Delivered Duty Paid | Everything, incl. duty/tax | On arrival, duty paid | **Seller** |
| **FAS** | Free Alongside Ship | Delivery alongside vessel | Once alongside ship | Buyer |
| **FOB** | Free On Board | Loading onto vessel | Once on board | Buyer |
| **CFR** | Cost and Freight | Freight to destination port | Once on board **at origin** | Buyer |
| **CIF** | Cost, Insurance & Freight | Freight + min. insurance to destination port | Once on board **at origin** | Buyer |

FAS/FOB/CFR/CIF are sea/inland-waterway only; the other seven apply to any
mode. For the four "C" terms (CPT, CIP, CFR, CIF), the seller pays freight to
the destination but risk passes at origin — the buyer carries the entire
voyage's risk even though the seller is still paying for it. [Delpa Group: Incoterms 2020 guide](https://www.delpagroup.com/en/guias/incoterms), [Portlogics: Incoterms 2020](https://portlogics.com/insights/incoterms-2020-guide), [Mighty International: FOB/CIF/CFR/DDP](https://www.mightyshipping.com/en/guides/incoterms-fob-cif-cfr-ddp)

### The common Maldivian/SME cases

- **FOB** — supplier loads at origin port; buyer's forwarder takes the main
  freight, insurance, and all destination charges from there. Common for
  repeat importers with their own forwarder.
- **CIF** — supplier's price bundles freight and minimum insurance to the
  destination port; buyer still pays destination charges (handling,
  clearance, inland transport) on top. Common for first-time/low-volume
  importers avoiding direct forwarder relationships.
- **CFR** — like CIF minus insurance; rarer, used where the buyer has a
  blanket marine policy.
- **EXW** — buyer (or their agent) handles everything from the factory door,
  including export formalities abroad; cheapest quoted price, most buyer
  execution risk. Trade professionals increasingly recommend FCA instead.
- **DDP** — supplier delivers duty-paid to the buyer's door; one all-in
  number but poor visibility into the cost breakdown, which hurts
  landed-cost accuracy (Section 6).

### What this means for the ledger

- Store the Incoterm as a structured field on every PO/supplier invoice, not
  free text — it drives which cost categories to expect on top of goods
  price (e.g. FOB should prompt for freight and insurance as separate lines;
  DDP should warn duty is bundled and offer to break it out).
- Never build logic on the assumption that risk-transfer point equals
  cost-responsibility point.
- Ask the Incoterm before offering freight-allocation defaults, since EXW/FOB
  shipments carry cost lines that CIF/DDP shipments have already absorbed.

---

## 2. Customs valuation: the WTO transaction value method

Most countries, as WTO members, base import duty on the Customs Valuation
Agreement (Article VII of GATT 1994). **Method 1 — transaction value** —
applies to the large majority of shipments; five fallback methods (identical
goods, similar goods, deductive, computed, fall-back) apply only when
Method 1 cannot be used. [WTO: Customs Valuation technical information](https://www.wto.org/english/tratop_e/cusval_e/cusval_info_e.htm), [GOV.UK: Method 1 — transaction value](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value)

### The starting point and mandatory additions (Article 8)

Transaction value = price actually paid or payable for export, **plus** (to
the extent not already included):

- Commissions and brokerage — **except buying commissions**, which are
  excluded (a common point of confusion).
- Packing costs and containers treated as one with the goods.
- **Assists** — materials, tools, dies, moulds, engineering or design the
  buyer supplies free or cheap for production, apportioned across the goods.
- **Royalties/licence fees** tied to the goods that the buyer must pay as a
  condition of sale, to the extent not already in the price.
- Any resale proceeds that accrue back to the seller.
- **Transport, loading, handling and insurance to the place of importation**
  — for Members (most countries) that value on a CIF basis. [WCO Guide to Customs Valuation and Transfer Pricing](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/key-issues/revenue-package/wco-guide-to-customs-valuation-and-transfer-pricing.pdf), [customs-compliance.ai: 6 valuation methods](https://customs-compliance.ai/blog/customs-valuation-methods-explained)

**Not added**: buying commissions, post-import transport/construction, and
duty itself (duty is calculated *from* the value, not folded into it).

### Why duty is usually computed on CIF

Because most regimes require freight and insurance to be added when not
already in the price, duty ends up levied on a **CIF-equivalent value**
regardless of the commercial Incoterm:

- **CIF invoices** — the invoice price is already close to the customs value.
- **FOB/EXW invoices** — freight and insurance must be added before
  declaring customs value; customs will not accept an FOB-only value.
- **DDP invoices** — the value must in principle be backed out to
  CIF-equivalent (excluding the bundled duty), which is fiddly to reconcile.

**Worked example.** FOB Shanghai USD 10,000, freight USD 900, insurance
USD 60:

```
FOB value              10,000.00
+ Freight                 900.00
+ Insurance                60.00
= CIF (dutiable) value 10,960.00
```

At 15% duty, duty payable is USD 1,644.00 — on 10,960, not 10,000. A system
that only reads the FOB supplier invoice under-declares the dutiable base by
USD 960.

### What this means for the ledger

- Store the **customs (dutiable) value** separately from the commercial
  invoice value — they coincide only under CIF with no Article 8 additions.
- For FOB/CFR/EXW/FCA shipments, prompt for freight and insurance (actual or
  estimated) to compute and store the CIF-equivalent value used for duty,
  reconciled later against the actual assessment.
- Provide (rarely-used) fields for assists and royalties so they aren't
  silently missed.
- Never let the duty amount feed back into the CIF value calculation — duty
  is computed *from* CIF, never the reverse.

---

## 3. Freight pricing and cost allocation

### FCL — flat rate per container

FCL is priced as a flat rate per container, independent of exactly what mix
of goods is inside, so the lump sum must be **allocated** across the goods:

- **By value** — simple, matches insurance practice, but not physically
  meaningful; fine when goods are similar in density/value.
- **By quantity** — fair only when cartons are genuinely similar in size.
- **By weight** — fair when items differ mainly by weight, not bulk.
- **By volume (CBM)** — fair when items differ mainly by bulk, not weight.
- **By chargeable weight** — combines both; the most defensible general
  basis for genuinely mixed cargo.

### LCL sea freight — chargeable weight

LCL is charged on **chargeable weight = greater of** actual tonnes or CBM,
under the convention **1 CBM = 1,000 kg** — cargo denser than that is billed
on weight, lighter cargo on volume. [Maersk: air cargo chargeable weight](https://www.maersk.com/logistics-explained/transportation-and-freight/2025/03/10/air-cargo-chargeable-weight), [Carra Globe: volumetric weight calculator](https://carraglobe.com/volumetric-weight-calculator/) Because the carrier bills per CBM/tonne, allocate LCL freight **by CBM** to match how it was billed.

**Worked example.** Two lines consolidated LCL:

| Line | Weight | Volume |
|---|---|---|
| A — ceramic tiles | 2,000 kg | 1.2 CBM |
| B — plastic homeware | 300 kg | 3.0 CBM |
| **Total** | **2.3 t** | **4.2 CBM** |

Chargeable weight = max(2.3 t, 4.2 CBM) = **4.2** (volume wins). At USD
55/CBM, freight = USD 231.00. By CBM (correct basis): A gets USD 66.00, B
gets USD 165.00. By weight instead (wrong basis here): A would get USD
200.74, B only USD 30.13 — heavily over-costing the dense tiles because
weight isn't what the carrier actually charged for.

### Air freight — IATA divisor 6,000

```
Volumetric weight (kg) = (L × W × H in cm) / 6,000
Chargeable weight = MAX(actual gross weight, volumetric weight)
```

The divisor corresponds to ~167 kg/m³: denser cargo is billed on actual
weight, bulkier cargo on volumetric weight. [volumetricweightcalculator.com: IATA volumetric weight calculation](https://www.volumetricweightcalculator.com/blog/IATA-Volumetric-Weight-Calculation-Air-Freight-Billing-Guide.html), [time:matters: What is chargeable weight?](https://www.time-matters.com/emergency-logistics-glossary/chargeable-weight/)

**Worked example.** A 60×50×40 cm carton weighing 18 kg actual: volumetric =
(60×50×40)/6,000 = 20 kg; chargeable = max(18, 20) = **20 kg**. The airline
bills for 2 kg of "phantom" space the light, bulky carton occupies.

### Courier/express differences

Couriers (DHL, FedEx, UPS) commonly use a **divisor of 5,000**, giving a
higher volumetric weight than standard air cargo for the same dimensions. [Cargoplot: volumetric weight air freight guide](https://www.cargoplot.com/resources/article/volumetric-weight-air-freight-calculator-guide) Courier invoices are also often priced per parcel with clearance/duty
sometimes bundled in — this needs **unbundling** before allocation.

### Allocation bases side by side — same shipment, different unit costs

**Worked example.** One 20ft FCL with two lines, freight USD 1,000 flat:

| Line | Units | Value | Weight | Volume |
|---|---|---|---|---|
| A — steel fittings | 500 | USD 2,500 | 4,000 kg | 2.0 CBM |
| B — LED fixtures | 500 | USD 7,500 | 1,000 kg | 18.0 CBM |

| Basis | A gets | A / unit | B gets | B / unit |
|---|---|---|---|---|
| By value | 250.00 | 0.50 | 750.00 | 1.50 |
| By quantity | 500.00 | 1.00 | 500.00 | 1.00 |
| By weight | 800.00 | 1.60 | 200.00 | 0.40 |
| By volume | 100.00 | 0.20 | 900.00 | 1.80 |
| By chargeable weight | ~180.00 | 0.36 | ~820.00 | 1.64 |

Unit freight cost swings by up to 8× depending purely on the chosen basis,
for the same physical shipment.

**Guidance.** Dense/cheap goods sharing space with light/expensive goods
(steel + LEDs above) → use chargeable weight or volume; using value or
quantity badly under-costs the bulky line. Similar density, different value
→ by value is fine. Similar value, different bulk → by weight/volume. LCL or
air already billed on chargeable weight → allocate by chargeable weight to
match what was actually paid. No reliable weight/volume data → fall back to
value, flagged as approximate.

### What this means for the ledger

- Store, per shipment: mode, container/consignment size, total freight, and
  per line: quantity, value, weight, volume — so any basis can be computed
  without re-entry.
- Let the user pick the allocation basis per shipment (suggest chargeable
  weight for LCL/air/mixed FCL, value for homogeneous FCL) rather than
  hard-coding one method.
- Auto-compute chargeable weight (CBM×1,000 vs kg for sea; /6,000 for air;
  /5,000 for courier).
- Show the resulting unit cost under two bases side by side when a container
  is visibly mixed, so the user can sanity-check before accepting a default.
- Record the allocation basis as an auditable choice, since it feeds unit
  cost and margin reporting.

---

## 4. Payment methods and their true cost

Every method has a visible fee and a less obvious cost (financing, tied-up
cash, or FX spread — Section 5). The accounting question is always: does the
fee belong in cost of goods, finance cost, or on the balance sheet as a
prepayment/receivable?

### Telegraphic transfer / SWIFT (TT, MT103)

Charge allocation is set in SWIFT field 71A: **OUR** (sender pays all fees,
beneficiary gets the full amount), **SHA** (shared — sender pays their own
bank's fee, correspondent fees come off the beneficiary; the common default),
**BEN** (beneficiary pays everything, deducted from what they receive). [Razorpay: What is MT103 SWIFT confirmation](https://razorpay.com/blog/what-is-mt103-swift/), [Karboncard: Fee split — BEN vs SHA vs OUR](https://www.karboncard.com/blog/fee-split-ben-sha-our)
Typical costs: a flat outward TT fee, possible correspondent deductions under
SHA, and sometimes a separate MT103 confirmation-copy fee (~USD 20–50). [alphatechfinance.com: SWIFT payment explained](https://alphatechfinance.com/finance/swift-payment-explained-2026/)

**Treatment**: the transfer fee is a **bank/finance charge**, not goods cost
— it is the cost of moving money. Any shortfall the supplier bears under
SHA/BEN is also a finance cost, not a discount on goods. Do not capitalise
TT fees into inventory.

### Letters of credit (L/C)

**Sight L/C** — issuing bank pays on presentation of compliant documents. [Drip Capital: LC at sight](https://www.dripcapital.com/resources/blog/sight-lc-letter-of-credit) **Usance L/C** — payment deferred (e.g. 60/90/180 days), financing the buyer. [Financely Group: Usance letter of credit guide](https://www.financely-group.com/usance-letter-of-credit-guide)

Fees, roughly 0.25–2% of L/C value in total: [Financely Group: Letter of credit fees 2025](https://www.financely-group.com/letter-of-credit-fees-2025)

- **Issuing fee** (buyer's bank, opening the L/C), **advising fee**
  (seller's bank, notifying them), **confirmation fee** (0.1–0.5%, if the
  seller wants the advising bank's own guarantee), **negotiation fee**
  (0.1–0.2%, document check/fund advance), **amendment fee** (flat, per
  change), **discrepancy fee** (USD 50–150 per discrepancy per
  presentation). [FasterCapital: Sight LC fees](https://fastercapital.com/content/Sight-Letter-of-Credit-Fees--What-You-Need-to-Know-Before-You-Import.html)
- **Cash margin** — collateral (10–100% of value) the issuing bank commonly
  requires before issuing the L/C.

**Treatment**: all wrapper fees (issuing/advising/confirmation/negotiation/
amendment/discrepancy) are **finance cost**, expensed as incurred by
default — not capitalised into inventory unless the business deliberately
wants a fully loaded landed cost. The **cash margin is still the buyer's
cash**, just restricted — record as a restricted cash / margin deposit
asset, not an expense, until released or applied. The underlying goods cost
paid via the L/C is ordinary inventory cost.

### Documents against payment / against acceptance (D/P, D/A)

Documentary collection: the exporter's bank releases shipping documents via
the importer's bank only on payment (D/P) or on acceptance of a time draft
(D/A, typically 30–180 days deferred). [Trade Finance Global: documentary collections](https://www.tradefinanceglobal.com/posts/documentary-collections-instructions-for-use/), [Credlix: D/P and D/A payment terms](https://www.credlix.com/blogs/understanding-documentary-collection-d-p-and-d-a-payment-terms) Banks act as document handlers, not payment guarantors — cheaper than an
L/C (flat collection fees, not percentage-based), riskier for the seller
under D/A than under an L/C. [Trade.gov: Methods of payment](https://www.trade.gov/methods-payment)

**Treatment**: collection fees are a small finance/bank charge, expensed as
incurred. Under D/A, record the accepted draft as an ordinary trade payable;
split out any explicit interest/discount element to finance cost.

### Open account / credit terms

Supplier ships and invoices; buyer pays later per agreed terms, no bank
instrument enforcing it — highest seller risk, cheapest to administer.
**Treatment**: a standard trade payable; no special fee handling.

### Advance payments and part-payments in batches

Deposits (commonly ~30%) before production/shipment, sometimes split into
milestone tranches. **Treatment**: an advance for goods not yet received is
**not yet an expense or inventory** — it is a **prepayment (advance to
supplier)** asset, converting to inventory cost only when goods are received
(per the Incoterm's risk-transfer point). Track each tranche against its PO,
since each was likely paid at a different exchange rate (Section 5).

### What this means for the ledger

- Store payment method per invoice/shipment as a structured field: TT (with
  OUR/SHA/BEN), L/C (sight/usance, with sub-fields for each fee type and
  cash margin), D/P, D/A, open account, or advance/part-payment schedule.
- Post bank/finance-instrument fees to a **finance cost** account by
  default, separate from cost of goods, with an override for a fully loaded
  landed-cost policy.
- Track L/C cash margin as restricted cash, not an expense, until released.
- Track advances as prepayments until goods are received, preserving each
  tranche's date and amount for the FX-difference calculation (Section 5).
- Split D/A and usance L/C payables into principal vs. any explicit
  interest/discount, routing the latter to finance cost.

---

## 5. The bank's FX spread vs the published/mid rate

### What it is, and why it's bigger than the visible fee

The **mid-market rate** is the true midpoint of a currency pair, with no
markup. [Airwallex: understanding the mid-market rate](https://www.airwallex.com/global/blog/understanding-the-mid-market-exchange-rate) Banks typically quote a worse rate and advertise "no transfer
fee" — the cost is hidden inside the rate, not shown as a line item. [opendue.com: FX spreads and hidden costs](https://www.opendue.com/blog/fx-spreads-and-hidden-cross-border-payment-costs) Typical markups: **2–4% at major banks**, up to 5% at smaller regional
banks, vs **0.3–1.0%** at specialist FX providers. [Airwallex: bank exchange rate markup](https://www.airwallex.com/en-ca/blog/bank-exchange-rate-markup-hidden-costs) A visible USD 25 wire fee looks small; a 3% spread on a USD 10,000 payment
is USD 300 — twelve times the visible fee, and it never appears as a line.

### How to measure it

```
Spread % = (Bank's applied rate − Mid-market rate at execution) / Mid-market rate at execution
```

Compare the rate actually applied against the mid-market rate at the same
moment the payment was executed. [mycurrencycost.com: 5 ways banks mark up FX rates](https://www.mycurrencycost.com/blog/5-ways-banks-mark-up-foreign-exchange-rates/)

**Worked example.** Invoice USD 10,000; mid-market rate at payment MVR
15.42/USD; bank actually applies MVR 15.87/USD.

```
Mid-market cost:    10,000 × 15.42 = MVR 154,200
Bank's actual cost: 10,000 × 15.87 = MVR 158,700
Hidden FX spread:   MVR 4,500 (≈ 2.9%)
```

### Why it's part of cost, but the exchange difference is not

Two different things happen at once:

1. **The FX spread** (bank's rate vs mid-market, both at payment date) is
   part of what was actually paid to acquire the goods — it belongs in
   landed cost, like a wire fee.
2. **The gap between invoice-date rate and payment-date rate** is pure
   currency movement over time, unrelated to the bank's margin — a realised
   exchange gain/loss (finance item), **not** capitalised into goods cost.

**Worked example, continued.** Invoice recorded at MVR 15.30/USD (invoice
date) → inventory provisionally MVR 153,000. Payment later at mid-market MVR
15.42/USD, bank applies MVR 15.87/USD:

- Inventory stays at (or near) MVR 153,000 — not revised for later rate
  movement.
- 15.30 → 15.42 movement = realised exchange loss of MVR 1,200 (finance).
- 15.42 → 15.87 spread = MVR 4,500 bank cost — must **not** be mixed into
  "exchange difference," since it didn't come from currency movement.

### What this means for the ledger

- Capture, per payment: the invoice/recognition-date rate, the mid-market
  rate at payment, and the rate actually applied. Three numbers, not one.
- Post invoice-to-payment rate movement as a **realised exchange gain/loss**
  (finance item), never as an inventory cost adjustment.
- Post the applied-rate-vs-mid-market spread as a bank/FX cost (landed cost
  or a separate finance line, per policy) — kept visibly distinct from the
  exchange-difference line.
- Where the mid-market rate can't be captured automatically, at least record
  the source and rate used, so spread analysis is possible later.

---

## 6. Landed cost in practice

Landed cost = goods price + freight + insurance + duty + clearance/handling +
any other cost directly attributable to bringing goods to a sellable,
in-stock state.

**Generally capitalised**: goods price (net of discounts), inbound freight
and cargo insurance, import duty and non-recoverable import tax (recoverable
VAT/GST is a receivable, not a cost), clearance/brokerage and port/terminal
handling, inland transport to the warehouse, and landed-relevant FX cost
where policy includes it (Section 5).

**Generally expensed**: general (non-shipment-specific) bank fees, L/C
wrapper fees by default (Section 4), storage *after* goods are ready for
sale (a period cost — though storage while still in transit or awaiting
customs release is more defensibly capitalised), and selling/admin costs.

**Costs arriving after the goods are sold.** Freight, duty, or demurrage
invoices sometimes land weeks after sale. Strictly: if the goods are still
in stock, capitalise and re-average unit cost; if already sold, the cost
should flow to COGS retroactively, split proportionally if the shipment is
partly sold and partly still on hand.

**Part shipments.** When one PO/container is split into multiple deliveries,
lump-sum costs (freight etc.) must be allocated across each part-shipment
using the same basis logic as Section 3, applied per despatch.

**Short/damaged goods and credit notes.** Short-shipped quantities reduce the
inventory receipt to what actually arrived; the shortfall becomes a claim,
not a cost spread over the units that did arrive. Damaged goods covered by
insurance or a credit note become a receivable/claim; uninsured, unrecoverable
damage is written off as a loss — never silently spread across surviving
units' unit cost. Credit notes received after costing/sale are handled like
late-arriving costs above.

**Duty refunds/drawback.** Drawback refunds duty already paid (up to ~99% in
some jurisdictions) when goods are re-exported or destroyed under customs
supervision — distinct from a bonded warehouse, where duty was never paid. [Wikipedia: Duty drawback](https://en.wikipedia.org/wiki/Duty_drawback) Record original duty as landed cost at import; record a later drawback
refund as a recovery (reducing cost if goods are still held, else other
income/COGS credit). **Maldivian drawback mechanics could not be verified**
from public sources — confirm with MIRA/Maldives Customs before encoding.

**Demurrage and storage.** Demurrage/storage while goods are still in
transit or awaiting customs release is generally capitalisable (goods aren't
sellable yet); demurrage caused by the importer's own delay is sometimes
kept as a separate exceptional cost so it doesn't distort normal unit cost.

**Bonded warehousing.** Goods held in-bond defer duty until released for
domestic sale (or duty is waived on direct re-export). [Wikipedia: Bonded warehouse](https://en.wikipedia.org/wiki/Bonded_warehouse) Track quantity/value while in bond, but don't recognise duty until release.
Storage fees while in bond are a capitalisable landed cost, like demurrage.

**Insurance claims.** Claim proceeds are a receivable from the insurer,
offsetting the loss on the damaged/lost goods — never netted silently into
the surviving units' cost. Any excess/deductible borne by the importer is
tracked separately so the incident's net cost stays visible.

### What this means for the ledger

- Model landed cost as its own **shipment-level cost pool** (goods, freight,
  insurance, duty, clearance, inland transport as separate lines) allocated
  to product lines by the chosen basis — not one blended number per product.
- Keep a capitalise-vs-expense flag per cost type with sensible defaults,
  overridable per shipment.
- Support **late-arriving costs**: attach a cost to an already-received
  (possibly already-sold) shipment, auto-split between remaining inventory
  (re-average) and COGS by proportion still on hand.
- Support **part shipments**: shipment-level costs allocable across multiple
  despatch/receipt events tied to one PO.
- Track short-shipment/damage/credit-note events as adjustments with a
  linked claim/receivable where recovery is expected.
- Track duty paid and drawback claimed/received separately, flagged for
  confirmation with MIRA/Customs before relying on any built-in assumption.
- Model bonded-warehouse holding without a duty line until release, then add
  duty as assessed at release.
- Record insurance claims as receivables against a specific loss event, kept
  distinct from the loss and any uninsured excess.

---

## 7. How established systems model this

| System | Model | Gets right | Users complain about |
|---|---|---|---|
| **QuickBooks** | No native landed cost in QuickBooks Online; Enterprise has an Advanced-Inventory add-on. Most QBO users allocate on an external worksheet, then post adjusted item costs back manually. [Intuit: Landed cost FAQs](https://quickbooks.intuit.com/learn-support/en-us/help-article/set-inventory-lists/landed-cost-faqs/L2JMpbLbo_US_en_US) | Enterprise's version ties landed cost bills to specific POs/receipts and adjusts item cost properly. | QBO (the SME tier) has none at all — described as "a workflow problem, not a settings problem"; users fall back to spreadsheets or third-party apps. [invoicedataextraction.com: QBO landed cost allocation](https://invoicedataextraction.com/blog/quickbooks-online-landed-cost-allocation) |
| **Xero** | No native allocation feature; standard workaround is separate bill lines for freight/duty, or dedicated carrier/broker bills, allocated manually by value or weight. [Xero Product Ideas: landed cost allocation](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/48529637-inventory-landed-cost-allocation) | Flexible bill-line structure at least captures the raw cost data. | Long-standing open feature request; users route through third-party apps (Cin7, DEAR, Finale) or manual, error-prone workarounds. [Xero Community: landed cost discussion](https://community.xero.com/business/discussion/13022779) |
| **Zoho Books** | Native landed cost: record adjustments (freight, customs, insurance) against a bill/purchase and allocate across items. | One of few mainstream SME tools with this built in "for years." | Allocation options seen as somewhat rigid; heavy manual entry for multi-shipment scenarios. [Zoho Community: landed cost allocation](https://help.zoho.com/portal/ja/community/topic/landed-cost-allocation-custom-duty-manual-data-entry-28-7-2023?page=1) |
| **Odoo** | Native "Landed Costs" document referencing one or more receipts; splits costs by a chosen method (quantity/weight/volume/cost); posts a Valuation Adjustment (debit stock, credit expense). [Odoo 18 documentation: landed costs](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/landed_costs.html) | Ties directly to the original receipt/PO; posts the journal automatically; multiple split methods. | Needs perpetual/automated valuation enabled for auto-posting; initial config (journal, feature flag) trips up new users. |
| **ERPNext** | Native "Landed Cost Voucher" referencing Purchase Receipts, allocating additional costs by amount/qty/weight, updating item valuation rate. | Purpose-built for exactly this; open-source, self-hostable at low cost. | Full-ERP overhead versus a lightweight accounting app for a business that only needs landed cost. |
| **SAP Business One** | Dedicated "Landed Costs" document referencing goods-receipt POs; multiple cost lines, each with its own allocation method (qty/weight/volume/value). | Enterprise-grade rigor: per-line allocation basis, strong audit trail, tight GL integration. | Considerable cost/complexity relative to a small importer's simple FOB/CIF needs. |

The pattern across the stronger systems (Zoho Books, Odoo, ERPNext, SAP B1):
landed cost is its own **document type**, referencing the original
purchase/receipt, with allocation basis settable **per cost line**, posting
a valuation adjustment automatically. The weaker pattern (QuickBooks Online,
Xero out of the box) treats it as a manual bookkeeping exercise bolted onto
ordinary bills, pushed onto spreadsheets or third-party apps.

### What this means for the ledger

- Model landed cost as its own document type referencing one or more
  receipts/shipments — the Odoo/ERPNext/SAP B1 pattern, not the QuickBooks/
  Xero "bolt cost onto a bill" pattern. This is where Sentryfi can beat the
  two dominant SME tools out of the box.
- Allow **allocation basis per cost line** within one landed cost document
  (freight by volume, insurance by value, in the same shipment).
- Auto-post the valuation adjustment on confirmation — debit inventory
  value, credit the relevant expense/payable — never a manual journal.
- Make multi-shipment allocation (one freight invoice spread across several
  POs/containers) a first-class case, since rigid, single-shipment-only
  allocation is Zoho Books' known weak point.

---

## Sources

- [OVRSEA: Incoterms 2020 explained](https://www.ovrsea.com/insights/en/guides/incoterms-2020-who-pays-what)
- [Refopedia: Incoterms® 2020](https://refopedia.com/entries/incoterms-2020)
- [Delpa Group: Incoterms 2020 complete guide](https://www.delpagroup.com/en/guias/incoterms)
- [Portlogics: Incoterms 2020, all 11 rules](https://portlogics.com/insights/incoterms-2020-guide)
- [Mighty International: Incoterms FOB/CIF/CFR/DDP](https://www.mightyshipping.com/en/guides/incoterms-fob-cif-cfr-ddp)
- [WTO: Customs Valuation — technical information](https://www.wto.org/english/tratop_e/cusval_e/cusval_info_e.htm)
- [WCO: Guide to Customs Valuation and Transfer Pricing (2018)](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/key-issues/revenue-package/wco-guide-to-customs-valuation-and-transfer-pricing.pdf)
- [GOV.UK: Customs valuation — Method 1, transaction value](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value)
- [customs-compliance.ai: Customs valuation, 6 methods explained](https://customs-compliance.ai/blog/customs-valuation-methods-explained)
- [Maersk: Air cargo chargeable weight](https://www.maersk.com/logistics-explained/transportation-and-freight/2025/03/10/air-cargo-chargeable-weight)
- [Carra Globe: Volumetric weight calculator](https://carraglobe.com/volumetric-weight-calculator/)
- [volumetricweightcalculator.com: IATA volumetric weight calculation](https://www.volumetricweightcalculator.com/blog/IATA-Volumetric-Weight-Calculation-Air-Freight-Billing-Guide.html)
- [time:matters: What is chargeable weight?](https://www.time-matters.com/emergency-logistics-glossary/chargeable-weight/)
- [Cargoplot: Volumetric weight air freight guide](https://www.cargoplot.com/resources/article/volumetric-weight-air-freight-calculator-guide)
- [Razorpay: What is MT103 SWIFT confirmation](https://razorpay.com/blog/what-is-mt103-swift/)
- [Karboncard: Fee split — BEN vs SHA vs OUR explained](https://www.karboncard.com/blog/fee-split-ben-sha-our)
- [alphatechfinance.com: SWIFT payment explained (2026)](https://alphatechfinance.com/finance/swift-payment-explained-2026/)
- [Drip Capital: LC at sight — meaning, process](https://www.dripcapital.com/resources/blog/sight-lc-letter-of-credit)
- [Financely Group: Usance letter of credit guide](https://www.financely-group.com/usance-letter-of-credit-guide)
- [Financely Group: Letter of credit fees 2025](https://www.financely-group.com/letter-of-credit-fees-2025)
- [FasterCapital: Sight letter of credit fees](https://fastercapital.com/content/Sight-Letter-of-Credit-Fees--What-You-Need-to-Know-Before-You-Import.html)
- [Trade Finance Global: Documentary collections — instructions for use](https://www.tradefinanceglobal.com/posts/documentary-collections-instructions-for-use/)
- [Credlix: Understanding documentary collection, D/P and D/A](https://www.credlix.com/blogs/understanding-documentary-collection-d-p-and-d-a-payment-terms)
- [Trade.gov: Methods of payment](https://www.trade.gov/methods-payment)
- [Airwallex: Understanding the mid-market exchange rate](https://www.airwallex.com/global/blog/understanding-the-mid-market-exchange-rate)
- [Airwallex: Bank exchange rate markup — hidden costs](https://www.airwallex.com/en-ca/blog/bank-exchange-rate-markup-hidden-costs)
- [opendue.com: FX spreads and hidden cross-border payment costs](https://www.opendue.com/blog/fx-spreads-and-hidden-cross-border-payment-costs)
- [mycurrencycost.com: 5 ways banks mark up foreign exchange rates](https://www.mycurrencycost.com/blog/5-ways-banks-mark-up-foreign-exchange-rates/)
- [Wikipedia: Duty drawback](https://en.wikipedia.org/wiki/Duty_drawback)
- [Wikipedia: Bonded warehouse](https://en.wikipedia.org/wiki/Bonded_warehouse)
- [Intuit: Landed cost FAQs (QuickBooks)](https://quickbooks.intuit.com/learn-support/en-us/help-article/set-inventory-lists/landed-cost-faqs/L2JMpbLbo_US_en_US)
- [invoicedataextraction.com: QuickBooks Online landed cost allocation](https://invoicedataextraction.com/blog/quickbooks-online-landed-cost-allocation)
- [Xero Product Ideas: Inventory — landed cost allocation](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/48529637-inventory-landed-cost-allocation)
- [Xero Community: Landing cost and import discussion](https://community.xero.com/business/discussion/13022779)
- [Zoho Community: Landed cost allocation / custom duty manual data entry](https://help.zoho.com/portal/ja/community/topic/landed-cost-allocation-custom-duty-manual-data-entry-28-7-2023?page=1)
- [Odoo 18.0 documentation: Landed costs](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/landed_costs.html)

### Not independently verified in this pass

- Maldives-specific customs valuation and duty drawback rules (this document
  uses the general WTO/WCO framework the Maldives is bound by as a WTO
  member; specific MIRA/Maldives Customs procedural detail — exact drawback
  percentages, documentary requirements — was not located from a citable
  public source and should be confirmed directly with Maldives Customs
  Service or MIRA before being encoded as product logic).
- Exact current bank fee schedules (TT charges, L/C fee percentages,
  discrepancy fee amounts) for Maldivian banks specifically — figures above
  are general international ranges from trade-finance sources, not Maldivian
  bank rate cards.
