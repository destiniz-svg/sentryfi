# Imports and trade: a domain reference for Sentryfi

*Last researched: 22 September 2026*

Sentryfi is built for small importing businesses — the Maldivian trader who
brings in a container of household goods, the electronics shop that airfreights
phones, the boutique that pays a supplier in Guangzhou by TT. This document is
the ledger's reference for what actually happens between a supplier's invoice
and a landed, sellable item on a shelf: which Incoterm applies, who pays what,
how customs values the goods, how freight cost is spread across a shipment,
what each payment method really costs, and how established accounting systems
(QuickBooks, Xero, Zoho Books, Odoo, ERPNext, SAP Business One) model landed
cost — what they get right and where users get stuck. Every section ends with
"what this means for the ledger": the fields to capture and the postings to
make, written for the person building or configuring Sentryfi's import
workflow, not for a trade lawyer.

Nothing here is legal or customs advice. Rules differ by country; where a
Maldives-specific rule could not be verified from a public source, it is
flagged rather than guessed.

---

## 1. Incoterms 2020

Incoterms (International Commercial Terms) are eleven three-letter rules
published by the International Chamber of Commerce. They fix three things
between buyer and seller: who arranges and pays for transport and insurance,
who clears export/import customs, and — separately from cost — the exact point
where **risk** of loss or damage passes from seller to buyer. Cost and risk do
not always transfer at the same point, which is the single most
misunderstood fact about Incoterms. [OVRSEA: Incoterms 2020 explained](https://www.ovrsea.com/insights/en/guides/incoterms-2020-who-pays-what), [Refopedia: Incoterms 2020](https://refopedia.com/entries/incoterms-2020)

Incoterms govern the buyer/seller relationship and freight allocation. They
say nothing about customs valuation for duty purposes — that is a separate
question (Section 2), though the terms interact: a CIF price already includes
freight and insurance, which is exactly what many customs regimes want to tax.

### The eleven rules

Grouped by ICC as "any mode of transport" (7 rules) and "sea and inland
waterway only" (4 rules), ordered here from least to most seller obligation:

| Code | Name | Seller pays up to | Risk transfers | Import clearance | Notes |
|---|---|---|---|---|---|
| **EXW** | Ex Works | Nothing — goods collected at seller's premises | The moment goods are made available at seller's door | Buyer | Minimum seller obligation. Buyer arranges export clearance too, which can be a problem in some jurisdictions — many practitioners now recommend FCA instead for exactly this reason. |
| **FCA** | Free Carrier | Delivery to the carrier/place named by buyer | On handover to the first carrier | Buyer | The recommended "container" replacement for FOB when goods are not loaded directly onto a vessel (e.g. handed to a container yard). |
| **CPT** | Carriage Paid To | Freight to named destination | On handover to the first carrier (origin) | Buyer | Seller pays freight but risk passes early — the classic Incoterms trap. |
| **CIP** | Carriage and Insurance Paid To | Freight + insurance to named destination | On handover to the first carrier (origin) | Buyer | Since 2020, CIP requires higher insurance cover (Institute Cargo Clauses A) than CIF. |
| **DAP** | Delivered at Place | Transport to named place, unloading not included | On arrival, ready for unloading | Buyer | Buyer handles import clearance and duty. |
| **DPU** | Delivered at Place Unloaded | Transport and unloading at destination | After unloading at named place | Buyer | Only rule where seller unloads. Replaced the old DAT. |
| **DDP** | Delivered Duty Paid | Everything, including import duty and tax | On arrival, duty paid, ready for unloading | **Seller** | Maximum seller obligation. Buyer does nothing except receive goods. |
| **FAS** | Free Alongside Ship | Delivery alongside the vessel at port | Once placed alongside the ship | Buyer | Sea/inland waterway only. Rare for containerised cargo. |
| **FOB** | Free On Board | Loading the goods onto the vessel | Once goods are on board | Buyer | Sea/inland waterway only. Very common for SME sea imports. |
| **CFR** | Cost and Freight | Freight to destination port | Once goods are on board **at origin** | Buyer | Sea only. Seller pays freight, but risk already passed — buyer bears risk during the entire voyage. |
| **CIF** | Cost, Insurance and Freight | Freight + minimum insurance to destination port | Once goods are on board **at origin** | Buyer | Sea only. The most common term for Maldivian SME imports. Insurance is minimum cover (Institute Cargo Clauses C) unless agreed otherwise. |

[Delpa Group: Incoterms 2020 guide](https://www.delpagroup.com/en/guias/incoterms), [Portlogics: Incoterms 2020](https://portlogics.com/insights/incoterms-2020-guide), [Mighty International: FOB/CIF/CFR/DDP](https://www.mightyshipping.com/en/guides/incoterms-fob-cif-cfr-ddp)

### The common Maldivian/SME cases

Small importers in the Maldives (and similarly reliant import economies)
overwhelmingly see five terms in practice:

- **FOB** — supplier loads at their port, buyer's freight forwarder takes it
  from there. Buyer pays and arranges the main sea freight, marine insurance,
  and all destination charges. Most common when the buyer has their own
  forwarder relationship (common for repeat importers who consolidate
  shipments from Colombo, Singapore, Dubai, or Guangzhou).
- **CIF** — supplier's price already bundles freight and minimum insurance to
  the destination port. Very common for first-time or low-volume importers who
  do not want to deal with a forwarder directly. The buyer still pays
  destination charges (port handling, customs clearance, inland transport)
  on top of the CIF invoice price.
- **CFR** — like CIF but without the insurance; rarer, usually where the buyer
  has their own blanket marine policy.
- **EXW** — supplier merely makes goods available at their factory; buyer (or
  buyer's forwarder acting as agent) handles everything from there, including
  export formalities in the supplier's country. Cheapest quoted price, but
  buyer bears the most execution risk and the widest range of cost types.
  Increasingly discouraged by trade professionals in favour of FCA.
- **DDP** — used by some larger suppliers (particularly e-commerce-style
  bulk consolidators, or where the buyer is unsophisticated) who deliver duty
  paid to the buyer's door. The buyer sees one all-in number but has the least
  visibility into the cost breakdown, which is a problem for landed-cost
  accuracy (see Section 4).

### What this means for the ledger

- Store the **Incoterm** as a structured field on every purchase order and
  supplier invoice (not free text) — it drives which cost categories the
  buyer should expect to see on top of the goods price.
- From the Incoterm, derive a checklist of "costs likely to land on your
  books" and surface it when the user enters a shipment: e.g. selecting FOB
  should prompt for freight and insurance as separate cost lines; selecting
  DDP should warn that duty is bundled into the goods price and ask the user
  to confirm whether they need it broken out for reporting.
- Never assume risk-transfer point equals cost-responsibility point — do not
  build any logic (e.g. "who owns the goods for insurance purposes") on the
  seller-pays-freight terms (CFR, CIF, CPT, CIP) without keeping the two
  concepts separate in the data model.
- Ask the user which Incoterm applies before offering freight-allocation
  defaults, since EXW and FOB shipments carry cost lines that CIF/DDP
  shipments have already absorbed into the goods price.

---

## 2. Customs valuation: the WTO transaction value method

Most countries base import duty on the WTO Customs Valuation Agreement
(Agreement on Implementation of Article VII of GATT 1994). **Method 1 —
transaction value** — is the primary and most-used method, applying to the
large majority of shipments. It only gives way to five fallback methods
(identical goods, similar goods, deductive, computed, fall-back) when the
transaction value cannot be used or accepted. [WTO: Customs Valuation technical information](https://www.wto.org/english/tratop_e/cusval_e/cusval_info_e.htm), [GOV.UK: Method 1 — transaction value](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value)

### The starting point and the mandatory additions (Article 8)

Transaction value = the price actually paid or payable for the goods when
sold for export to the country of importation, **adjusted** by adding (to the
extent not already included in the price):

- Commissions and brokerage, except **buying** commissions (a buying agent's
  commission is excluded — this is a common point of confusion).
- Packing costs and the cost of containers treated as one with the goods.
- **Assists** — materials, components, tools, dies, moulds, engineering, or
  design work that the buyer supplies to the seller free or at reduced cost
  for use in producing the goods, apportioned across the goods it was used to
  produce.
- **Royalties and licence fees** related to the imported goods that the buyer
  must pay as a condition of the sale, to the extent not already in the
  price.
- Any part of the proceeds of resale that accrues to the seller.
- **Transport, loading, handling, and insurance costs to the place of
  importation** — but only for those Members (most countries, including
  typical Maldivian-style customs regimes) that base valuation on a CIF
  footing rather than FOB. [WCO Guide to Customs Valuation and Transfer Pricing](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/key-issues/revenue-package/wco-guide-to-customs-valuation-and-transfer-pricing.pdf), [customs-compliance.ai: 6 valuation methods](https://customs-compliance.ai/blog/customs-valuation-methods-explained)

**Not** added: buying commissions, post-importation transport/construction/
assembly, interest charges on a deferred payment (if separately identified
and reasonable), and the import duty itself (duty is calculated on the value,
not the other way round).

### Why duty is usually computed on CIF

Because most customs regimes require freight and insurance to be added when
they are not already in the price, the practical effect is that duty is
levied on a **CIF-equivalent value** regardless of the commercial Incoterm:

- If the commercial term is already CIF, the invoice price is (largely) the
  customs value as-is.
- If the commercial term is FOB or EXW, the importer must **add** actual (or
  reasonably estimated) freight and insurance to the FOB/EXW price before
  declaring the customs value — customs will not accept an FOB-only
  declared value.
- If the commercial term is DDP, the customs value must in principle be
  **backed out** to CIF-equivalent (import duty itself is excluded from
  dutiable value even though it is bundled into the DDP price), which is
  fiddly and one reason DDP invoices are hard to reconcile against a customs
  assessment.

### Worked example — FOB to CIF for duty purposes

A shipment of textiles is bought FOB Shanghai for USD 10,000. Freight is USD
900, marine insurance USD 60. Customs (CIF basis) values the shipment at:

```
FOB value                 10,000.00
+ Freight                     900.00
+ Insurance                    60.00
= CIF (dutiable) value    10,960.00
```

If the duty rate is 15%, duty payable is USD 1,644.00 — computed on 10,960,
not 10,000. Any accounting system that only looks at the supplier invoice
(FOB) will under-declare the dutiable base by USD 960.

### What this means for the ledger

- Store the **customs (dutiable) value** as its own field, separate from the
  commercial invoice value — they are the same number only when the
  Incoterm is CIF and there are no assists, royalties, or other Article 8
  additions.
- When the commercial Incoterm is FOB, CFR, EXW, or FCA, prompt the user
  for freight and insurance actually incurred (or a reasonable estimate at
  declaration time) so the system can compute and store the CIF-equivalent
  value used for duty, and reconcile it later against the actual customs
  assessment (which may differ from the estimate).
- Provide a field for "assists" and "royalties" for the rare cases where the
  buyer supplied free tooling/design or owes a royalty tied to the goods —
  most SME shipments will have none, but the field should exist so it isn't
  silently missed.
- Never let duty amount become an input to the CIF value calculation — the
  duty is computed *from* CIF, not the reverse. Guard against circular data
  entry.

---

## 3. Freight pricing and cost allocation across goods

### FCL (Full Container Load) — flat rate per container

FCL is priced as a flat rate per container (20ft/40ft/40ft-HC etc.),
independent of exactly how full it is or what mix of goods is inside. Because
the freight is a single lump sum for the whole container, it must be
**allocated** across the goods inside using some basis — there is no
"per unit" freight rate to look up.

Allocation choices, and when each is fair:

- **By value (ad valorem)** — freight spread in proportion to each line's
  invoice value. Simple, and matches insurance practice, but is not
  physically meaningful: a cheap heavy item and an expensive light item get
  freight in the wrong proportion to the space/weight they actually used.
  Reasonable when goods in the container are broadly similar in
  density/value, or when the business just wants a rough approximate cost per
  unit for pricing, not precise unit economics.
- **By quantity (units/cartons)** — freight divided evenly per carton or
  unit. Fair only when cartons are genuinely similar in size and weight;
  badly wrong when the container mixes bulky light goods with small dense
  goods.
- **By weight** — fair when the container's items differ mainly by weight
  rather than volume (e.g. all dense goods, so nothing is volume-constrained).
- **By volume (CBM)** — fair when items differ mainly by bulk rather than
  weight (e.g. mixed light/bulky consumer goods where volume, not weight,
  is what actually limited how much fit in the container).
- **By chargeable weight** — combines weight and volume; the most defensible
  general-purpose basis when a single container holds a genuinely mixed
  cargo (see the air/LCL logic below, adapted).

### LCL (Less than Container Load) sea freight — chargeable weight

For LCL, the shipper is charged for **chargeable weight**, defined as the
**greater of** the actual weight in tonnes or the volume in CBM, under the
long-standing sea-freight convention that **1 CBM = 1,000 kg** for pricing
purposes (i.e. cargo denser than 1,000 kg/m³ is billed on weight; cargo
lighter than that is billed on volume). [Maersk: air cargo chargeable weight](https://www.maersk.com/logistics-explained/transportation-and-freight/2025/03/10/air-cargo-chargeable-weight), [Carra Globe: volumetric weight calculator](https://carraglobe.com/volumetric-weight-calculator/)

Because the rate is quoted per CBM (or per tonne, whichever the carrier's
rate card uses), LCL freight is naturally allocated by CBM across the goods
in the same consolidation — this matches how the freight was billed in the
first place.

**Worked example.** A shipment of two product lines is consolidated LCL:

| Line | Actual weight | Volume |
|---|---|---|
| A — ceramic tiles | 2,000 kg | 1.2 CBM |
| B — plastic homeware | 300 kg | 3.0 CBM |
| **Total** | **2,300 kg (2.3 t)** | **4.2 CBM** |

Chargeable weight = greater of 2.3 t or 4.2 CBM → **4.2** (volume wins,
because the mix is bulk-dominated). At a rate of USD 55/CBM, freight =
USD 231.00, allocated:

- By CBM (matches how it was billed): Line A gets 1.2/4.2 × 231 = USD 66.00;
  Line B gets 3.0/4.2 × 231 = USD 165.00.
- By weight instead (the wrong basis here) would give Line A USD 200.74 and
  Line B USD 30.13 — heavily distorting cost onto the dense tiles and
  under-costing the bulky homeware, because weight was not what the carrier
  actually charged for.

### Air freight — chargeable weight, IATA divisor 6,000

Air freight uses the same "greater of actual vs. volumetric" logic, but with
industry-standard **IATA volumetric divisor 6,000 cm³ per kg**:

```
Volumetric weight (kg) = (L cm × W cm × H cm) / 6,000
Chargeable weight = MAX(actual gross weight, volumetric weight)
```

The 6,000 divisor corresponds to a density threshold of ~167 kg/m³: cargo
denser than that is billed on actual weight; lighter, bulkier cargo is billed
on volumetric weight. [volumetricweightcalculator.com: IATA volumetric weight calculation](https://www.volumetricweightcalculator.com/blog/IATA-Volumetric-Weight-Calculation-Air-Freight-Billing-Guide.html), [time:matters: What is chargeable weight?](https://www.time-matters.com/emergency-logistics-glossary/chargeable-weight/)

**Worked example.** A carton measures 60 × 50 × 40 cm and weighs 18 kg
actual.

```
Volumetric weight = (60 × 50 × 40) / 6,000 = 120,000 / 6,000 = 20 kg
Chargeable weight = MAX(18, 20) = 20 kg
```

The airline bills 20 kg, not 18 kg — the shipper pays for the "phantom" 2 kg
of space the light, bulky carton occupies.

### Courier/express differences

Courier and express carriers (DHL, FedEx, UPS and similar) commonly use a
**divisor of 5,000**, not 6,000, giving a higher (more expensive) volumetric
weight for the same dimensions than a standard air-cargo quote would. [Cargoplot: volumetric weight air freight guide](https://www.cargoplot.com/resources/article/volumetric-weight-air-freight-calculator-guide)
Courier shipments are also typically priced and invoiced per parcel/waybill
with door-to-door service bundled in (duties/customs handling sometimes
included as a line item), rather than the classic freight + separate customs
broker + separate trucking structure of freight-forwarded air or sea cargo.
This matters for the ledger because a single courier invoice may already
combine freight, a customs clearance fee, and even duty into one number that
needs to be **unbundled** before it can be allocated as a landed cost
component.

### Allocation bases, side by side — the same shipment, five different unit costs

**Worked example.** A single 20ft FCL container carries two lines:

| Line | Units | Invoice value | Weight | Volume |
|---|---|---|---|---|
| A — steel fittings (dense, cheap) | 500 | USD 2,500 | 4,000 kg | 2.0 CBM |
| B — LED light fixtures (bulky, expensive) | 500 | USD 7,500 | 1,000 kg | 18.0 CBM |
| **Total** | **1,000** | **USD 10,000** | **5,000 kg** | **20.0 CBM** |

Total container freight: **USD 1,000** flat rate. Allocating the same USD
1,000 five different ways:

| Basis | Line A gets | Line A per-unit freight | Line B gets | Line B per-unit freight |
|---|---|---|---|---|
| By value (25% / 75%) | 250.00 | 0.50 | 750.00 | 1.50 |
| By quantity (50% / 50%) | 500.00 | 1.00 | 500.00 | 1.00 |
| By weight (80% / 20%) | 800.00 | 1.60 | 200.00 | 0.40 |
| By volume (10% / 90%) | 100.00 | 0.20 | 900.00 | 1.80 |
| By chargeable weight* | 250.00 | 0.50 | 750.00 | 1.50 |

*Chargeable weight here: Line A's 4,000 kg vs its 2.0 CBM × 1,000 kg/CBM =
2,000 kg → chargeable 4,000 kg. Line B's 1,000 kg vs 18.0 CBM × 1,000 = 18,000
kg → chargeable 18,000 kg. Total chargeable weight 22,000 kg; A = 4,000/22,000
≈ 18%, B ≈ 82% — close to but not identical to the value split here, by
coincidence of these numbers; in general chargeable weight and value do not
track each other.

The unit freight cost swings by **8×** (0.20 to 1.60) depending purely on
which allocation basis is chosen, for the *same physical shipment*. This is
the crux of why allocation basis is not a cosmetic setting — it changes
reported unit cost, margin, and inventory value.

**Guidance on which basis to use:**

- **Dense, cheap goods sharing a container with light, expensive goods**
  (steel fittings + LED fixtures, as above) → use **chargeable weight** or
  **volume**, because that is what actually consumed the container's
  capacity; using "by value" or "by quantity" badly under-costs the bulky
  line and over-costs the dense one.
- **Goods of similar density but different value** (e.g. two grades of the
  same textile) → **by value** is defensible and simplest, since neither
  weight nor volume differs meaningfully.
- **Goods of similar value but different bulk** → **by volume or weight**,
  not value.
- **LCL or air shipments already billed on chargeable weight** → allocate by
  **chargeable weight**, because that is the actual basis the carrier used to
  invoice — any other basis creates a mismatch between what was paid and how
  it is spread.
- **No reliable weight/volume data available** (a common SME reality —
  suppliers often don't provide per-line weight/volume) → fall back to value,
  but flag the allocation as approximate.

### What this means for the ledger

- Store, per shipment: mode (FCL/LCL/air/courier), container/consignment
  size, total freight charged, and — per line — quantity, value, weight, and
  volume (CBM or dimensions), so any allocation basis can be computed without
  re-entering data.
- Let the user pick the allocation basis per shipment (default suggestion:
  chargeable weight for LCL/air, volume or chargeable weight for mixed FCL,
  value for FCL of homogeneous goods) rather than hard-coding one method —
  the worked example above shows the choice materially changes unit cost.
- For LCL and air, compute chargeable weight automatically (CBM × 1,000 vs
  actual kg for sea; volumetric via /6,000 vs actual kg for air; /5,000 for
  courier) so the user doesn't have to do the arithmetic, and so the
  allocation basis matches what was actually billed.
- Show the resulting per-unit freight cost under at least two bases side by
  side when the container is visibly mixed (large weight/volume disparity
  between lines), so the user can sanity-check before accepting a default.
- Keep the allocation basis as a recorded, auditable choice on the shipment
  (not silently recomputed later), since it feeds directly into landed unit
  cost and margin reporting.

---

## 4. Payment methods and their true cost

Every method below has both an obvious, visible fee and a less obvious cost
(financing cost, opportunity cost of tied-up cash, or FX spread — see
Section 5). The accounting question for each is: does the fee belong in cost
of goods (part of getting inventory ready for sale), in finance cost (cost
of money/time), or as a balance sheet item (prepayment/receivable)?

### Telegraphic transfer / SWIFT (TT, MT103)

A TT is a standard international bank wire, confirmed via a SWIFT MT103
message. Three charge-allocation options appear in field 71A of the message: [Razorpay: What is MT103 SWIFT confirmation](https://razorpay.com/blog/what-is-mt103-swift/), [Karboncard: Fee split — BEN vs SHA vs OUR](https://www.karboncard.com/blog/fee-split-ben-sha-our)

- **OUR** — sender (the buyer/importer) pays all fees, including any
  correspondent/intermediary bank charges; the beneficiary (supplier)
  receives the full invoiced amount.
- **SHA** (shared) — sender pays only their own bank's outgoing fee; any
  correspondent bank fees along the way are deducted from what the
  beneficiary receives. This is the default on most transfers unless OUR is
  specifically requested and paid for.
- **BEN** — beneficiary bears all fees, including the sender's bank's
  charges, deducted from the amount received.

Typical costs: the sending bank's outward TT fee (a flat charge, commonly in
the tens of dollars), plus possible correspondent bank deductions under SHA,
plus an MT103 confirmation-copy fee some banks charge separately (roughly
USD 20–50). [alphatechfinance.com: SWIFT payment explained](https://alphatechfinance.com/finance/swift-payment-explained-2026/)

**Accounting treatment.** The bank's transfer fee is a **bank/finance
charge**, not part of the cost of goods — it is the cost of moving money, not
the cost of the goods themselves. If SHA or BEN terms mean the supplier
receives less than invoiced and issues a shortfall claim or adjusts the next
invoice, that shortfall is a finance cost too, not a discount on goods. Do not
capitalise TT fees into inventory.

### Letters of credit (L/C)

An L/C is the issuing bank's conditional promise to pay, against
compliant documents, common where trust between buyer and seller is limited.

- **Sight L/C** — issuing bank pays as soon as compliant documents are
  presented. [Drip Capital: LC at sight](https://www.dripcapital.com/resources/blog/sight-lc-letter-of-credit)
- **Usance L/C** — payment is deferred to a future date (e.g. 60/90/180 days)
  after document presentation and acceptance, effectively financing the
  buyer. [Financely Group: Usance letter of credit guide](https://www.financely-group.com/usance-letter-of-credit-guide)

Fee types, roughly 0.25%–2% of the L/C value in total depending on
complexity/risk: [Financely Group: Letter of credit fees 2025](https://www.financely-group.com/letter-of-credit-fees-2025)

- **Issuing fee** — charged by the buyer's (issuing) bank for opening the
  L/C, often quarterly/pro-rata on the L/C amount plus a flat charge.
- **Advising fee** — charged by the supplier's (advising) bank for notifying
  the seller of the L/C.
- **Confirmation fee** — if the seller requires the advising bank to add its
  own guarantee (confirmed L/C), an extra 0.1%–0.5% depending on
  country/bank risk.
- **Negotiation fee** — charged when the negotiating bank checks documents
  and advances or forwards funds, commonly 0.1%–0.2%.
- **Amendment fee** — a flat charge each time L/C terms are changed.
- **Discrepancy fee** — charged when presented documents don't strictly match
  the L/C terms, commonly USD 50–150 per discrepancy per presentation. [FasterCapital: Sight LC fees](https://fastercapital.com/content/Sight-Letter-of-Credit-Fees--What-You-Need-to-Know-Before-You-Import.html)
- **Cash margin** — the issuing bank commonly requires the buyer to lodge
  cash collateral (a margin, e.g. 10–100% of L/C value) against the L/C
  before issuing it; posting more collateral can reduce the issuing fee.

**Accounting treatment.**

- L/C issuing/advising/negotiation/amendment/discrepancy fees: **finance
  cost** (cost of the payment instrument), not inventory cost — though some
  jurisdictions/practices allow direct, identifiable acquisition costs to be
  capitalised; the pragmatic default for an SME ledger is to expense them as
  bank/finance charges unless the business specifically wants a fully
  loaded landed cost that includes financing fees.
- Cash margin held by the bank: **not an expense** — it is still the buyer's
  cash, just restricted. Record it as a **restricted cash / margin deposit**
  asset until the L/C is settled and the margin is released or applied.
  Do not expense the margin.
- The goods cost itself (the invoice amount paid via the L/C) is inventory
  cost as normal; only the wrapper fees around the L/C are finance cost.

### Documents against payment / against acceptance (D/P, D/A)

Both are forms of **documentary collection**: the exporter's bank sends
shipping documents to the importer's bank with instructions to release them
only on payment (D/P) or on the importer's formal acceptance of a time draft
(D/A, deferred payment typically 30–180 days). [Trade Finance Global: documentary collections](https://www.tradefinanceglobal.com/posts/documentary-collections-instructions-for-use/), [Credlix: D/P and D/A payment terms](https://www.credlix.com/blogs/understanding-documentary-collection-d-p-and-d-a-payment-terms)

Documentary collection sits between open account (least secure for seller)
and L/C (most secure, most costly): banks act as document-handling agents,
not payment guarantors, so fees are lower than an L/C (a flat collection fee
per side, rather than percentage-based issuing/confirmation fees), but the
seller carries more non-payment risk under D/A than under an L/C. [Trade.gov: Methods of payment](https://www.trade.gov/methods-payment)

**Accounting treatment.** Bank collection fees are a small finance/bank
charge, expensed as incurred. Under D/A, the buyer effectively receives
short-term trade credit once the draft is accepted — record the liability as
a trade payable (not distinct from a normal credit-terms payable), and if the
draft carries an explicit interest/discount element, split that into finance
cost rather than goods cost.

### Open account / credit terms

The supplier ships and invoices; the buyer pays later per agreed terms (e.g.
net 30/60/90), with no bank instrument enforcing payment — highest risk for
the seller, most working-capital-friendly for the buyer, and by far the
cheapest to administer (essentially zero bank fees). Increasingly common
between an importer and an established supplier once trust is built.
**Accounting treatment**: a standard trade payable; no special fee handling
needed beyond normal payables and any settlement-discount terms offered.

### Advance payments and part-payments in batches

Many SME suppliers require a deposit (commonly 30%) before production/
shipment, with the balance on or after shipment; some arrangements split
payment into several tranches tied to production milestones.

**Accounting treatment.** An advance payment for goods not yet received is
**not an expense and not inventory yet** — it is a **prepayment (advance to
supplier)** asset. Only when the goods are received (or risk/title passes,
per the Incoterm) does the prepayment convert into inventory cost. Each
tranche should be tracked against the specific purchase order so the ledger
can show, at any point, how much has been paid against goods not yet
received — this also matters for FX exposure, since each tranche was likely
paid at a different exchange rate (see Section 5).

### What this means for the ledger

- Store payment method as a structured field per supplier invoice/shipment:
  TT (with OUR/SHA/BEN), L/C (sight/usance, with sub-fields for issuing,
  advising, confirmation, negotiation, amendment, discrepancy fees, and cash
  margin), D/P, D/A, open account, or advance/part-payment schedule.
- Post bank/finance-instrument fees (TT charges, L/C issuing/advising/
  negotiation/discrepancy/amendment fees, collection fees) to a **finance
  cost** account by default, separate from cost of goods — give the user an
  override if they deliberately want a fully loaded landed cost.
  the goods cost.
- Track L/C cash margin as a restricted-cash asset, not an expense, until
  released or applied against the L/C settlement.
- Track advance/part-payments as prepayments to supplier until goods are
  received, converting to inventory on receipt, with each tranche's payment
  date and amount preserved (needed for the FX-difference calculation in
  Section 5).
- Under D/A and usance L/C, distinguish the payable's principal from any
  explicit interest/discount component, routing the latter to finance cost.

---

## 5. The bank's FX spread vs the published/mid rate

### What it is and why it is bigger than the visible fee

The **mid-market rate** is the true midpoint between the global buy and sell
price for a currency pair — the rate you see on Google/Reuters/XE, with no
markup. [Airwallex: understanding the mid-market rate](https://www.airwallex.com/global/blog/understanding-the-mid-market-exchange-rate) Banks and payment providers typically quote a **worse** rate
than mid-market and often advertise "no transfer fee" — the cost is hidden
inside the rate itself, not shown as a line item. [opendue.com: FX spreads and hidden costs](https://www.opendue.com/blog/fx-spreads-and-hidden-cross-border-payment-costs)

Typical markups: **2–4% at major banks**, occasionally up to 5% at smaller
regional banks, versus roughly **0.3–1.0%** at specialist FX/payments
providers. [Airwallex: bank exchange rate markup](https://www.airwallex.com/en-ca/blog/bank-exchange-rate-markup-hidden-costs) A visible wire fee of USD 25 looks small; a 3% spread on a
USD 10,000 payment is USD 300 — more than ten times the visible fee, and it
never appears as a separate line on any statement.

### How to measure it

Compare the exchange rate actually applied on the payment confirmation
against the mid-market rate at the same moment (date/time) the payment was
executed. The percentage difference is the bank's spread. [mycurrencycost.com: 5 ways banks mark up FX rates](https://www.mycurrencycost.com/blog/5-ways-banks-mark-up-foreign-exchange-rates/)

```
Spread % = (Bank's applied rate − Mid-market rate at execution) / Mid-market rate at execution
```

**Worked example.** Invoice is USD 10,000. Mid-market rate at the moment of
payment is MVR 15.42/USD. The bank actually applies MVR 15.87/USD to convert
the buyer's MVR account.

```
Mid-market cost:  10,000 × 15.42 = MVR 154,200
Bank's actual cost: 10,000 × 15.87 = MVR 158,700
Hidden FX spread: MVR 4,500 (≈ 2.9%)
```

That MVR 4,500 is a real cost of doing the transaction, on top of whatever
flat wire fee the bank separately charged.

### Why it is part of cost, but the exchange difference is not

This needs careful separation, because two different things are happening at
once:

1. **The FX spread itself** (bank's rate vs mid-market, both measured *at the
   moment of payment*) — this **is** part of what was actually paid to
   acquire the goods, in the buyer's functional currency. It belongs in the
   landed cost, in the same way a wire fee does.
2. **The gap between the invoice-date rate and the payment-date rate** (pure
   currency movement over time, unrelated to the bank's margin) — this is an
   **exchange (gain/loss) difference**, a finance item, not part of inventory
   cost. If the exchange rate moved between when the supplier invoice was
   raised/recorded and when it was actually paid, that movement is
   recognised as a realised FX gain or loss, not capitalised into goods.

**Worked example continued.** Supplier invoice was raised and initially
recorded at MVR 15.30/USD (the rate on the invoice date), i.e. inventory was
provisionally recorded at MVR 153,000. Payment happens later at a mid-market
rate of MVR 15.42/USD, with the bank actually applying MVR 15.87/USD:

- Inventory cost should reflect the rate at the date of receipt/recognition
  of the goods (per the applicable accounting policy — commonly the invoice
  or goods-receipt date), i.e. stays at (or is adjusted to) MVR 153,000,
  **not** revised upward for later rate movements.
- The **movement from invoice-date rate to payment-date mid-market rate**
  (15.30 → 15.42) is a realised exchange loss of MVR 1,200 on settlement of
  the payable — a finance item.
- The **spread the bank charged on top of mid-market** (15.42 → 15.87) is
  MVR 4,500 — this is a bank cost. Whether it is treated as landed cost
  (part of acquiring the goods) or as a finance cost is a policy choice, but
  it must **not** be mixed into "exchange difference" — it did not arise
  from currency movement, it arose from the bank's margin.

### What this means for the ledger

- Capture, per payment: (a) the rate on the underlying invoice/goods
  recognition date, (b) the mid-market rate at the moment of payment, and
  (c) the rate actually applied by the bank. Three numbers, not one — most
  systems only store the applied rate, which loses the ability to separate
  spread from currency movement.
- Post the invoice-to-payment-date rate movement as a **realised exchange
  gain/loss** (finance item), not as an adjustment to inventory cost.
  the goods cost).
- Post the bank's-applied-rate-vs-mid-market spread as a **bank/FX cost**
  (either folded into landed cost or kept as a separate finance line,
  per the business's chosen policy) — but keep it visibly distinct from the
  exchange-difference line so users can see how much of their FX cost is
  "the market moved" versus "the bank marked it up."
- Where the mid-market rate at time of payment cannot be captured
  automatically, at minimum record the source and rate used, so spread
  analysis can be run later (even manually) rather than being permanently
  invisible.

---

## 6. Landed cost in practice

"Landed cost" is the total cost of getting goods to a sellable, in-stock
state: goods price + freight + insurance + duty + clearance/handling fees +
any other cost directly attributable to bringing the goods to their intended
location and condition.

### What is capitalised vs expensed

**Generally capitalised into inventory** (directly attributable to bringing
goods to their present location and condition, ready for sale):

- Goods price (net of any early-payment/trade discount).
- Inbound freight (sea/air/courier) and marine/cargo insurance.
- Import duty and non-recoverable import taxes (recoverable VAT/GST is
  typically *not* capitalised — it's a receivable against the tax authority,
  not a cost).
- Customs clearance/brokerage fees, port/terminal handling charges.
- Inland transport from port/airport to the buyer's warehouse.
- Landed-cost-relevant bank/FX costs where the business's policy includes
  them (Section 5).

**Generally expensed, not capitalised:**

- General bank/finance fees not tied to a specific shipment (annual
  account fees, unrelated wire charges).
- L/C issuing/advising/negotiation/discrepancy fees (finance cost by
  default — Section 4), unless the business deliberately chooses a
  fully-loaded policy.
- Storage costs incurred **after** goods are ready for sale (ordinary
  warehousing is a period cost, not an acquisition cost) — though storage
  incurred while goods are still in transit or held in bond awaiting customs
  release is more defensibly capitalised, since the goods are not yet ready
  for sale.
- Selling, marketing, and general administrative costs.

### Costs that arrive after the goods are sold

A live problem for SMEs: freight invoices, duty assessments, or demurrage
charges sometimes arrive weeks after the goods have already been sold (or
partly sold) out of stock. Strictly, if the goods this cost relates to are
still in inventory, capitalise and re-average the unit cost; if the goods
have already been sold, the corresponding portion of the cost should flow
to cost of goods sold retroactively (a COGS adjustment), not sit
capitalised on goods that no longer exist on the balance sheet. In practice
many small systems simply expense a "late" landed cost directly to COGS if
inventory has already turned over, splitting proportionally between
remaining stock and COGS if the shipment is partially sold.

### Part shipments

When a purchase order or container is split into partial shipments
(different sailing dates, or splitting one container's contents across two
deliveries), freight and other lump-sum shipment costs must be allocated
across each part-shipment, not just across product lines within one
shipment — typically using the same allocation-basis logic as Section 3
(value/quantity/weight/volume/chargeable weight), applied per despatch.

### Short/damaged goods and supplier credit notes

- **Short-shipped goods** (invoiced/paid for but not actually received):
  reduce the inventory receipt to match what actually arrived; the shortfall
  becomes a claim against the supplier or forwarder/insurer, not part of
  landed inventory cost.
- **Damaged goods** discovered on receipt: if covered by cargo insurance or a
  supplier credit note, record a receivable/claim rather than absorbing the
  loss into unit cost of the remaining good units; if uninsured and
  unrecoverable, write off the damaged portion as a loss, not spread across
  the surviving units (spreading it would silently inflate the cost of good
  units for no reason).
- **Supplier credit notes** (for shortages, damage, quality issues, or price
  adjustments) reduce the original landed cost; if received after the goods
  have already been costed and possibly sold, treat as a COGS/inventory
  adjustment in the same way as late-arriving costs above.

### Duty refunds / drawback

**Duty drawback** is a refund (commonly up to ~99% in jurisdictions like the
US) of duty already paid, available when imported goods (or substituted
goods) are subsequently re-exported or destroyed under customs supervision.
[Wikipedia: Duty drawback](https://en.wikipedia.org/wiki/Duty_drawback) This is distinct from a bonded warehouse, where duty was never
paid to begin with (see below) — drawback only applies where duty was
actually paid and is later refunded. Record the original duty as landed
cost as normal at import; record a drawback refund, when it occurs, as a
recovery — reducing the cost of the (now re-exported) goods if still held,
or as other income/COGS credit if already expensed. Maldivian drawback
rules specifically **could not be verified** from public sources in this
research pass — flag for follow-up with MIRA/Maldives Customs guidance
before building drawback-specific logic.

### Demurrage and storage

Demurrage (port/shipping-line charges for a container held beyond its free
time at the port) and storage charges incurred while goods are still in
transit or awaiting customs release are generally capitalisable landed
costs, since the goods are not yet in a sellable state — but demurrage
caused by the importer's own delay (e.g. slow document turnaround) is
sometimes treated as an avoidable/exceptional cost and expensed separately
so it doesn't distort "normal" unit landed cost reporting. Ordinary
warehousing after goods are ready for sale is a period expense (Section
6.1 above).

### Bonded warehousing

Goods held "in-bond" in a bonded/licensed warehouse are stored under customs
supervision with import duty deferred (not waived) until the goods are
released for domestic sale, or duty-free if re-exported directly from bond.
[Wikipedia: Bonded warehouse](https://en.wikipedia.org/wiki/Bonded_warehouse) While in bond, no duty is payable and the goods have not yet
been "imported" for customs purposes — inventory should be tracked
(quantity, value) but the duty component of landed cost should not be
recognised until the goods actually clear customs out of the warehouse.
Storage fees charged by the bonded warehouse operator while goods are in
bond are a capitalisable landed cost, similar to demurrage.

### Insurance claims

Where cargo insurance responds to a loss (theft, damage, total loss), the
claim proceeds are recorded as a receivable from the insurer, offsetting the
loss recognised on the damaged/lost goods — not netted silently into the
landed cost of the surviving goods. Any insurance excess/deductible borne by
the importer is a genuine loss (or, if it relates to goods that are still
usable, an additional cost element), tracked separately from the claim
recovery so the net cost of the incident is visible.

### What this means for the ledger

- Model landed cost as a **shipment-level cost pool** (goods + freight +
  insurance + duty + clearance + inland transport, each as its own line)
  that gets allocated down to product lines using the chosen allocation
  basis (Section 3) — not a single blended "cost" number typed against each
  product.
- Keep a clear **capitalise vs expense** flag per cost type, with sensible
  defaults per Section 6.1, but let the user override per shipment for edge
  cases (e.g. avoidable demurrage).
- Support **late-arriving costs** as a distinct workflow: let the user attach
  a cost to an already-received (and possibly already-sold) shipment, and
  automatically split it between remaining inventory (re-average unit cost)
  and COGS (for units already sold) based on what proportion of the original
  quantity is still on hand.
- Support **part shipments** by keeping shipment-level costs allocable
  across multiple despatch/receipt events tied to one purchase order.
- Track short-shipment/damage/credit-note events as adjustments against the
  original landed cost, with a linked claim/receivable where recovery is
  expected, rather than silently blending the loss into surviving units'
  unit cost.
- Track duty paid, and (separately) duty drawback claimed/received, so the
  net duty cost of goods that are re-exported can be reported accurately —
  flag to the user that Maldives-specific drawback mechanics need
  confirming with MIRA/Customs before relying on any built-in assumption.
- Model bonded-warehouse holding as inventory without a duty cost line until
  release from bond, at which point the duty (as assessed at release) is
  added to landed cost.
- Record insurance claims as receivables against a specific loss event,
  keeping the loss, the claim, and any uninsured excess as separate visible
  line items rather than one net adjustment.

---

## 7. How established systems model this

| System | Landed cost model | What it gets right | Where users complain |
|---|---|---|---|
| **QuickBooks (Online)** | No native landed cost feature at all in QuickBooks Online; QuickBooks **Enterprise** has an "Advanced Inventory" landed-cost add-on. Most QBO users allocate costs on a worksheet outside QBO, then post the adjusted item costs back manually, or use a third-party app. [Intuit: Landed cost FAQs](https://quickbooks.intuit.com/learn-support/en-us/help-article/set-inventory-lists/landed-cost-faqs/L2JMpbLbo_US_en_US) | Enterprise's version, when used, properly adjusts item cost and ties landed cost bills to specific POs/receipts. | QBO (the SME-tier product) has no built-in landed cost at all — described as a "workflow problem, not a settings problem"; businesses resort to spreadsheets or third-party apps, adding cost and integration risk. [invoicedataextraction.com: QBO landed cost allocation](https://invoicedataextraction.com/blog/quickbooks-online-landed-cost-allocation) |
| **Xero** | No native landed-cost allocation feature; the standard workaround is adding freight/duty as separate bill line items, or creating dedicated bills for carriers/brokers, then manually allocating by value or weight. [Xero Product Ideas: landed cost allocation](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/48529637-inventory-landed-cost-allocation) | Flexible bill-line structure means the raw cost data is at least captured, if not automatically allocated. | Long-standing, still-open feature request for native landed cost allocation; users route through third-party apps (e.g. Finale Inventory, Cin7, DEAR) or accept manual, error-prone workarounds. [Xero Community: landed cost discussion](https://community.xero.com/business/discussion/13022779) |
| **Zoho Books** | Has a native landed cost feature — users can record landed cost adjustments (freight, customs, insurance etc.) against a bill/purchase and allocate across items. | Praised, relative to QBO/Xero, as one of the few mainstream SME accounting tools with landed cost built in "for years." | Users report the allocation options are somewhat rigid (limited basis choices) and manual data entry heavy for multi-line, multi-shipment scenarios. [Zoho Community: landed cost allocation / custom duty manual entry](https://help.zoho.com/portal/ja/community/topic/landed-cost-allocation-custom-duty-manual-data-entry-28-7-2023?page=1) |
| **Odoo (Inventory app)** | Native "Landed Costs" feature: a landed-cost document references one or more receipts, splits additional costs (freight, insurance, customs, other) across the products by a chosen split method, and posts a "Valuation Adjustment" that debits stock valuation and credits the cost's expense account. [Odoo 18 documentation: landed costs](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/landed_costs.html) | Directly ties the landed cost document to the original receipt/PO, journal-posts the valuation adjustment automatically, and supports multiple split methods (by quantity, weight, volume, cost). | Requires perpetual/automated inventory valuation to be enabled to get the automatic journal entries; configuration (enabling the feature, setting a default journal) trips up new users, and average-cost recalculation across historic stock can be non-obvious. |
| **ERPNext (Frappe)** | Native "Landed Cost Voucher" document: references one or more Purchase Receipts, lists additional costs (freight, customs, insurance etc.), and allocates them across the receipt's items by a chosen basis (typically by amount, qty, or weight), updating item valuation rate. | Purpose-built for this exact workflow as part of a full open-source ERP; free/open-source, so smaller importers can self-host without per-seat SaaS cost. | Being a full ERP rather than a lightweight accounting app, it carries more setup/configuration overhead than a QuickBooks-style tool for a business that only needs landed cost and nothing else. |
| **SAP Business One** | Has a dedicated "Landed Costs" document type in the Purchasing module: references goods receipt POs, allows multiple cost items (freight, insurance, customs) each with its own allocation method (quantity, weight, volume, or value), and posts the cost into inventory valuation directly. | Enterprise-grade rigor: multiple simultaneous allocation bases per cost line within one document, strong audit trail, tight integration with the general ledger. | Considerable complexity and cost relative to SME needs — SAP B1 is generally priced and configured for larger, more process-mature businesses, overkill for a small importer's simple FOB/CIF shipments. |

Common pattern across the more capable systems (Zoho Books, Odoo, ERPNext,
SAP B1): a landed cost is modelled as its own **document type** that
references the original purchase/receipt, lists additional cost lines with a
chosen allocation basis **per cost line** (not just one basis for the whole
document), and posts a valuation adjustment automatically. The weaker
pattern (QuickBooks Online, Xero out of the box) is treating landed cost as a
manual bookkeeping exercise bolted onto ordinary bills, pushed onto
spreadsheets or third-party apps.

### What this means for the ledger

- Model landed cost as its own document type (a "landed cost voucher"),
  referencing one or more receipts/shipments, following the Odoo/ERPNext/
  SAP B1 pattern rather than the QuickBooks/Xero "bolt cost lines onto a
  bill" pattern — this is the feature area where Sentryfi can be
  meaningfully better than the two dominant SME tools out of the box.
  the two dominant SME tools out of the box.
- Allow **allocation basis per cost line**, not just one basis for the whole
  landed cost document — freight might be fairly allocated by volume while
  insurance is fairly allocated by value, within the same shipment.
  the same shipment.
- Automatically post the valuation adjustment (debit stock/inventory value,
  credit the relevant expense/payable) when a landed cost document is
  confirmed, so the user never has to journal it manually.
- Since Zoho Books' known weak point is rigid allocation choices and manual
  entry for multi-shipment scenarios, make multi-shipment (one freight
  invoice spread across several purchase orders/containers) a first-class,
  low-friction case rather than an afterthought.

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

- Maldives-specific customs valuation and duty drawback rules (this
  document uses the general WTO/WCO framework, which the Maldives is bound
  by as a WTO member, but specific MIRA/Maldives Customs procedural detail
  — e.g. exact drawback percentages, documentary requirements — was not
  located from a public, citable source and should be confirmed directly
  with Maldives Customs Service or MIRA before being encoded as product
  logic).
- Exact current bank fee schedules (TT charges, L/C fee percentages,
  discrepancy fee amounts) for Maldivian banks specifically — figures cited
  above are general international ranges from trade-finance industry
  sources, not Maldivian bank rate cards.
