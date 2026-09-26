# Stock/Inventory in Accounting-First Small-Business Apps: Zoho Inventory/Books, Xero, QuickBooks Online/Enterprise

Scope: Zoho Inventory (+ Zoho Books), Xero (native tracked inventory + common bolt-ons), QuickBooks Online Plus/Advanced, and QuickBooks Enterprise where relevant. Current as of Sept 2026; superseded/legacy items flagged inline.

**Framing note on Xero**: Xero currently has two separate inventory systems — (1) "classic" tracked inventory (Products & Services), long-standing, basic, available in all regions; and (2) **Xero Inventory Plus**, a newer separate add-on launched Aug 15, 2024, **US-only**, for Growing/Established plans, adding multi-location, FIFO, sales orders/fulfillment, and transfers. Most "Xero can't do X" complaints refer to classic inventory. This is flagged throughout.

**Framing note on QuickBooks**: "QBO" below means QuickBooks Online Plus/Advanced (cloud). Many of the deeper warehouse/lot/serial/assembly features exist only in QuickBooks **Desktop Enterprise** (Platinum/Diamond tiers), not in QBO at all — this split is called out per finding.

---

## Tracking (item types, variants, UoM, warehouses/bins, batch/lot/serial, expiry, goods in transit)

### Takeaway
Zoho Inventory has the richest native tracking model of the three (variants, UoM conversion, multi-warehouse with bins, batch OR serial tracking, expiry), but batch and serial tracking are mutually exclusive per item. Xero's classic tracked inventory is deliberately minimal (single location, no batch/serial/expiry, no kits); its new US-only Inventory Plus add-on closes the multi-location gap but still not batch/serial/expiry. QuickBooks Online has no warehouse, bin, batch, serial, or UoM support at all — those exist only in QuickBooks Desktop Enterprise's paid "Advanced Inventory" add-on (Platinum/Diamond).

### Cited Findings
**Zoho Inventory**
- Item types: Inventory (stock-tracked), Non-Inventory (Sales Only/Purchase Only/Both), and Service (non-physical, no inventory tracking) — [Zoho Inventory Item Types](https://www.ardento.com.au/knowledge-hub-posts/zoho-inventory-item-types-explained), [Create Items](https://www.zoho.com/us/inventory/help/items/items-overview.html)
- Composite items were redesigned in 2025 into two models: **Kit Items** (grouped for sale, components stay independent, no physical assembly) and **Assembly Items** (physically assembled into one finished, inventory-tracked product) — [Introducing Assemblies and Kits](https://help.zoho.com/portal/en/community/topic/introducing-assemblies-kits-enhanced-navigation-in-zoho-inventory), [Composite Items](https://www.zoho.com/us/inventory/help/items/composite-items.html). **Superseded**: older "Composite Items"/"Bundling" docs describing a single unified concept are the legacy version, still live and potentially confusing — [Bundling about (legacy)](https://www.zoho.com/us/inventory/kb/composite-items/bundling-about.html)
- Item variants: up to 3 attributes (e.g. color, size) via "Contains Variants" item type, each variant tracked/opening-stock recorded independently — [Managing product variations](https://help.zoho.com/portal/en/community/topic/how-to-manage-product-variations-size-colour-etc)
- Units of Measurement: base unit per item; enabling "Unit Conversion" org-wide creates unit groups so one item can be measured/sold/purchased in multiple units (e.g. box vs. piece) — [UoM settings](https://www.zoho.com/us/inventory/help/settings/uom.html)
- Multiple warehouses ("Locations") supported; only Admin can enable/create locations, and per-user access can be restricted — [Multiple Warehouses overview](https://www.zoho.com/us/inventory/help/warehouses/warehouses-overview.html)
- Bin/shelf locations: smallest storage unit inside a warehouse, supports putaway, bin-to-bin move orders, barcode-driven bin population; **plan-gated**: 2000 bins/warehouse on Premium, 5000 bins/warehouse on Enterprise — [Bin Locations](https://www.zoho.com/us/inventory/bin-locations/)
- Batch tracking: batches carry manufacture + expiry date, auto-sorted first-expiring-first when picked — [Batch Tracking](https://www.zoho.com/us/inventory/help/advanced-inventory-tracking/batch-tracking.html)
- Serial number tracking: unique ID per unit, tracked creation-to-sale for warranty/repair traceability — [Serial Number Tracking](https://www.zoho.com/us/inventory/help/advanced-inventory-tracking/serial-number-tracking.html)
- Hard limitation: "an item can either be serial number tracked or batch tracked, but not both" — [Serial and Batch KB](https://www.zoho.com/us/inventory/kb/advanced-inventory-tracking/batch-and-serial-number-tracking-for-items.html)
- Goods-in-transit is handled via Transfer Order "In Transit" status, not a dedicated module (see Movements).

**Xero**
- Item records are either "tracked" (Xero maintains quantity-on-hand and inventory asset value) or "untracked" (just a code, no quantity/asset tracking) — [Untracked inventory for services](https://central.xero.com/s/article/Untracked-inventory-for-services)
- Xero inventory "doesn't support assemblies or subassemblies... no bill of materials, no assemblies, no kitting, and no manufacturing workflow" — [Xero Inventory Limitations (Inflow)](https://www.inflowinventory.com/blog/xero-inventory-management/)
- "Xero has no native lot number, batch code, serial number, or expiry date fields" — [Xero Inventory Management (Qoblex)](https://qoblex.com/blog/xero-inventory-management/)
- Classic Xero "assumes all stock is in one generic 'location'" — no native multi-location — [Xero Inventory Limitations (Inflow)](https://www.inflowinventory.com/blog/xero-inventory-management/)
- **Xero Inventory Plus** (launched Aug 15, 2024, US-only add-on for Growing/Established) adds multi-location tracking and integrates with Shopify/Amazon FBA — [Xero media release](https://www.xero.com/us/media-releases/xero-unveils-inventory-software-xero-inventory-plus/); supports stock transfers between locations — [Transfer stock in Inventory Plus](https://central.xero.com/s/article/Transfer-stock-in-Xero-Inventory-Plus) (title confirmed via search; central.xero.com blocked full-content fetch)
- Even with Inventory Plus, "there are no detailed pick/pack workflows or bin locations," and it "does not add lot numbers, batch codes, expiry date fields, or FEFO picking" — [Xero Inventory Limitations (Inflow)](https://www.inflowinventory.com/blog/xero-inventory-management/)
- Xero recommends a practical ceiling of **~4,000 tracked items** per org, with performance degrading beyond it — [Tracked Inventory Limits (Xero Community)](https://central.xero.com/s/question/0D53m00009hsQvfCAE/tracked-inventory-limits)
- Tracked inventory items can be linked to Xero Projects tasks/expenses — [Use inventory in Projects](https://central.xero.com/0/article/Use-inventory-in-Projects)

**QuickBooks Online / Enterprise**
- QBO has four item types: Inventory, Non-inventory, Service, Bundle (inventory items require Plus or Advanced) — [Change product/service item types](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/change-product-service-item-types-quickbooks/L9C6adXDc_US_en_US)
- Categories organize items; item "variability" (size/color variants) is a feature newly rolling into QBO Advanced as of this research (flag as emerging/partial rollout) — [Item Variability in QBO Advanced](https://insightfulaccountant.com/accounting-tech/general-ledger/add-some-style-to-your-qbo-inventory-with-item-variability/)
- QBO Bundles are display-only groupings (no BOM, no component-stock consumption tracking); true Assembly Items with BOM are Desktop-only — [Inventory Assemblies in Desktop vs. Bundles in QBO](https://quickbooks.intuit.com/learn-support/en-us/other-questions/inventory-assemblies-in-desktop-vs-bundles-in-qb-online/00/981707)
- Bundles sell without checking component stock — no warning for insufficient quantity, can drive components negative — [same thread](https://quickbooks.intuit.com/learn-support/en-us/other-questions/inventory-assemblies-in-desktop-vs-bundles-in-qb-online/00/981707)
- QBO has **no native Unit of Measure feature on any tier** — Desktop-only; QBO users need third-party apps for UoM/conversions — [Use UoM for items](https://quickbooks.intuit.com/learn-support/en-us/help-article/product-preferences/use-single-multiple-units-measure-items/L5eHnWuOR_US_en_US)
- QBO "Track locations" (Plus/Advanced) is a simple location tag, **not** warehouse-level inventory — no per-location on-hand quantities, reorder points, or bins — [Multi-location inventory complaint thread](https://quickbooks.intuit.com/learn-support/en-us/other-questions/multi-location-inventory-management/00/966043)
- True multi-site inventory, per-site reorder points, and transfers require QuickBooks **Desktop Enterprise Platinum/Diamond "Advanced Inventory"** — [Multiple Inventory Sites](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-inventory/multiple-inventory-sites/L9gJ6syaF_US_en_US)
- Bin location tracking (row/shelf/bin) is Enterprise Advanced Inventory only — [Bin Locations to Items](https://quickbooks.intuit.com/learn-support/en-us/do-more-with-quickbooks/bin-locations-to-items/00/1527549)
- Serial or lot tracking is Enterprise Advanced Inventory only (Platinum/Diamond); an item can be tracked by serial **or** lot, not both — [Track inventory location and serial numbers](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/track-inventory-location-and-serial-numbers/00/133598)

### Inferences
- Zoho is the only one of the three built "warehouse-native" from the ground up; Xero and QBO both treat multi-location/batch/serial as premium bolt-ons (Xero: separate US-only product; QBO: a different, more expensive product entirely — Desktop Enterprise, not QBO).
- The serial-XOR-batch restriction appears twice independently (Zoho and QuickBooks Enterprise), suggesting this is a common data-model simplification in this class of app, not a Zoho-specific quirk.

### Gaps
- No confirmation found on whether Zoho gates batch/serial tracking to specific pricing plans (vs. bin locations, which are confirmed plan-gated).
- Xero: no clear source on whether Xero supports "variants" (size/color) as a first-class concept vs. separate SKUs, or on UoM conversion support.
- QBO/Enterprise: no official source found confirming native lot **expiry-date** tracking (distinct from lot numbers) or any "goods in transit" status/transaction in either product.

---

## Costing (methods, per-location vs company-wide, landed cost, back-dated transactions, negative stock, revaluation, GL accounts)

### Takeaway
Zoho supports both FIFO and weighted-average cost, chosen per item (company-wide, not per-warehouse), with a mature landed-cost allocation feature and strict period-locking around FIFO recalculation. Xero uses weighted-average cost only in its classic product (Inventory Plus adds FIFO, US-only), has no automatic landed-cost allocation, and blocks negative stock outright. QuickBooks Online is FIFO-only and unchangeable once an item exists, actively estimates costs to allow negative stock (then retroactively adjusts), and has no native landed-cost feature; Desktop Enterprise defaults to average cost with FIFO as an optional toggle.

### Cited Findings
**Zoho Inventory/Books**
- Two valuation methods: FIFO and Weighted Average Cost (WAC) — [Inventory Valuation Methods](https://www.zoho.com/inventory/academy/inventory-management/inventory-valuation-methods-fifo-lifo-wac.html)
- Costing method is set **at item creation** and applies company-wide across all warehouses that stock it; the Inventory Valuation Report can be filtered by warehouse for reporting only, not for separate per-warehouse costing — [Inventory Valuation Report](https://www.zoho.com/en-in/erp/help/analytic-reports/inventory-valuation-reports.html)
- Landed cost: additional costs (freight, customs) added to a bill via "+ Add Landed Cost," then allocated across line items proportionally by value or quantity via "Apply Landed Costs"; a landed-cost-only bill can be created and applied to another vendor's bill — [Landed Costs FAQ](https://www.zoho.com/us/inventory/kb/bill/landed-cost.html)
- Back-dated transactions: because FIFO is sequential, editing/deleting an earlier bill recalculates COGS on later invoices; Zoho Books blocks locking a period if a sales invoice depends on a later-dated bill, and partial unlocking is disallowed for inventory-tracked orgs — [Transaction Locking](https://www.zoho.com/us/books/help/accountant/transaction-lock.html)
- A "FIFO Scheduler" defers/batches FIFO recalculation so record creation/edit/delete stays fast, then runs later to value pending transactions — [FIFO Scheduler](https://www.zoho.com/us/inventory/help/fifo-scheduler/fifo-scheduler.html)
- Negative stock: an "Out of Stock warning" toggle exists in Settings; with multi-warehouse enabled, a "Location level" option can block negative stock per individual warehouse — [Out of Stock Warning KB](https://www.zoho.com/de-de/inventory/kb/general-overview/out-of-stock-warning.html)
- GL accounts: Inventory Asset debited at bill/purchase; on sale, Inventory Asset is credited and COGS debited (recognized at invoicing, not at purchase); an "Open"-status bill hits Inventory Asset + Accounts Payable only — [Mastering inventory accounting](https://www.zoho.com/books/academy/accounting-principles/mastering-inventory-accounting.html)
- Stock adjustments let the user pick a specific GL account (e.g. a separate loss/theft account) — [Inventory Adjustments](https://www.zoho.com/us/inventory/help/items/inventory-adjustments.html)
- A distinct "Inventory Revaluation" concept exists for adjusting unit cost/asset value without changing quantity (e.g. for slow-moving stock) — [Inventory Revaluation FAQ](https://www.zoho.com/us/books/kb/year-end-accounting/inventory-revaluation.html)

**Xero**
- "Xero's standard inventory uses weighted average cost as its only valuation method" and "every receipt changes your average" — [Xero Inventory Management guide (Finale)](https://www.finaleinventory.com/guides/xero-inventory-management/)
- Xero Inventory Plus adds a second method: FIFO, alongside weighted average — same source
- "Xero does not allocate shipping, duty, or freight costs to individual stock items... unless you manually adjust purchase prices" — [Inventory and COGS in Xero (ConnectBooks)](https://www.connectbooks.com/blog-posts/how-to-track-inventory-and-cogs-in-xero); a landed-cost allocation feature request is open on Xero's own ideas forum — [Landed Cost allocation (Xero Product Ideas)](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/48529637-inventory-landed-cost-allocation)
- "You can't make an adjustment that would result in a negative quantity on hand in Xero" (negative stock is blocked by design) — cited via search synthesis of [Inventory balance adjustments](https://central.xero.com/0/article/Inventory-balance-adjustments) (Xero Central blocked full-text fetch; treat as secondary-sourced)
- Adjustment accounting: every adjustment alters the inventory asset account and a user-chosen offset account; positive adjustments debit inventory/credit COGS, negative adjustments credit inventory/debit COGS — [How to Account for Stock in Xero (NDCA)](https://nd-ca.co.uk/how-to-account-for-stock-and-inventory-in-xero/)
- Xero distinguishes a pure revaluation adjustment (changes average cost/value only) from a quantity adjustment (changes quantity, value recalculated at current average cost) — via search synthesis of the same Xero Central article

**QuickBooks Online / Enterprise**
- QBO always treats first-purchased units as first sold (FIFO), adjusting Inventory Asset and COGS accordingly — [What is FIFO in QBO](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/fifo-used-inventory-cost-accounting/L1x3hkunE_US_en_US)
- The costing method **cannot be changed later**; QBO defaults automatically to FIFO once an inventory item exists — same source
- QuickBooks Desktop Enterprise separately offers "FIFO Options" as a configurable add-on feature, implying its base/default costing is Average Cost — [FIFO Options in Enterprise](https://quickbooks.intuit.com/learn-support/en-us/help-article/product-preferences/fifo-options-quickbooks-desktop-enterprise/L3kDpI5Aj_US_en_US)
- Negative inventory in QBO distorts FIFO layers; there is **no setting to prevent** selling with insufficient on-hand quantity — [Fix negative inventory issues](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/fix-negative-inventory-issues-quickbooks-online/L95hlEOoc_US_en_US)
- When inventory goes negative, QBO estimates cost from past purchase history, then the item's setup Cost field, then zero — and retroactively adjusts the earlier sale's cost once a real purchase is recorded — [redmondaccounting.com summary](https://redmondaccounting.com/2025/09/27/reviewing-inventory-in-quickbooks-online/)
- Backdated transactions ripple through FIFO layers because FIFO is time-sensitive; recommended practice is to run before/after valuation reports to document impact — same source
- QBO's Inventory Qty Adjustment tool lets users manually correct on-hand quantity, choosing an "inventory adjustment account"; saving posts to Inventory Asset and to COGS under an "Inventory Shrinkage" sub-account — [Adjust inventory quantity on hand](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-quantity/adjust-inventory-quantity-hand-quickbooks-online/L6O3QhOEZ_US_en_US)
- QuickBooks Desktop separately supports both quantity adjustments and value adjustments as distinct transaction types — [Adjust inventory qty or value (Desktop)](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-adjustment/adjust-inventory-quantity-value-quickbooks-desktop/L8p8OoeGs_US_en_US)

### Inferences
- All three vendors treat FIFO as inherently "recalculation-sensitive" to back-dated entries — Zoho locks periods to prevent this, QBO instead lets it happen and recommends before/after reporting, and Xero (average cost) recalculates the average forward rather than replaying historical layers. This is a meaningful architectural difference for a product team to weigh: FIFO gives more accurate matching but costs more operational rigor (locking, schedulers); average cost is more forgiving of backdating but less precise per-unit.
- QBO's stance on negative stock (allow + estimate + retroactively true-up) is the most permissive/least controlled of the three; Xero is the strictest (hard-blocks negative adjustments); Zoho is configurable (org-wide or per-location toggle).

### Gaps
- Zoho: no official confirmation of whether FIFO/WAC can be changed after an item has transaction history (community threads suggest friction, no definitive doc); no mention anywhere of LIFO or standard costing support (appears FIFO+WAC only).
- Xero: could not retrieve primary-source full text on the exact back-dated-transaction recalculation mechanics (central.xero.com blocked automated fetch); unclear whether Inventory Plus multi-location keeps a separate average cost per location or one blended average.
- QBO/Enterprise: no official Intuit page found describing a native landed-cost feature in either product — appears to require third-party apps, but no specific named app confirmed from an official source; no explicit 2026 Intuit statement confirming Enterprise's non-FIFO default is officially termed "Average Cost" (inferred from the existence of the separate "FIFO Options" toggle).

---

## Movements (receiving/GRN, transfers, adjustments, stock counts, returns, assemblies, project issuance)

### Takeaway
Zoho has the most complete movement model: a distinct Purchase Receive step (enabling an effective 3-way match with PO and Bill), two-step transfer orders with an "In Transit" status, separate quantity vs. value adjustments, a dedicated stock-count screen, and both sales and purchase returns as first-class objects — but job/project stock issuance is not a native feature. Xero has none of this in its classic product (no transfer orders, no distinct receiving step, stock-takes are a manual report-reconciliation exercise, no assemblies); Inventory Plus adds transfers but purchase-side returns still need a manual workaround. QBO has no separate goods-receipt transaction (billing directly against the PO acts as receiving) and no assemblies (Bundles don't consume component stock); true Item Receipts, Build Assembly, and site transfers are Enterprise Advanced Inventory features only.

### Cited Findings
**Zoho Inventory**
- Purchase Receives are a distinct document indicating receipt of goods from a vendor, recorded against POs (not directly on bills), and can be created even for already-billed POs — [Purchase Receives in Bills KB](https://www.zoho.com/us/inventory/kb/bill/bill-receive.html)
- Converting a receive into a bill pulls exactly the received quantity, giving an effective PO → Receipt → Bill 3-way-match trail; partial billing is supported — [Converting Purchase Receives to Bills](https://www.zoho.com/us/inventory/kb/bill/receive-bill.html)
- Transfer Orders: select one source + one destination warehouse; "Initiate Transfer" sets status to "In Transit," and the destination receipt must be manually completed to close the loop — [Transfer Orders User Guide](https://www.zoho.com/us/inventory/help/warehouses/transfer-orders.html)
- Limitation: a single transfer order supports only one source and one destination — splitting stock to multiple destinations needs multiple separate transfer orders — [Multi-warehouse transfer FAQ](https://www.zoho.com/us/inventory/kb/warehouses/transfer-multiple-stock.html)
- Stock adjustments: two types — Quantity Adjustment (count mismatches: theft, damage, data-entry error) and Value Adjustment (cost/value changes, e.g. slow-moving devaluation), each with a selectable/customizable "Adjustment Reason" — [Stock Adjustments KB](https://www.zoho.com/us/inventory/kb/items/item-adjust-stock.html)
- Physical Stock Counts: dedicated "Stock Counting" screen under Inventory; saving a count auto-generates a Quantity Adjustment against the "Cost of Goods Sold" account by default, reason "Stock taking results" — [Stock Counts User Guide](https://www.zoho.com/us/inventory/help/items/stock-counts.html)
- Sales Returns (RMA): seller issues a Credit Note which increases returned-item stock and can be applied against future invoices — [RMA/Sales Returns Overview](https://www.zoho.com/us/inventory/help/sales-returns/sales-returns-overview.html)
- Purchase Returns: records items returned to vendor, updates inventory and vendor balances, auto-generates a linked Vendor Credit applicable to future bills — [Create Purchase Returns](https://www.zoho.com/us/inventory/help/purchase-returns/create-purchase-return.html)
- Assembling composites: for Assembly-type items, physical assembly consumes component stock and increases assembled-item stock; batch tracking is supported on composite/variant items — [Batch Tracking for Composites](https://www.zoho.com/us/inventory/kb/advanced-inventory-tracking/batch-tracking-variants-and-composites.html)
- Issuing stock to projects/jobs is **not a native job-costing feature**; stock can be "committed" to a sales order/customer, but third-party analysis states Zoho Inventory "was not designed specifically for contractors" (lower-confidence: sourced from third-party/blog, not official Zoho docs) — [ZBrains: Job Costs with Zoho](https://zbrains.net/zoho-erp/zoho-job-costing/)

**Xero**
- "Every time you raise a purchase order or bill for the item, Xero increases the stock quantity. Every time you invoice a customer for it, Xero reduces the quantity and posts a cost of goods sold entry" — no separate goods-receipt step exists in classic Xero — [Tracked vs untracked summary](https://www.bizraves.com/understanding-tracked-vs-untracked-items-in-xero/)
- Stock transfers between locations exist only in Inventory Plus — [Transfer stock in Inventory Plus](https://central.xero.com/s/article/Transfer-stock-in-Xero-Inventory-Plus); classic Xero has no such feature, per repeated user questions, e.g. ["I need to transfer between tracked inventory"](https://central.xero.com/s/question/0D51N00004FoITgSAN/i-need-to-transfer-between-tracked-inventory)
- Stock-take/count workflow uses the **Inventory Item List report** manually: "use this report to do a full stock-take, check for untracked or miscounted items and make sure your records match actual stock levels" — [Inventory Item List report](https://central.xero.com/0/article/Inventory-Item-List-report-New)
- Sales-side returns: a credit note records the return of an inventory item sold or purchased — [Record returned inventory items](https://central.xero.com/s/article/Record-returned-inventory-items-UK)
- Purchase-side returns require a manual workaround: add a decrease quantity adjustment to a suspense account, then record the supplier's refund as a receive-money transaction against that suspense account — same source
- Assemblies/kits: not supported at all — "no bill of materials, no assemblies, no kitting" — [Xero Inventory Limitations (Inflow)](https://www.inflowinventory.com/blog/xero-inventory-management/)

**QuickBooks Online / Enterprise**
- No separate "goods receipt" transaction in QBO — receiving is done via Bill/Expense against a PO; partial receipt is possible by editing quantities on the bill, and a PO auto-closes only once all quantities have been billed — [Partial receipt on POs](https://quickbooks.intuit.com/learn-support/en-us/other-questions/partial-receipt-on-purchase-orders/00/236446)
- Partially received POs display a backordered quantity/open balance for unreceived items; some users report partially-received POs sometimes fail to correctly show as "Open" (known workflow friction) — [Backorder display thread](https://quickbooks.intuit.com/learn-support/en-us/other-questions/receiving-a-partial-purchase-order-if-there-is-an-item-s-on-the/00/1138441), [Open-status bug thread](https://quickbooks.intuit.com/learn-support/en-us/payments/why-does-a-partially-received-po-not-show-as-open-when-trying-to/00/1450048)
- Inventory Assembly items with BOM (true "Build Assembly" transaction) are Desktop/Enterprise-only, distinct from QBO Bundles — [Set up inventory assembly items and BOM](https://quickbooks.intuit.com/learn-support/en-us/help-article/physical-inventory/set-manage-inventory-assembly-items-bill-materials/L3Vfs6LXF_US_en_US)
- Enterprise Advanced Inventory supports site-to-site transfers with printable transfer vouchers; barcode scanning covers transfers but is **not** available via the mobile app — a desktop program is required to complete transfers — [Transfer Inventory Using a Barcode Scanner](https://quickbooks.intuit.com/learn-support/en-us/other-questions/transfer-inventory-using-a-barcode-scanner/00/1487681)
- Physical inventory worksheets can be filtered by groupings (e.g. department) for simultaneous multi-person counts; a portable barcode scanner lets users review/resolve count errors before posting — [QuickBooks Enterprise Advanced Inventory Guide 2026](https://www.certumsolutions.com/library/quickbooks-enterprise-advanced-inventory)
- QBO job-costing: materials purchased for a job are coded to a Customer/Project on the Bill/Expense, but allocating **existing** inventory item cost directly to a project is currently unavailable — the workaround is a manual transfer/inventory adjustment — [Job costing for inventory items](https://quickbooks.intuit.com/learn-support/en-us/do-more-with-quickbooks/job-costing-for-inventory-items/00/1495058)

### Inferences
- A genuine "goods receipt separate from the bill" step (Zoho's Purchase Receive; Enterprise's Item Receipt) appears to be the feature that most cleanly enables 3-way match; QBO and classic Xero collapse receiving into billing, which is simpler but weaker for matching/controls.
- Job/project stock issuance is a gap across all three at the accounting-app tier — none treats "consume inventory against a job" as a first-class transaction; this is consistently pushed to manual adjustments or third-party job-costing modules.

### Gaps
- Zoho: no official doc (only third-party) confirming "Move Orders" as an official Zoho Inventory feature vs. a Zoho Creator/custom pattern; no official doc on whether in-transit transfer value sits in a distinct "Inventory in Transit" GL account or stays in the source warehouse's Inventory Asset account.
- Xero: full step-by-step of the Inventory Plus stock-transfer feature not retrievable (central.xero.com blocked automated fetch); unclear whether purchase credit notes auto-decrement quantity in all cases vs. only via the manual workaround.
- QBO/Enterprise: no dedicated official article confirming whether Credit Memo (sales return) / Vendor Credit (purchase return) automatically restock/de-stock quantity in QBO (widely assumed, not directly sourced); no explicit source distinguishing "Item Receipt" as a standalone Enterprise transaction type vs. Bill.

---

## Ordering (reorder points, PO lifecycle/backorders, approvals, 3-way match, drop shipping, SO→pick→pack→ship)

### Takeaway
Zoho has the fullest native ordering pipeline: per-item reorder points, backorder and drop-ship tabs directly off the sales order, configurable multi-level purchase approval, and an optional Picklist → Package → Shipment fulfillment flow. Xero's classic product has none of this (no reorder points, no sales orders, no drop-shipping); Inventory Plus (US-only) adds reorder points, sales orders, and fulfillment/shipping via Shippo. QuickBooks Online has no Sales Order object at all (uses Estimate → Invoice) and only a basic reorder-point display; the full Sales Order → Pick/Pack/Ship pipeline and PO/Bill approval workflows exist only in QuickBooks Desktop Enterprise (Platinum/Diamond).

### Cited Findings
**Zoho Inventory**
- Reorder level + preferred vendor set per item; system alerts when stock reaches/falls below the reorder point — [Item Additional Features](https://www.zoho.com/inventory/help/items/additional-features.html)
- Automatic PO generation from reorder points is **not built-in out-of-the-box** — a marketplace add-on ("Automated Item Reorders") exists specifically to add this — [Automated Item Reorders extension](https://marketplace.zoho.com/app/inventory/automated-item-reorders-for-zoho-inventory)
- Backorders: a backorder PO is raised from a Sales Order when items are out of stock or already committed elsewhere; once received, pending sales orders are fulfilled — [What is a Backorder?](https://www.zoho.com/inventory/academy/order-fulfillment/what-is-backorder.html)
- Drop shipments: item and "Dropship To" (customer) details auto-populate from the sales order onto the drop-ship PO; both backorders and drop-shipments exist as separate tabs on the same sales order — [Backorders & Dropshipments KB](https://www.zoho.com/us/inventory/kb/sales-order/so-backorder-and-dropship.html)
- Purchase approval supports **Multi-Level Approval**: a transaction routes through a configured hierarchy of approvers; an Admin can "Final Approve" to skip remaining levels — [Transaction Approval Workflow](https://www.zoho.com/us/inventory/help/transaction-approval-new-flow/transaction-approval-workflow.html)
- PO → Receive → Bill lifecycle gives an effective 3-way match (PO qty vs. received qty vs. billed qty)
- Sales fulfillment: Sales Order → optional Picklist (enabled if the business needs it, assigns pick tasks to warehouse pickers) → Package (packing slip, statuses Not Shipped/Shipped/Delivered) → Shipment, integrating with 40+ carriers — [Picklist User Guide](https://www.zoho.com/us/inventory/help/picklist/), [Packages User Guide](https://www.zoho.com/us/inventory/help/sales-orders/packages.html)

**Xero**
- Classic Xero supports partial PO fulfillment by editing quantities when copying a PO to a bill, keeping the original PO open for further bills, or "closing short" the remaining line-item quantity — via search synthesis of [Purchase orders in Inventory Plus explained](https://central.xero.com/s/article/Purchase-orders-in-Xero-Inventory-Plus-explained); a live customer request "Purchase Orders - Option to part-receive" on Xero's ideas forum implies the classic part-receiving flow is imperfect — [Xero Product Ideas](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/47086402-purchase-orders-option-to-part-receive)
- No native reorder points in classic Xero; reorder automation is available only through connected apps like Cin7 Core and Unleashed
- Xero Inventory Plus adds native reorder points ("set reorder points to stay on top of inventory level") — [Xero media release](https://www.xero.com/us/media-releases/xero-unveils-inventory-software-xero-inventory-plus/)
- Inventory Plus adds native Sales Orders and Fulfillment screens, including carrier/shipping integration via Shippo — [Sales orders in Inventory Plus](https://central.xero.com/s/article/Sales-orders-in-Xero-Inventory-Plus-explained), [Fulfillment in Inventory Plus](https://central.xero.com/s/article/Fulfillment-in-Xero-Inventory-Plus-explained)
- Drop-shipping is not native to Xero; third-party apps (Duoplane, StoreFeeder) add it — [Dropshipping software for Xero (GetApp)](https://www.getapp.com/website-ecommerce-software/dropshipping/w/xero/)

**QuickBooks Online / Enterprise**
- QBO shows on-hand quantity and reorder point when hovering over an item on a PO — [Manage inventory in QBO](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/manage-inventory/L6uV44KsS_US_en_US)
- QBO has **no Sales Order object at all** — workflow is Estimate → Invoice, with Estimate status (Pending/Accepted/Closed/Rejected) substituting for order tracking — [Sales Orders from Estimates](https://quickbooks.intuit.com/learn-support/en-us/account-management/sales-orders-from-estimates/00/516164)
- QuickBooks Desktop's Sales Order feature (Premier and Enterprise only) follows Estimate → Sales Order → Invoice, explicitly to track backordered items — [Create a sales order (Desktop)](https://quickbooks.intuit.com/learn-support/en-us/help-article/sales-orders/create-sales-order/L6mKnrj8m_US_en_US)
- Enterprise's Pick/Pack/Ship, via the Sales Order Fulfillment Worksheet in Advanced Inventory, is Platinum/Diamond only, with a single dashboard tracking pick/pack/ship status and mobile barcode-scanner instructions — [Sales Order Fulfillment Worksheet](https://quickbooks.intuit.com/learn-support/en-us/help-article/physical-inventory/use-sales-order-fulfillment-worksheet/L67JDmznz_US_en_US)
- Enterprise v20 Advanced Inventory added "Express Pick-Pack," merging the pick and pack steps into one — [Enterprise v20 Express Pick-Pack](https://insightfulaccountant.com/accounting-tech/general-ledger/quickbooks-enterprise-v20-advanced-inventory-express-pick-pack/)
- Enterprise Platinum/Diamond supports custom Bill/PO approval workflows with trigger conditions on Amount, Vendor name, Vendor type; **only one level of approval is supported**, limiting flexibility — [Custom bill approval workflows](https://quickbooks.intuit.com/learn-support/en-us/help-article/pay-bills/set-custom-bill-approval-workflows-quickbooks/L8veyuJhR_US_en_US)

### Inferences
- Zoho's multi-level approval vs. Enterprise's single-level approval is a meaningful differentiator for larger operations requiring layered sign-off; a product team targeting mid-market controls should note Enterprise's cap here.
- The complete absence of a QBO Sales Order object is a structural gap, not a missing setting — any product wanting to compete with QBO on "committed vs. available stock" visibility has a clear opening, since QBO can't natively show that distinction pre-invoice.

### Gaps
- Zoho: no official doc confirming the exact PO status list (Draft/Issued/Partially Received/Billed/Closed/Cancelled) from one canonical page — inferred from receive/bill workflow pages rather than an explicit status list.
- Xero: exact mechanics of "close short" (whether it fully closes the PO line or just flags it) not verified against primary-source text; no confirmation of formal multi-step PO approval beyond basic user-role permissioning.
- QBO/Enterprise: no official source names a formal "3-way match" feature in either product (Enterprise's Bill approval implies matching logic exists, but nothing is named as such); no direct source on native drop-shipping configuration in QBO/Enterprise (commonly done via billable POs, not confirmed officially).

---

## Module design (navigation, dashboards/reports, mobile/barcode, roles)

### Takeaway
Zoho groups inventory-related work under distinct Items / Sales / Purchases / Inventory sidebar modules with the broadest report set of the three (including a FIFO Cost Lot Tracking report) and camera-based + external-scanner mobile barcode support. Xero keeps inventory inside Business > Products and Services with three core reports (Item List/Details/Summary) and no native barcode scanning — that's delivered by third-party App Store apps. QuickBooks Online treats Products & Services as a list under Sales/Settings rather than a standalone module, lacks Desktop's "Stock Status by Item" report (approximated via Valuation Detail + Sales by Product/Service), and only QuickBooks Enterprise ships a genuine mobile barcode-scanning app (with a caveat: not for transfers).

### Cited Findings
**Zoho Inventory**
- Sidebar modules: Sales, Purchases, Inventory (Shipments/Packages/Picklists + warehouse tools), and a separate Items module; modules can be toggled on/off, custom modules appear under "More" — [Custom Modules Basic Functions](https://www.zoho.com/us/inventory/help/custom-modules/basic-functions.html) (lower confidence: primary community-walkthrough source for exact nav tree, not an official current sitemap)
- Reports: Inventory Summary, Inventory Valuation Summary/Report (filterable by warehouse/category), FIFO Cost Lot Tracking, plus WAC- and ABC-classification-based valuation reports — [Inventory Reports](https://www.zoho.com/us/inventory/help/reports/inventory-reports.html)
- FIFO Cost Lot Tracking report specifically traces incoming/outgoing batches on the FIFO principle — [FIFO Cost Lot Tracking Glossary](https://www.zoho.com/us/books/accounting-terms/fifo-cost-lot-tracking.html)
- Mobile apps (iOS/Android): built-in camera barcode scanning plus external "keyboard mode" scanner support (e.g. Zebra); newer capability to scan serial numbers/batch details directly into Invoice line items — [Zoho Inventory Mobile Apps](https://www.zoho.com/us/inventory/mobile-apps/)
- Roles: only Admin can enable/create Locations (warehouses); a "Staff" role has non-admin day-to-day access; custom roles support granular module/action permissions; a specific "Configure Warehouse Access to Users" permission gates per-warehouse visibility — [Restrict warehouse access](https://www.zoho.com/us/inventory/kb/warehouses/manage-specific-warehouse.html)

**Xero**
- Navigation: Sales menu > Products and services > menu icon > Inventory Item List report — [Inventory Item List report](https://central.xero.com/0/article/Inventory-Item-List-report-New)
- Core reports confirmed: Inventory Item List, Inventory Item Details, Inventory Item Summary, Inventory Item Sales — [Item Details report](https://central.xero.com/0/article/Inventory-Item-Details-report-New), [Item Summary report](https://xero.my.site.com/s/article/Inventory-Item-Summary-report-New)
- No Xero-native barcode scanner; barcode/mobile workflows are delivered by third-party App Store apps that assign unique barcodes to items — [Barcode Scanner Apps for Xero](https://slashdot.org/software/barcode-scanner/for-xero/)
- Xero offers an active formal training course "Set up and manage tracked inventory in Xero: step-by-step guide," published March 9, 2026, confirming the feature is still actively documented/taught — [Xero Central Learning](https://learning.central.xero.com/student/path/4938-set-up-and-manage-tracked-inventory)

**QuickBooks Online / Enterprise**
- Products and Services is reached via Sales > Products and Services, or Settings (gear) > Lists > Products and services — [Navigate QBO](https://quickbooks.intuit.com/learn-support/en-us/help-article/product-setup/navigate-quickbooks-online-menus-transactions-set/L5eM9dp7W_US_en_US)
- Inventory Valuation Summary report is a point-in-time snapshot per item (quantity on hand, average cost, asset value, % of total value, sales/retail price); Inventory Valuation Detail shows the transactions affecting quantity/value/cost — [Balance Sheet vs. Inventory Valuation reports](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/balance-sheet-inventory-stock-valuation-reports/L02dbIDsy_US_en_US)
- QBO does **not** include Desktop's exact "Inventory Stock Status by Item" report; users approximate it with Stock Valuation Detail + Physical Inventory Worksheet + Sales by Product/Service — [Reports for sales/inventory status](https://quickbooks.intuit.com/learn-support/en-us/help-article/report-management/use-reports-see-sales-inventory-status/L7ocoLmqP_US_en_US)
- Enterprise Advanced Inventory ships a mobile barcode-scanning app supporting wireless/wired scanners for receiving, cycle counts, and picking (but not transfers, per Movements section) — [Simplify inventory with mobile barcode scanning](https://quickbooks.intuit.com/ca/enterprise/mobile-barcode/)
- Enterprise role-based permissions are configured via Role List (admin password required) with granular access levels (e.g. "Partial" access to Vendors & Payables) — [QuickBooks Enterprise Vendor & Procurement Guide](https://www.mindingmybooks.com/quickbooks-enterprise-vendor-procurement-management)

### Inferences
- Zoho's report catalog is the only one of the three with a report explicitly designed around FIFO lot traceability, matching its deeper native costing/tracking model.
- Native mobile barcode scanning is effectively an "enterprise tier" feature across the whole category: only QuickBooks Enterprise (the most expensive, desktop-rooted product) ships it as a first-party mobile app; Zoho gets there via its own general-purpose mobile app; Xero relies entirely on third parties.

### Gaps
- Zoho: no official, current, single-page sitemap of the exact left-nav menu tree found (relied on a community walkthrough thread); no official "Aging Report" (stock aging/slow-moving) documentation page found despite it being a common report type in this category — may exist under a different name.
- Xero: no confirmation on inventory-specific user-role/permission granularity (vs. general Xero user roles); no confirmation on whether the standard Xero mobile app exposes tracked-inventory lookup/editing at all.
- QBO/Enterprise: no official page laying out an Enterprise "Vendor Center / Customer Center / Inventory Center" navigation structure specifically confirmed current for 2026; no official source confirming named "warehouse staff" role templates/presets in Enterprise's Role List.

---

## Known limitations and common user complaints

### Takeaway
Each product's complaints track its architecture: Zoho users complain about the serial-XOR-batch limit, single-source/destination transfers, and FIFO-driven transaction-lock friction; Xero users complain most about the total absence of multi-warehouse/FIFO/batch/serial/BOM in classic inventory and a ~4,000-item practical ceiling, with Inventory Plus only partially and only-in-the-US addressing this; QuickBooks Online users complain that real warehouse features (multi-location, bins, serial/lot, true assemblies, sales orders, approvals) require jumping all the way to the much pricier Desktop Enterprise Platinum/Diamond tier, and that QBO permits negative stock with no way to block it.

### Cited Findings
**Zoho Inventory**
- Serial tracking and batch tracking are mutually exclusive per item — a frequently-cited constraint — [Serial and Batch Number Tracking KB](https://www.zoho.com/us/inventory/kb/advanced-inventory-tracking/batch-and-serial-number-tracking-for-items.html)
- Community complaint thread: "Assemblies make my stock go negative" — [community thread](https://help.zoho.com/portal/en/community/topic/assemblies-make-my-stock-go-negative)
- Users request the ability to transfer stock from one warehouse to multiple destinations in a single transfer order (not supported) — [Multi-warehouse transfer FAQ](https://www.zoho.com/us/inventory/kb/warehouses/transfer-multiple-stock.html)
- Long-running, still-active community request thread "Allow negative inventory in Zoho Books," spanning 190+ forum pages — indicates sustained demand for more flexible negative-stock handling — [Allow negative inventory thread](https://help.zoho.com/portal/en/community/topic/allow-negative-inventory-in-zoho-books)
- Community reports of discrepancies between the Inventory Adjustment value and the FIFO Cost Lot Tracking report — a valuation-report reconciliation issue some users hit — [Discrepancy thread](https://help.zoho.com/portal/en-gb/community/topic/discripency-in-inventory-adjustment-value-and-fifo-report)
- Landed cost allocation flagged as needing improvement via a formal user-feedback forum entry — [Landed cost allocation feedback](https://zohofinance.uservoice.com/forums/294735-zoho-inventory/suggestions/34755148-landed-cost-allocation)
- Transaction locking is restrictive for inventory-tracked orgs: partial period unlocking is disallowed, and locking fails outright if FIFO valuation is still processing — [Unable to Lock Transactions FAQ](https://www.zoho.com/us/books/kb/accountant/transactionlock-pending-inventory-valuation.html)
- G2 (2026) and Business.org reviews note limited customization/reporting flexibility, plan-based caps on order volume and monthly shipping labels, and that add-ons/integrations can significantly raise total cost above the advertised base price — [G2 Zoho Inventory Reviews](https://www.g2.com/products/zoho-inventory/reviews), [Business.org Zoho Inventory Review 2026](https://www.business.org/finance/inventory-management/zoho-inventory-review/)
- Bin Locations feature is plan-gated (2000 bins/warehouse Premium, 5000 bins/warehouse Enterprise) — a ceiling larger warehouse operators may hit — [Bin Locations help](https://www.zoho.com/us/inventory/help/bin-locations/)
- Third-party analysis argues Zoho Inventory's core workflows fit product sale/ship/fulfill businesses, not trade/contractor businesses consuming inventory against jobs — a recurring conceptual limitation for that segment — [ZBrains: Job Costs with Zoho](https://zbrains.net/zoho-erp/zoho-job-costing/)

**Xero**
- "One of the most significant limitations of Xero's basic inventory functions is its inability to track inventory across multiple locations... It assumes all stock is in one generic 'location'" — [Xero Inventory Limitations (Inflow)](https://www.inflowinventory.com/blog/xero-inventory-management/)
- A direct, unresolved-style Xero Community question exists: "Can Xero inventory manage multiple warehouses?" — [Xero Central Q&A](https://central.xero.com/s/question/0D53m00009nc0LVCAY/can-xero-inventory-manage-multiple-warehouses) (title/existence confirmed only; full thread text not retrievable)
- No native lot number/batch code/serial number/expiry date fields even after Inventory Plus, which "does not add lot numbers, batch codes, expiry date fields, or FEFO picking" — [Qoblex](https://qoblex.com/blog/xero-inventory-management/), [Inflow](https://www.inflowinventory.com/blog/xero-inventory-management/)
- Feature requests for serial-number tracking remain open/unresolved on Xero's own product-ideas forum, with repeated duplicate community questions — [Tracked serial numbers (Xero Product Ideas)](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/46330456-inventory-tracked-serial-numbers)
- The ~4,000-item practical/performance ceiling is repeatedly raised across multiple separate community questions — [Tracked Inventory Limits](https://central.xero.com/s/question/0D53m00009hsQvfCAE/tracked-inventory-limits), [How Many Tracked Inventory Items](https://central.xero.com/s/question/0D58V00009yhf0cSAA/how-many-tracked-inventory-items-can-you-actually-have)
- Landed-cost allocation is an unfulfilled, actively-requested feature — [Landed Cost allocation (Xero Product Ideas)](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/48529637-inventory-landed-cost-allocation)
- Assemblies/BOM is a long-standing open community request (titles confirmed, full text not retrievable) — [community discussion](https://community.xero.com/business/discussion/9006822)
- Inventory Plus's own rollout is itself a complaint vector: US-only as of this research, with a live "Gaining Support"-status request on Xero's ideas board to expand it to other countries — [Inventory Plus - Roll out to all countries](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/50393745-inventory-plus-roll-out-xero-inventory-plus-to-a)

**QuickBooks Online / Enterprise**
- QBO inventory (Plus/Advanced) supports only one location for inventory lists; separate inventory lists per location are not possible on QBO itself — [Community thread](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/can-i-create-2-separate-inventory-lists-for-2-locations-on/00/417927)
- Multi-year, ongoing Community requests for real multi-location inventory in QBO, with Intuit's standing response being "they are working on it," and user frustration that the only path to warehouse features is upgrading to a tier "2/3 times more expensive" (unofficial characterization, community-sourced) — [Multi Location Inventory Management? thread](https://quickbooks.intuit.com/learn-support/en-us/other-questions/multi-location-inventory-management/00/966043)
- Third-party add-ons (e.g. Stockpit, ~$9/month) are recommended by the community specifically to patch QBO's lack of native multi-location inventory — [Method blog](https://www.method.me/blog/quickbooks-online-multiple-inventory-locations/)
- No setting to block selling inventory below zero on hand — a frequently cited cause of valuation errors, which official guidance treats as something to actively "fix" after the fact — [Fix negative inventory issues](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/fix-negative-inventory-issues-quickbooks-online/L95hlEOoc_US_en_US)
- FIFO costing in QBO is locked in permanently once an inventory item is created/used — [What is FIFO in QBO](https://quickbooks.intuit.com/learn-support/en-us/help-article/inventory-management/fifo-used-inventory-cost-accounting/L1x3hkunE_US_en_US)
- Serial/lot number tracking is entirely absent from QuickBooks Online; exists only in Desktop Enterprise Advanced Inventory (Platinum/Diamond) — [Track inventory location and serial numbers](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/track-inventory-location-and-serial-numbers/00/133598)
- Enterprise's PO/Bill approval workflow is limited to a single approval level, reducing flexibility for larger organizations needing multi-stage sign-off — [QuickBooks Enterprise Vendor & Procurement Guide](https://www.mindingmybooks.com/quickbooks-enterprise-vendor-procurement-management)
- Assigning existing inventory item cost directly to a Project for job costing is currently unavailable in QBO — a specifically named limitation versus expense/bill job costing — [Job costing for inventory items](https://quickbooks.intuit.com/learn-support/en-us/do-more-with-quickbooks/job-costing-for-inventory-items/00/1495058)

### Inferences
- A single complaint pattern recurs across all three vendors: real warehouse-grade functionality (multi-location, batch/serial, transfers, approvals) is reserved for a materially more expensive tier or a separate paid product, and each community pushes back on that gating rather than on the base functionality itself.
- Negative-stock policy is a genuine three-way split and a clear positioning axis: Xero blocks it outright, Zoho makes it configurable, QBO allows it and papers over the cost impact after the fact — a product team benchmarking against these should decide deliberately which posture to take rather than defaulting to one.

### Gaps
- Zoho: could not access full text of most help.zoho.com community threads (titles/snippets only) — complaint substance beyond thread titles is not independently verified for several items; treat as directionally accurate but not deeply sourced. No official aggregated "known issues" page found from Zoho itself.
- Xero: could not retrieve full body text of any community.xero.com or central.xero.com discussion thread (Salesforce-community-style site returned empty content to automated fetch tools) — all community-thread findings are limited to titles/existence plus third-party paraphrase, not verified direct quotes. Could not find a source explicitly confirming or denying the specific claim "inventory only usable through invoicing, not manual journals" (flagged as unconfirmed rather than asserted).
- QBO/Enterprise: no dedicated official Intuit "known issues/limitations" page for QBO inventory found — findings drawn from scattered Community threads rather than one consolidated document; could not confirm current (2026) pricing/tier gap size between QBO Advanced and Enterprise Platinum from an official source (only an unofficial community characterization).

---

## Outdated/superseded items flagged during research
- **Zoho**: Older "Composite Items"/"Bundling" documentation describing a single unified composite-item concept is superseded by the 2025 "Enhanced Composite Items" redesign splitting composites into Kit Items and Assembly Items — both old and new docs remain live, which could confuse a reader who only finds the older page.
- **Xero**: Any pre-August-2024 source describing Xero as having "no multi-location at all, period" describes **classic** Xero only. Xero Inventory Plus (Aug 2024, US-only, Growing/Established plans) has since added basic multi-location, FIFO, sales orders, fulfillment, and transfers — but only for US customers on qualifying plans. "DEAR Inventory" branding (a common Xero bolt-on) is superseded by **Cin7 Core** post-rebrand.
- **QuickBooks**: The "Item Variability" (size/color variant) feature in QBO Advanced is explicitly described in its own source as newly rolling out ("beginning to make their way into QBO Advanced") — treat as an emerging/partial-rollout feature, not stable/GA, as of this research.
