# Stock and Inventory Standards, Operations, and Design Patterns (Benchmark Note)

Scope: what correct inventory accounting and operations require, and which product-design patterns leading systems converge on, for a small-business perpetual/weighted-average-cost finance app serving contractors, hardware shops/outlets, importers and small manufacturers. Current as of September 2026.

## Accounting: cost formulas allowed under IAS 2 / IFRS for SMEs Section 13

### Takeaway
IAS 2 and IFRS for SMEs Section 13 both permit only FIFO or weighted average cost formulas for fungible inventory (specific identification is mandatory for non-interchangeable/segregated items); LIFO is explicitly prohibited under both frameworks, and Section 13's requirements are described by the IFRS Foundation as "substantially the same" as IAS 2, with retained cost-measurement shortcuts (standard cost, retail method, most-recent-purchase-price) for practical estimation.

### Cited Findings
- IAS 2 para 25: "The cost of inventories, other than those dealt with in paragraph 23 [items not ordinarily interchangeable → specific identification], shall be assigned by using the first-in, first-out (FIFO) or weighted average cost formula. An entity shall use the same cost formula for all inventories having a similar nature and use to the entity." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- IAS 2 para 27: "The FIFO formula assumes that the items of inventory that were purchased or produced first are sold first... Under the weighted average cost formula, the cost of each item is determined from the weighted average of the cost of similar items at the beginning of a period and the cost of similar items purchased or produced during the period." Weighted average "can be calculated on a periodic basis, or as each additional shipment is received." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html); confirmed by [IFRS Community, FIFO/weighted average](https://ifrscommunity.com/knowledge-base/fifo-lifo-weighted-average-cost/)
- "A crucial point is that LIFO (Last-In, First-Out) is not permitted under IAS 2." — [LearnSignal, IAS 2 guide](https://www.learnsignal.com/blog/ias-2-inventories-measurement-cost-formulas-guide/)
- IFRS for SMEs Section 13: "the requirements in Section 13 of IFRS for SMEs are substantially the same as IAS 2, Inventories. LIFO is prohibited... However, techniques for measuring inventory cost, such as standard costing, retail method and the most recent purchase price if the result approximates cost have been retained." — [IFRS for SMEs Educational Module 13](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/smes/2026-modules/module-13.pdf)
- Specific identification is required/expected for items not ordinarily interchangeable and for goods/services produced and segregated for specific projects (IAS 2.23), and is practically favored for "small number of items in inventory, ... expensive, ... heterogeneous products, or ... substantial customization," and is mandated in regulated traceability contexts (e.g., medical devices, pharma lot tracking, aerospace components). — [CFI, Specific Identification Method](https://corporatefinanceinstitute.com/resources/accounting/specific-identification-method/); [MRPeasy, Specific Identification](https://www.mrpeasy.com/blog/specific-identification/)
- Periodic vs. moving (continuous/perpetual) weighted average: IAS 2 permits both — recalculated periodically (period-end) or "as each additional shipment is received" (moving average). — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)

### Inferences
- A weighted-average-cost app can satisfy both IAS 2 and Section 13 as long as it applies the formula consistently within categories of similar nature/use, and it should support switching to specific identification for high-value, individually tracked stock (imported machinery, serialized goods) without needing a wholly separate valuation engine.
- Moving (perpetual) weighted average is the natural fit for a perpetual-inventory app since it recalculates on every receipt, matching the "moving average" variant IAS 2 explicitly names.

### Gaps
- None significant; both primary standard text and IFRS Foundation educational material were directly retrieved.

## Accounting: what goes into cost — landed cost, purchase price, duties, freight/handling

### Takeaway
Cost of inventory = costs of purchase + costs of conversion + other costs incurred bringing inventory to present location/condition; costs of purchase explicitly include purchase price, import duties and non-recoverable taxes, and transport/handling directly attributable to acquisition, net of trade discounts/rebates — this is the accounting basis for "landed cost."

### Cited Findings
- IAS 2 para 10: "The cost of inventories shall comprise all costs of purchase, costs of conversion and other costs incurred in bringing the inventories to their present location and condition." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- IAS 2 para 11: "The costs of purchase of inventories comprise the purchase price, import duties and other taxes (other than those subsequently recoverable by the entity from the taxing authorities), and transport, handling and other costs directly attributable to the acquisition of finished goods, materials and services. Trade discounts, rebates and other similar items are deducted [in determining the costs of purchase]." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html); same wording paraphrased at [IFRS Community, Cost of Inventories](https://ifrscommunity.com/knowledge-base/cost-of-inventories/)
- Recoverable-vs-non-recoverable tax distinction: "because tax is subsequently recoverable, IAS 2 excludes it from the purchase cost of inventory. Customs duty, by contrast, is not recoverable, so it forms part of the cost of the goods." — [LegalClarity, Freight-in inventory rules](https://legalclarity.org/is-freight-in-included-in-inventory-accounting-rules/) (consistent with IAS 2.11 itself)
- IAS 2 para 15 ("Other costs"): "Other costs are included in the cost of inventories only to the extent that they are incurred in bringing the inventories to their present location and condition. For example, it may be appropriate to include non-production overheads or the costs of designing products for specific customers in the cost of inventories." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- Storage costs are normally *excluded* from cost unless storage is a necessary part of the production process before a further production stage (e.g. maturing wine, aging cheese) — general warehousing of finished goods due to timing mismatches does not add to cost. — [IFRS Community, Cost of Inventories](https://ifrscommunity.com/knowledge-base/cost-of-inventories/)
- Financing component: if inventory is purchased on credit terms that significantly exceed normal industry credit terms, the excess over the "cash price equivalent" is recognised as interest expense over the financing period rather than capitalised into inventory cost (IAS 2.18). — [IFRS Community, Cost of Inventories](https://ifrscommunity.com/knowledge-base/cost-of-inventories/)
- Practitioner/landed-cost framing (non-authoritative but useful for product design): landed cost = carrier/freight charges + insurance + import duties/tariffs (non-refundable) + handling/drayage fees, i.e., "every charge necessary to get goods from the seller to your facility in sellable condition." — [LegalClarity, Freight-in inventory rules](https://legalclarity.org/is-freight-in-included-in-inventory-accounting-rules/)

### Inferences
- A landed-cost feature for importers must (a) capitalise non-recoverable duties and freight/handling into unit cost, (b) exclude recoverable VAT/GST/import tax components from cost (route them to a recoverable-tax control account instead), and (c) allow allocation of shared freight/duty costs across multiple SKUs/lines on a single shipment (typically pro-rata by value or weight — this allocation mechanic itself is a design choice not prescribed by IAS 2, which only says costs must be "directly attributable").
- General warehouse storage/carrying cost should NOT be added to unit cost for hardware shops/importers — it is a period expense, not an inventoriable cost — unless the business is doing production-stage aging (rare for the target segment).

### Gaps
- IAS 2 does not prescribe a specific allocation method (value-basis, weight-basis, etc.) for splitting one landed-cost invoice (freight/duty) across multiple line items; this is left to the reporting entity's own reasonable, consistent policy. No standard-setting source was found prescribing one method over another for SMEs.

## Accounting: net realisable value write-downs and reversals

### Takeaway
Inventories are carried at the lower of cost and net realisable value (NRV); write-downs are expensed in the period incurred, and reversals are mandatory (not optional) when the reasons for the write-down no longer exist — but a reversal is capped at the original write-down amount, so the new carrying value never exceeds the lower of cost and the revised NRV.

### Cited Findings
- IAS 2 para 9: inventories "shall be measured at the lower of cost and net realisable value." NRV = "the estimated selling price in the ordinary course of business less the estimated costs of completion and the estimated costs necessary to make the sale." — [IFRS Community, NRV of Inventories](https://ifrscommunity.com/knowledge-base/nrv-net-realisable-value/); [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- IAS 2 para 34: "When inventories are sold, the carrying amount of those inventories shall be recognised as an expense in the period in which the related revenue is recognised. The amount of any write-down of inventories to net realisable value... [is recognised as an expense in the period the write-down or loss occurs]." — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- IAS 2 para 33: "A new assessment is made of net realisable value in each subsequent period. When the circumstances that previously caused inventories to be written down below cost no longer exist or when there is clear evidence of an increase in net realisable value... the amount of the write-down is reversed... so that the new carrying amount is the lower of the cost and the revised net realisable value." Reversal is recognised as a *reduction* in the inventory expense of the period of reversal, not as other income, and is capped at the original write-down. — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html); [PastPaperHero, NRV and write-down reversals](https://www.pastpaperhero.com/resources/acca-fr-inventories-ias-2-net-realisable-value-and-write-down-reversals)
- IAS 2 para 38 (disclosure): cost of sales/inventories expensed during the period includes prior write-downs of inventory now sold, plus unallocated production overheads and abnormal costs. — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- Contrast note (for context, not the app's framework but useful if the app ever serves US-linked clients): under US GAAP/ASC 330, inventory write-down reversals are generally prohibited once taken (unlike IFRS), a frequently cited IFRS-vs-GAAP divergence. — [Houseblend, Inventory Write-Down Reversal: GAAP vs IFRS](https://www.houseblend.io/articles/inventory-write-down-reversal-gaap-ifrs)

### Inferences
- A perpetual/weighted-average app needs an NRV assessment workflow separate from the costing engine: at minimum, a per-SKU "NRV override" or write-down entry that (a) reduces carrying value and posts an expense, (b) is reassessed each period, and (c) can be reversed up to (but not beyond) the cumulative write-down amount and never above original cost. This is a control layer on top of, not a replacement for, the weighted-average cost.
- The write-down/reversal must NOT be netted silently into COGS at point of sale — it needs its own auditable ledger entry type distinct from ordinary issue-at-cost moves, so it is visible for GL reconciliation and audit trail.

### Gaps
- None on the technical requirement; industry practice on *how often* SMEs should formally run NRV reviews (monthly? annually?) was not found in an authoritative source — treat as an operational/product decision rather than a standards requirement.

## Accounting: shrinkage recognition timing

### Takeaway
Shrinkage (unexplained loss/theft/breakage) should be expensed in the period it is *discovered* (perpetual systems, via cycle counts/reconciliation) unless there is clear evidence it occurred in an earlier, still-open period; periodic systems effectively bury all shrinkage into the period-end physical count variance. IAS 2 para 34 treats "all losses of inventories" the same as NRV write-downs — expensed as incurred.

### Cited Findings
- "For Perpetual Inventory Systems: Shrinkage is recorded when discrepancies are discovered through cycle counts, investigations, or regular reconciliation processes, allowing for more timely recognition of losses." "For Periodic Inventory Systems: All shrinkage is recorded during physical inventory counts, typically at year-end or other regular intervals." — [Web search synthesis citing AccountingTools/Finale Inventory/NetSuite sources on inventory shrinkage] (no single primary standard addresses shrinkage timing directly; IAS 2 para 34 groups "losses of inventories" with write-downs as period expenses) — [IAS 2 official text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias2.html)
- "Most retailers record shrinkage when it's discovered unless there's clear evidence that the loss occurred in a different period" (matching principle). — [AccountingIQ, Inventory Shrinkage journal entries](https://www.accountingaitutor.com/journal-entries/inventory-shrinkage-adjusting-entry)
- Typical journal entry: debit COGS (or a dedicated shrinkage/loss expense account), credit Inventory. — [AccountingIQ, Inventory Shrinkage journal entries](https://www.accountingaitutor.com/journal-entries/inventory-shrinkage-adjusting-entry)

### Inferences
- For a perpetual app, shrinkage should post as its own move type (distinct from sales issues) at the moment a cycle count or blind count variance is *approved*, not merely detected — approval is the control point (see internal controls section below). This keeps COGS clean and shrinkage separately reportable, which also feeds a "shrinkage %" KPI.

### Gaps
- No authoritative accounting-standard text was found specifically titled "shrinkage" — IAS 2 treats it implicitly under "losses of inventories" (para 34) rather than as a named category; findings above are drawn from secondary/practitioner sources, not IFRS/IASB primary text, and should be flagged as industry-practice rather than standards-mandated timing.

## Accounting: stock in transit, ownership, and Incoterms/FOB

### Takeaway
Ownership (and therefore the right to recognise goods as inventory) of in-transit stock follows the transfer-of-control point set by the shipping terms/Incoterms, not physical possession — under FOB shipping point the buyer records the inventory while still in transit; under FOB destination the seller retains it on their books until delivery.

### Cited Findings
- "Ownership of in-transit inventory depends largely on the shipping terms agreed upon by the buyer and the seller, typically defined using Incoterms." — [Qoblex, In-Transit Inventory guide](https://qoblex.com/learning-center/in-transit-inventory/)
- "If the goods are shipped FOB Origin, ownership transfers to the buyer as soon as the goods leave the seller's location... Conversely, if the goods are shipped FOB Destination, ownership remains with the seller until the goods reach the buyer's location." — [ShipBob, Goods in Transit](https://www.shipbob.com/blog/goods-in-transit/)
- "Under FOB Origin (or FOB Shipping Point) legal title transfers at the seller's shipping point, so the buyer records inventory while goods are in transit and the seller recognizes revenue at shipment... Because legal title remains with the seller until delivery, inventory in transit shipped under FOB Destination must be reported on the seller's balance sheet at period end." — [Racklify, FOB Destination Accounting & Reporting](https://racklify.com/encyclopedia/inventory-accounting-and-financial-reporting/)
- "Recording a sale before title has transferred violates revenue recognition standards across frameworks: ASC 606 under US GAAP, IFRS 15 under international standards." — [Racklify, FOB Destination Accounting & Reporting](https://racklify.com/encyclopedia/inventory-accounting-and-financial-reporting/)

### Inferences
- For importers, the app needs a "goods in transit" state distinct from on-hand and on-order: a PO with a defined Incoterm (FOB, CIF, etc.) should flip inventory recognition (and landed-cost accrual) at the contractual transfer point, not at physical GRN — otherwise import-heavy businesses will misstate period-end inventory when a shipment is mid-ocean at year end.
- This is a genuine gap area for many small-business apps, which typically only recognise stock at goods-receipt scan; supporting an explicit "in-transit, owned" state (bought FOB shipping point but not yet received) is a differentiator for the importer segment.

### Gaps
- No IFRS-specific (IAS 2) paragraph was found directly addressing Incoterms; the standard's general principle (control/risk transfer determines recognition, consistent with IFRS 15's control-transfer test) was the closest primary linkage found, via secondary commentary rather than a direct IAS 2 citation.

## Accounting: consignment stock

### Takeaway
Consigned goods stay on the *consignor's* balance sheet as inventory (in a separate consignment-inventory account) until sold to the end customer, even though they are physically held by the consignee; the consignee never books the goods as its own inventory asset and only recognises a liability when it sells them onward.

### Cited Findings
- "Consignment inventory is stock that is stored with the purchasing company (the consignee) rather than the selling company (the consignor). Payment is made by the consignee only when the goods are sold, and any unsold items are returned to the consignor." — [Finale Inventory, Consignment Inventory Accounting](https://www.finaleinventory.com/guides/consignment-inventory-accounting/)
- "For the consignor, consigned goods generally remain on the consignor's balance sheet as inventory until sold to the end customer, often tracked in a separate consignment inventory account." COGS is recognised "when the consignee sells the item to its customer," and revenue under IFRS 15/ASC 606 "generally at the point of sale to the consignee's customer." — [Hubifi, IFRS Consignment Inventory Guide](https://www.hubifi.com/blog/consignment-revenue-recognition-guide)
- "Consignments remain off the consignee's inventory asset accounts; instead, the consignee records a liability or payable only when a sale occurs." — [Beancount.io, Consignment Accounting](https://beancount.io/blog/2026/05/18/consignment-accounting-consignors-consignees-inventory-balance-sheet-revenue-recognition-commission-journal-entries-guide)

### Inferences
- A hardware-shop/outlet app that both receives consigned stock (from importers/manufacturers) and sends stock on consignment (to smaller resellers) needs a location/ownership flag on stock records separate from physical location — "held at" vs "owned by" — so consigned-in goods never inflate the consignee's own valued inventory, and consigned-out goods stay on the consignor's books/valuation even though physically elsewhere.

### Gaps
- None material; multiple independent secondary sources agree and align with the general IFRS 15 control-transfer principle (no direct IAS 2 paragraph names consignment, but the accounting outcome is consistently reported).

## Accounting: perpetual vs periodic systems, and adoption by SMEs

### Takeaway
Perpetual systems update inventory quantity/value on every transaction in real time; periodic systems only true-up inventory at scheduled physical counts, leaving the "Purchases" account to accumulate in between — and despite technology gains, "most small and medium-sized companies use the periodic inventory system," though perpetual is now less burdensome technologically.

### Cited Findings
- "A perpetual inventory system automatically updates and records the inventory account every time a sale or purchase of inventory occurs, with recognition happening immediately upon the transaction. A periodic inventory system updates and records the inventory account at certain, scheduled times... such as at the end of the month, quarter, and year." — [SPSCC Pressbooks, Financial Accounting](https://spscc.pressbooks.pub/financialaccountingoriginal/chapter/compare-and-contrast-perpetual-versus-periodic-inventory-systems/)
- "When a company uses the perpetual inventory system and makes a purchase, they will automatically update the Merchandise Inventory account. In contrast, under a periodic inventory system, Purchases will be updated while Merchandise Inventory will remain unchanged until the company counts and verifies its inventory balance." — [SPSCC Pressbooks, Financial Accounting](https://spscc.pressbooks.pub/financialaccountingoriginal/chapter/compare-and-contrast-perpetual-versus-periodic-inventory-systems/)
- "Most small and medium-sized companies use the periodic inventory system... conducted a few times per year or even at the end of every month. However, in recent years, technology capability has increased and perpetual inventory tracking has become less burdensome." — [AccountingTools, Periodic vs Perpetual](https://www.accountingtools.com/articles/what-is-the-difference-between-the-periodic-and-perpetual-in.html)

### Inferences
- Since the target app is already perpetual + weighted average, it is ahead of typical SME practice per this source, which is a legitimate selling point — but it also means the app must do the reconciliation work (matching perpetual book inventory to a periodic physical count and explaining variances) that periodic-system SMEs get "for free" at count time, i.e., cycle counting and variance-approval workflows are not optional polish, they are the compensating control a perpetual system needs.

### Gaps
- No quantitative, dated source on what fraction of small businesses use perpetual vs periodic in 2026 specifically (source above is undated/general); treat the "most SMEs still periodic" claim as directionally reliable but not statistically pinned to 2026.

## Accounting: negative stock and back-dated transactions

### Takeaway
Negative stock and back-dated transactions are a known failure mode across mainstream ERPs (Dynamics 365, NetSuite, QuickBooks, Sage) that corrupts moving-average costing; the two industry-standard mitigations are (1) blocking/warning on negative stock at the transaction boundary, and (2) running a periodic "cost adjustment"/inventory-close process that revalues affected issues after the fact — with the caveat that moving-average costing cannot cleanly retro-adjust individual historical transactions the way FIFO/standard costing can, and closed accounting periods should be locked against further value-changing postings.

### Cited Findings
- "When inventory goes negative, the inventory value in the balance sheet and cost of goods sold can be understated, and financial reporting metrics like gross profit margins can be overstated because the cost is incorrect." — [Microsoft, Negative inventory in inventory accounting](https://www.microsoft.com/en-us/dynamics-365/blog/business-leader/2018/01/24/negative-inventory-in-inventory-accounting/)
- "Backdated or out-of-order transactions occur when a sale is entered after the fact, dated to a point when stock had already moved for another reason, producing a sequence that never actually happened in that order in reality... If you backdate a transaction for an item using moving average costing, the system assigns the current moving average to the transaction." — [Houseblend, NetSuite Negative Inventory](https://www.houseblend.io/articles/netsuite-negative-inventory-causes-fixes)
- "If you use a periodic costing model such as FIFO, LIFO, or weighted average, you can adjust the value of the issues when you run the inventory close and adjustment process after the negative inventory quantities are corrected. However, if you use moving average, there's no way to revalue the individual transactions." — [Microsoft Learn, Inventory costing FAQ](https://learn.microsoft.com/en-us/dynamics365/supply-chain/cost-management/inventory-costing-faq)
- "The Inventory Periods feature can be used to avoid such problems by opening or closing inventory periods to limit posting in a set period of time. When you close an inventory period, no value changes can be posted in the closed period, including new value postings, expected or invoiced postings, changes to existing values, and cost adjustments." — [Microsoft Learn, Design Details: Inventory Periods](https://learn.microsoft.com/en-us/previous-versions/dynamicsnav-2015/hh997369(v=nav.80))

### Inferences
- Because this app already uses moving weighted average, back-dated entries are a genuine architectural risk: a late-entered receipt or issue dated earlier than transactions already posted will not cleanly retro-recompute all the moving averages that were derived from the (now wrong) sequence, matching the Microsoft finding that "there's no way to revalue the individual transactions" cleanly under moving average.
- The two industry-converged mitigations to adopt: (1) a period-lock mechanism (closed accounting periods reject postings/back-dating, matching Business Central's "Inventory Periods"), and (2) a same-day-forward re-sequencing/re-cost run for any late transaction dated within the still-open period, i.e., recompute the moving average chain from the earliest affected date forward — this is a real engineering cost, not a checkbox, and should be scoped explicitly.
- Blocking negative stock at the point of transaction (rather than allowing negative and fixing later) is the simpler, lower-risk default for a small-business app, since the alternative (allow-negative + later cost-adjustment run) requires the re-sequencing capability above.

### Gaps
- No IFRS/IAS 2 text addresses negative stock or backdating directly — this is purely a systems/operational-controls topic, sourced entirely from ERP vendor documentation (Microsoft, NetSuite-adjacent) rather than accounting standards; flagged as industry-practice, not standards-mandated.

## Operations: goods received notes and three-way match

### Takeaway
Three-way match (PO ↔ GRN ↔ invoice) compares quantity, unit price, total and line description across all three documents before an invoice is approved for payment; tolerances should be pre-approved, documented, and appropriate to category rather than an open-ended "close enough" allowance.

### Cited Findings
- "Three-way matching is the control that compares a supplier invoice against the purchase order that approved it and the receiving report that confirms delivery, before the invoice is approved for payment... It compares quantity, unit price, total, and line descriptions across all three documents. Where all three agree within tolerance, the invoice is approved. Where they do not, the invoice is held as an exception until the difference is resolved or the invoice is adjusted." — [Beancount.io, Three-Way Matching for Small Businesses](https://beancount.io/blog/2026/09/01/three-way-match-accounts-payable-controls-duplicate-phantom-payments)
- "If the invoice matches both the PO and GR within SAP's predefined tolerance limits, the system approves it for payment. The tolerance should be approved, documented, and appropriate to the category. A tolerance is not a blanket permission to pay whatever appears on the invoice." — [Ramp, How 3-Way Matching in SAP Works](https://ramp.com/blog/sap-3-way-match)
- Purpose: "prevent overpayments, duplicate payments, and fraud... improves financial accuracy and enforces procurement compliance by making sure what's billed matches what was ordered and delivered." — [AvidXchange, 3-Way Matching Process](https://www.avidxchange.com/blog/3-way-matching/)

### Inferences
- For small contractors/importers, a lightweight three-way match (PO, GRN, vendor bill) with a configurable per-category tolerance (e.g., ±2% price variance or a small absolute amount) is the minimum viable control; the app should hold mismatched invoices in an "exception" queue requiring explicit approval rather than silently auto-posting variances into COGS.

### Gaps
- No specific numeric tolerance benchmark (e.g., "industry standard is X%") was found in these sources; tolerance thresholds are described as something each business/category should set deliberately rather than a fixed universal number.

## Operations: two-step transfers, in-transit, and shortfall handling

### Takeaway
Best-practice inter-location transfers are two-step (ship, then separately receive), with a distinct "in-transit" state that is off both the source's and destination's on-hand balance while goods are moving; the recurring design problem is handling partial/short receipts against a transfer that was dispatched for a different quantity than what arrives.

### Cited Findings
- "A two-step inventory transfer process allows tracking efficiency, where both ends issue the STO (Stock Transfer Order) document. One warehouse marks the item as in-transit and sends it, and when the merchandise reaches its destination, the second warehouse marks the transaction as complete, at which point both locations update their quantity and valuation." — [Cin7, Guide To Conducting Stock Transfers](https://www.cin7.com/industry-terms/stock-transfer-guide/)
- "While the inventory is being moved, it's not in the on-hand quantities at either the source warehouse or the destination warehouse." Some systems track in-transit as a distinct location; others just show it deducted from source but not yet added to destination. — [CXTMS, Inventory Transfers](https://cxtms.com/docs/knowledge-base/warehouse-management/inventory-transfers)
- Shortfall example: "if a transfer order for 10 items was created and dispatched, but only 8 were physically dispatched... the receiving warehouse indicates that 10 should be received, but only 8 physically arrived, leaving 2 in transit. A current workaround is to receive all 10 items and then do a one-step transfer for the 2 items back to the originating warehouse [i.e., an awkward compensating correction]." — [Acumatica Community, correcting an in-transit 2-step transfer](https://community.acumatica.com/distribution-6/how-to-correct-an-in-transit-2-step-transfer-transfer-order-6856)

### Inferences
- The app should model transfers as two independent moves (ship-out move decrementing source, receive-in move incrementing destination) linked by a transfer-order id, with an explicit in-transit quantity bucket in between — and the receive step must allow receiving *less than* shipped (partial receipt), automatically leaving the shortfall as an open in-transit balance requiring investigation/write-off/re-ship, rather than forcing the all-or-nothing "receive full amount then reverse" workaround the Acumatica thread describes as a known pain point.

### Gaps
- None major; the shortfall workaround described is explicitly called an imperfect "workaround" in the source, confirming this is a genuinely unsolved UX problem worth designing well rather than copying existing patterns uncritically.

## Operations: cycle counting, ABC classification, and blind counts

### Takeaway
ABC classification (Pareto-based: ~20% of SKUs driving ~80% of value) should drive count frequency — A items monthly/quarterly (some sources say weekly/monthly for the highest-value items), B items 2–3×/year, C items annually — with blind counts (counters do not see system quantity) as the standard method to avoid confirmation bias, and ABC classes reviewed at least annually as usage patterns shift.

### Cited Findings
- "ABC Classification or Analysis is an inventory categorization technique of identifying items that will have a significant impact on overall inventory cost... based on Pareto's Law. A Items (High Value) represent 20% of items with 80% of inventory value; B Items (Medium Value) represent 30% of items with 15%...; C Items (Low Value) represent 50% of items with 5%." — [NetSuite, ABC Analysis in Inventory Management](https://www.netsuite.com/portal/resource/articles/inventory-management/abc-inventory-analysis.shtml)
- "A items (high-value) should be counted monthly or quarterly, B items (medium-value) 2–3 times per year, and C items (low-value) annually." Elsewhere: "high-value A items... should be counted weekly or monthly, while C class items are typically only counted once in a year." — [RFgen, Cycle Counting Best Practices](https://www.rfgen.com/blog/complete-guide-to-inventory-cycle-counting-best-practices/); [OneCart, Cycle Counting Inventory 2026](https://www.getonecart.com/cycle-counting-inventory/)
- "Best practice recommends using blind counting where counters do not see the expected system quantity before performing their count, as this prevents confirmation bias where counters might unconsciously adjust their count to match expectations, producing more honest and accurate results." — [RFgen, Cycle Counting Best Practices](https://www.rfgen.com/blog/complete-guide-to-inventory-cycle-counting-best-practices/)
- "You should review your ABC Analysis once a year to ensure inventory is still in the appropriate class. If items no longer meet class criteria, move them to another inventory classification." "With cycle counting, counts should be spread throughout the year, with each count being small enough to be processed on the same day." — [RFSmart, Inventory Cycle Count Guide](https://www.rfsmart.com/resources/inventory-cycle-counting-guide)

### Inferences
- The app should compute ABC class automatically from trailing usage/value data (not require manual tagging), surface a suggested count schedule per class, and — critically — the counting UI must default to "blind" (hide system quantity until after the count is submitted), with any variance requiring a second-person approval before it posts (ties into segregation-of-duties findings below).

### Gaps
- Exact frequency numbers vary slightly between sources (monthly vs weekly for A items); treat the ranges as directional guidance rather than a single hard number, and make count frequency configurable per business rather than hardcoding one scheme.

## Operations: reorder point, safety stock, and EOQ

### Takeaway
Reorder point = (average daily demand × lead time) + safety stock; safety stock has several formula variants (the max/average deviation method being one common one); EOQ = √(2 × annual demand × order cost ÷ carrying cost per unit) determines order size, while reorder point determines order timing — the two are complementary, not substitutes.

### Cited Findings
- "The reorder point formula is: Reorder point = (average daily demand x lead time) + safety stock." "Lead Time Demand = Lead Time x Average Daily Sales." — [ShipBob, Reorder Point Guide](https://www.shipbob.com/blog/reorder-point-formula/)
- Safety stock (one common formula): "Safety Stock Level = (Max Daily Orders x Max Lead Time) – (Average Daily Orders x Average Lead Time)." — [Fishbowl, Safety Stock Formula: 6 Methods](https://www.fishbowlinventory.com/blog/calculating-the-safety-stock-formula-6-variations-key-use-cases)
- "The EOQ formula is: √[(2 × Annual Demand × Order Cost) / Carrying Cost per Unit]. EOQ calculates the optimal order quantity that minimizes total inventory costs by balancing ordering costs with carrying costs." — [Medium/Donato Story, EOQ Essentials](https://medium.com/donato-story/eoq-essentials-eoq-safety-stock-reorder-points-and-more-b27004bf0397)
- "Reorder points are used to determine the lowest adequate inventory level without stocking out. EOQ is used to determine optimal order quantity... The combination of both is an effective method of creating a basic replenishment system: the reorder point will determine when to make the purchase, and the EOQ will determine the size of the purchase." — [Bloomreach, Reorder Point Formula](https://www.bloomreach.com/en/blog/how-to-solve-the-reorder-point-formula-inventory-management-strategy)
- Min/Max as a simpler alternative: "Min-max inventory is a replenishment rule where you set a minimum and maximum stock level, and reorder when inventory drops below the minimum... the actual buy/transfer quantity is simply max minus on-hand plus backorders, bounded by supplier pack/lot sizes." "Min–max is only as good as the inputs that drive it: average demand, the volatility around that demand, lead time and its variability, and the service level you need to hit." — [Lokad, Min/Max Inventory Method](https://www.lokad.com/min-max-inventory-planning-definition/)

### Inferences
- For hardware shops/importers with fairly stable demand, min/max (a simplified reorder-point + fixed-max variant) is the pragmatic default UI, with EOQ offered as an "optimize order size" calculator layered on top rather than forced on every SKU — matching the sources' framing of min/max as intuitive/spreadsheet-compatible vs EOQ/safety-stock as a more rigorous refinement for higher-value or more variable-demand items (i.e., worth pairing with the ABC classification: EOQ/safety-stock rigor for A items, simple min/max for C items).
- Backorders must be netted into the replenishment quantity calculation (max − on-hand + backorders), not treated as a separate parallel process, per the min/max sourcing above.

### Gaps
- No single canonical "safety stock formula" — six variant methods exist per Fishbowl's source; the app should let the business pick a method (or default to a simple one) rather than assume one universal formula is "the" standard.

## Operations: job costing — materials issued to jobs

### Takeaway
Job costing moves material cost out of Raw Materials Inventory and into Work-in-Process (WIP) at the moment materials are issued to a specific job, tracked via job-numbered materials requisition forms, and the full job cost transfers from WIP to Finished Goods only on job completion.

### Cited Findings
- "In a job costing environment, materials to be used on a product or project first enter the facility and are stored in the warehouse, after which they are picked from stock and issued to a specific job." "The cost of the direct materials is moved FROM raw materials inventory TO work in process inventory." — [OpenStax, Principles of Accounting Vol. 2 — Job Order Costing](https://openstax.org/books/principles-managerial-accounting/pages/4-3-use-the-job-order-costing-method-to-trace-the-flow-of-product-costs-through-the-inventory-accounts)
- "Once work is completed on a job, the cost of the entire job is shifted from work-in-process inventory to finished goods inventory." — [OpenStax, Principles of Accounting Vol. 2](https://openstax.org/books/principles-managerial-accounting/pages/4-3-use-the-job-order-costing-method-to-trace-the-flow-of-product-costs-through-the-inventory-accounts)
- "The forms used for materials and labor, numbered for the job to which they apply, are totaled daily or weekly and entered on the cost sheets. The cost sheet eventually becomes a summary of all the costs, including factory overhead, involved in completing a job." — [Saylor Academy, How Is Job Costing Used to Track Production](https://saylordotorg.github.io/text_managerial-accounting/s06-how-is-job-costing-used-to-tra.html)

### Inferences
- For contractors, "issue to job" must be a first-class inventory move type (distinct from a sale) that debits a job/project cost account and credits inventory at the current weighted-average cost, with each job accumulating its own running material-cost total — this is the natural intersection point between the inventory ledger and project/job costing modules, and the move record itself (SKU, quantity, cost, job id, timestamp) is what a job cost report is built from, so the data model should support querying "all material moves by job" directly rather than needing a separate job-costing ledger.

### Gaps
- Sources describe manufacturing/general job-order costing textbook treatment; none specifically address the contractor/construction variant (e.g., mixed non-inventory subcontractor costs alongside inventory-drawn materials) — treat the core "issue debits WIP/job, credits inventory at cost" mechanic as solid, but the surrounding project-costing UX (labor, subcontractors, overhead allocation) is outside inventory-standards scope and not covered by these sources.

## Operations: segregation of duties and internal controls for stock

### Takeaway
The core control is that no single person should both initiate (order), execute (receive/move), and verify (count) an inventory transaction — ordering, receiving, custody/storage, and counting/recordkeeping should be split among different people, enforced via system-level access restrictions and audit trails rather than policy alone.

### Cited Findings
- "In inventory management, one person places orders for inventory, the second receives it and verifies quantities, and the third conducts the actual counts." "Someone responsible for inventory custody can't also oversee transactional recordkeeping regarding inventory." — [SafetyCulture, Segregation of Duties for Internal Control](https://safetyculture.com/topics/internal-control/segregation-of-duties)
- "Small businesses should separate responsibilities for ordering, receiving, storing, and counting inventory to help prevent theft and errors in inventory management." — [High Impact CPA, Preventing Fraud: Segregation of Duties in Inventory](https://highimpactcpa.org/preventing-fraud-why-segregation-of-duties-is-crucial-in-the-inventory-function/)
- "Many inventory management systems come with built-in controls that can help enforce segregation of duties by restricting user access to certain functions and maintaining audit trails." — [SafetyCulture, Segregation of Duties for Internal Control](https://safetyculture.com/topics/internal-control/segregation-of-duties)
- "When a company segregates the duties of employees, it minimizes the probability of an employee being able to steal assets and cover up the theft." — [SafetyCulture, Segregation of Duties for Internal Control](https://safetyculture.com/topics/internal-control/segregation-of-duties)

### Inferences
- For a small-business app, true role separation (order vs receive vs count) is often impractical with a 2-3 person staff, so the compensating control is app-enforced: role-based permissions that at minimum prevent the *same user* from both creating a stock count/adjustment and approving/posting it, plus a full audit trail (who created, who approved, timestamps) on every inventory-value-changing transaction (receipts, adjustments, write-offs, shrinkage postings) — this is a design requirement, not just a nice-to-have, directly traceable to these control sources.
- Blind counting (from the cycle-count section) and count-variance approval are the same control principle applied specifically to physical counts.

### Gaps
- No source quantified how small a business can be before formal segregation of duties becomes infeasible and app-enforced compensating controls (dual approval, audit logs) become the primary defense; this is treated here as a reasonable inference rather than a cited fact.

## Design patterns: stock ledger / move-based data model

### Takeaway
Leading inventory systems model every stock change as an immutable "move" (a ledger entry with quantity in/out, unit cost, source/destination, timestamp); on-hand balances are derived by summing moves (often materialized for performance), giving a full audit trail and making "available," "committed," and "on-order" separately computable states layered on top of the same ledger rather than separately maintained counters.

### Cited Findings
- "The stock ledger pattern applies a double-entry mindset to inventory, where every change writes two sides: a decrement from a source and an increment to a destination." — [Cleverence, Inventory design pattern](https://www.cleverence.com/articles/for-business/inventory-design-pattern-5381/)
- "You can compute on-hand by summing movements, but for performance, maintain materialized views (OnHand) updated by the same transaction stream." — [Cleverence, Inventory design pattern](https://www.cleverence.com/articles/for-business/inventory-design-pattern-5381/)
- "Ledger entries should be immutable once posted, with a separate mechanism for corrections (reversals or adjustments)." — [Cleverence, Inventory design pattern](https://www.cleverence.com/articles/for-business/inventory-design-pattern-5381/)
- "Physical stock or accounting stock may not show the 'Available to Sell' which is truly the amount of inventory after netting off the committed stock" — i.e., on-hand and available-to-sell are distinct, with committed/reserved stock as the delta between them. — [Cleverence, Inventory design pattern](https://www.cleverence.com/articles/for-business/inventory-design-pattern-5381/); corroborated by a real-world support-forum complaint that "inventory on hand when entering sales order does not net off committed stock" — i.e., getting this distinction wrong is a common, user-visible bug. — [Zoho community thread](https://help.zoho.com/portal/nl/community/topic/inventory-on-hand-when-entering-sales-order-does-not-net-off-committed-stock?page=17)

### Inferences
- The app's core inventory table should be an append-only ledger of moves (never update/delete a posted quantity, only reverse with a new offsetting move), with on-hand, available (on-hand − committed), committed (reserved by open sales orders/job issues not yet fulfilled), and on-order (open PO quantities not yet received) each computed as a query/materialized view over the same ledger — this single-source-of-truth design directly avoids the netting bug users report against at least one mainstream product (Zoho), and is the same principle that makes the audit trail (immutability) and the accounting reconciliation (GL vs valuation) tractable.

### Gaps
- Cleverence is a vendor/blog source rather than an academic or standards source; the "double-entry ledger" framing is common informally across ERP/WMS engineering blogs but no formal, vendor-neutral textbook citation was retrieved for this specific pattern within the tool-call budget available.

## Design patterns: units of measure conversion

### Takeaway
Products commonly need multiple units (purchase unit, stocking/base unit, sales unit — e.g., buy by the case, stock by the piece, sell by the pair), with one canonical base/stocking unit that all others convert to/from, so on-hand counts and unit costs stay consistent regardless of which unit a given transaction was entered in.

### Cited Findings
- "Units of Measure define how you count, buy, move, make, and sell an item, with a single SKU potentially having multiple related units—you might buy it by the case, store it by the piece, and sell it by the pair." "The base/stocking UoM is the canonical unit your system uses to maintain on-hand inventory, with all other units (purchase, sales, pallet) converting back to this base so counts and costs remain consistent across processes." — [Cleverence, Guide to UoM in inventory](https://www.cleverence.com/articles/for-business/uom-in-inventory-4821/)
- "For example, if you purchase a box of 100 screws but track them each in inventory, the UOM conversion would define that one purchase box equals 100 inventory each, and once this relationship is set, the system can automatically convert quantities during purchasing and receiving without manual math." — [Cetec ERP blog, Managing Inventory and Purchase Units of Measure](https://cetecerp.com/blog/managing-inventory-and-purchase-units-of-measure-in-cetec-erp/)

### Inferences
- For hardware shops (bulk purchase, unit sale — e.g., buying screws/nails by box, selling loose) and importers (buying by container/pallet, selling individually), UoM conversion is not optional polish but a core requirement; the app should store one base unit per SKU with a conversion factor per alternate unit, and every ledger move should be normalized to the base unit internally even if the on-screen transaction was entered in cases/boxes/pallets — this keeps the weighted-average cost calculation correct regardless of which unit staff use day to day.

### Gaps
- No standards-body source covers UoM conversion (it's a systems/product-design topic, not an accounting-standard requirement); all sourcing here is vendor/practitioner blogs, which is appropriate for this design-pattern question but should not be mistaken for authoritative accounting guidance.

## Design patterns: mobile scanning and offline operation

### Takeaway
Field/warehouse inventory apps converge on capturing barcode scans locally on the device and queuing/syncing them once connectivity returns, rather than requiring a live connection for every scan — this is treated as a baseline expectation, not an advanced feature, given that warehouse environments often have poor connectivity.

### Cited Findings
- "Warehouse environments often have connectivity issues, making offline functionality critical, and effective inventory apps should capture and store scan data locally when internet connection is unavailable. Once connectivity returns, the app should seamlessly sync this data to your central database via WiFi or USB connection." — [Finale Inventory, Barcode Inventory App Guide](https://www.finaleinventory.com/guides/barcode-inventory-app/)
- "StockFlow combines native mobile scanning, offline workflows, multi-location support, and enables offline queueing so scans are captured locally and synced once online, which avoids workflow interruptions on the floor." — [StockFlow, Best Free Inventory Software with Barcode Scanning](https://www.stockflowsystems.com/best-free-inventory-software-with-barcode-scanning)
- "Sortly... offers offline mobile access so you can use it in the field and sync later." "Mobile Inventory... works offline with no ads." — [Google Play listings, cited via search](https://play.google.com/store/apps/details?id=ro.bino.inventory&hl=en)

### Inferences
- Given the target segments (contractors on job sites, hardware shops in basements/backrooms with weak signal), offline-first scanning with a local queue and later sync/conflict-resolution (e.g., "this SKU was already adjusted by another user while you were offline — reconcile?") should be treated as a baseline requirement for any mobile counting/receiving feature, not a stretch goal.

### Gaps
- These are practitioner/vendor marketing sources, not independent UX research (NN/g-style) specifically on offline inventory workflows; no dedicated academic/UX-research source on offline conflict-resolution patterns for inventory was retrieved within the available tool-call budget — flagged as a gap for a follow-up research pass if deeper UX guidance is needed.

## Design patterns: owner dashboards and KPIs

### Takeaway
The recurring KPI set across inventory-analytics sources is: inventory turnover (COGS ÷ average inventory), days of inventory/days sales of inventory, dead/slow-moving stock rate, and stock-out rate — with dashboards typically also surfacing carrying cost, fill rate, inventory accuracy, reorder point status, and lead time, filterable by SKU/location/channel.

### Cited Findings
- "Inventory turnover ratio is the number of times a company sells and replenishes its stock over a specific period (usually one year). The formula is: Turnover = Cost of Goods Sold ÷ Average Inventory." — [AltexSoft, Inventory KPIs](https://www.altexsoft.com/blog/inventory-kpis-turnover-ratio-return-rate-shrinkage/)
- "Days on hand (DOH), also known as the average days to sell inventory (DSI) or average age of inventory, is the rate of inventory turns by day." — [AltexSoft, Inventory KPIs](https://www.altexsoft.com/blog/inventory-kpis-turnover-ratio-return-rate-shrinkage/)
- "Dead stock indicates products that have failed to attract customer interest or are no longer relevant to the market... Formula: (Amount of dead inventory in the period / amount of available stock in the period) x 100." — [Skunexus, Inventory Management KPIs](https://www.skunexus.com/blog/inventory-management-kpis)
- "Measuring stockout is important for estimating the opportunity cost of missed orders by not having enough product to fulfill them." — [Logistics Bureau, 11 Inventory Management KPIs](https://www.logisticsbureau.com/a-concise-guide-to-inventory-kpis-for-your-business/)
- "Inventory dashboards track metrics including inventory turnover, stockout rate, days of supply, carrying cost, fill rate, inventory accuracy, reorder point, and lead time. Modern dashboard tools allow you to choose your KPIs, set alert thresholds, and decide how the data is displayed—by region, SKU, channel, or timeframe." — [Omniful, Inventory KPI Dashboards](https://www.omniful.ai/blog/inventory-kpi-dashboards-turnover-stockouts-reorder)

### Inferences
- For a small-business owner dashboard, the minimum viable KPI set is: turnover ratio, days-of-inventory, dead-stock %, and stock-out rate/count — these four are the ones repeated across every source found — plus a valuation-vs-GL reconciliation check (inventory asset value per the ledger must tie to the GL inventory account) as a finance-specific addition not covered by the generic inventory-KPI sources but essential for a *finance* app specifically (this reconciliation requirement follows directly from the perpetual-system/GL-integration design, not from a KPI source).

### Gaps
- None of the retrieved sources specifically addressed "inventory valuation vs GL reconciliation" as a named KPI — this was inferred from the accounting requirements (perpetual system posting to GL) rather than found as an explicit, citable KPI-dashboard best practice; flagged as an inference, not a sourced claim.

## Design patterns: returns to vendor and write-offs

### Takeaway
Vendor returns (RTV) follow their own authorization workflow (create authorization → approve/cancel → ship → credit) and physically quarantine the returned stock (moved to a hold area, flagged as return-designated) so it cannot be accidentally sold, distinct from customer-facing RMA; write-offs/disposal are the end state for damaged/defective stock that inspection determines cannot be returned or repaired.

### Cited Findings
- "A vendor return authorization is a non-posting transaction that tracks a return to a vendor, including the items to be returned, their quantities, the approval status, the shipment status, and the amount refunded or credited from the vendor. The vendor return process includes four steps: creating a vendor return authorization record, approving or canceling the authorization, shipping items authorized to be returned, and crediting an authorized vendor return." — [Oracle NetSuite, Vendor Return Authorization](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N3696445.html)
- "Once inventory is designated for RTV, it is separated from sellable stock and physically moved to a designated hold area within the warehouse so that it's not accidentally sold, picked, or misplaced, and it is also flagged as return-designated stock within the inventory system." — [Greenwave Electronics, Return to Vendor Guide](https://greenwaveelectronics.com/blog/return-to-vendor)
- "Damaged, incomplete, used, or defective products may require quarantine, repair, vendor return, write-off, or disposal. After the goods are received and inspected, they can be returned to inventory, identified as items for repair, or scrapped." — [Qualityze, Return Merchandise Authorization](https://www.qualityze.com/blogs/return-merchandise-authorization)

### Inferences
- The app should model a "quarantine/hold" stock status (separate from available and committed) that returned/damaged goods move into on receipt-inspection, with the RTV workflow (create → approve → ship → vendor credit) as its own move-and-document chain tied to the original PO, and a write-off move type that expenses the item out of inventory permanently when no return/repair path applies — matching the same "distinct, auditable move type" principle established for shrinkage and NRV write-downs above.

### Gaps
- No source distinguished small-business-scale RTV practice from enterprise ERP (NetSuite/Sage) practice; the four-step workflow cited is enterprise-sourced and may be simplified in practice for a 2-3 person shop, but the underlying control principle (quarantine before disposition, approval before shipping back) should hold regardless of business size.
