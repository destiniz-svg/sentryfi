# Industry mechanics: how the money actually works

*Last researched: 22 September 2026.*

This document exists so that Sentryfi — an accounting product that adjusts itself to the customer's industry — can be built from a correct model of each industry's money flow, not from a generic ledger with extra labels stuck on. For each industry below: how the money moves, what documents exist, the accounting treatment, the reports the owner actually needs, and what breaks when a generic ledger (one chart of accounts, one invoice type, one "revenue" bucket) is forced onto it. The final section gives the common spine every industry shares and a module/report matrix so the product can configure itself from one sign-up question ("what kind of business is this?").

Sources are cited inline. Where the accounting literature disagrees, is jurisdiction-specific, or genuinely uncertain, it's flagged as such — treat those as points to confirm with a qualified accountant before hard-coding behaviour, not as settled fact.

---

## Construction and contracting

### How the money actually works

A construction contract is rarely one invoice for one job. It starts with a **bill of quantities (BOQ)** — a priced breakdown of every item of work — or a lump-sum contract price, and it gets amended constantly by **variations** (change orders): scope the client added, removed, or changed mid-project, each needing its own price and approval before it's binding.

Money moves in stages, not on delivery:

- **Advance/mobilisation payment**: typically 10–15% of contract value paid up front so the contractor can set up site, buy materials, and mobilise plant. It is not free money — it's recovered progressively, usually as a percentage deduction from each subsequent progress payment, and it's commonly secured against a bank guarantee of equal value ([Quollnet](https://quollnet.com/article/advance_payment_construction_contracts), [Rising Kashmir](https://risingkashmir.com/business/retention-money-mobilisation-advances-and-bank-guarantees-the-working-capital-machinery-that-runs-every-construction-company-12515215)).
- **Progress claims / payment applications**: the contractor periodically claims for work done since the last claim, usually monthly. A quantity surveyor or engineer **certifies** the claim (fully, partially, or with deductions) before it becomes payable — the certified amount, not the claimed amount, is what actually gets invoiced and is owed.
- **Retention**: the client withholds a percentage (typically 5–10%) of each certified payment as security against defects. Half is usually released at practical completion, the other half at the end of the **defects liability period** ([Corpay](https://www.corpay.com/resources/blog/construction-retainage), [Levelset](https://www.levelset.com/blog/accounting-retention-receivable-payable/)). Retention held is a trade receivable — not yet invoiced, but the right to invoice it exists once the milestone is met, so it sits as a specific contract asset, tracked separately from ordinary debtors because it ages differently (months to years) and is not yet due ([CPDbox on IFRS 15 retention](https://www.cpdbox.com/question/ifrs-15-retention-construction-contracts/)).
- **Provisional sums**: an estimated allowance in the contract for work that can't be priced exactly yet (e.g. "allow $20,000 for groundworks, subject to survey"). These get replaced by actual priced variations once the real scope is known — they are placeholders in the BOQ, not real cost until instructed.
- **Liquidated damages (LDs)**: a pre-agreed daily/weekly penalty the client can deduct if the contractor finishes late, without having to prove actual loss. LDs are usually the client's *exclusive* remedy for delay (they can't also claim uncapped actual damages for the same delay), but defective work is a separate claim on top ([Pinsent Masons](https://www.pinsentmasons.com/out-law/guides/liquidated-damages), [Procore](https://www.procore.com/library/liquidated-damages-construction)). LDs are not part of the final account's contract price — they're deducted from what's owed, effectively an expense/contra-revenue event against the contractor.
- **Subcontractor liability**: the main contractor is liable to the client for the whole job even where subcontractors did the work, and often owes subcontractors payment regardless of whether the client has paid the main contractor yet (a "pay when paid" clause is unlawful in some jurisdictions, valid in others — jurisdiction-specific, flag for confirmation). This creates parallel AP/AR chains: what's owed to subbies is independent of what's certified from the client.
- **Plant hire**: equipment (owned or rented) is a cost that should be tracked against the specific contract/job, not lumped into general overheads, or job costing and cost-to-complete become meaningless.

### Revenue recognition (IFRS 15)

Construction contracts typically transfer control **over time** rather than at a point in time (the client controls the asset as it's built, or the work has no alternative use and the contractor has an enforceable right to payment for work done) — so revenue is recognised progressively using either:

- **Output method**: revenue tied to a directly observable measure of value delivered — certified work, milestones, surveys of work performed. Preferred when available because it maps directly to value.
- **Input method**: revenue based on cost incurred as a proportion of total expected cost, used when outputs aren't directly observable or would be costly to measure ([IFRS Community](https://ifrscommunity.com/forum/viewtopic.php?t=2187), [BDO IFRS 15 guide](https://www.bdo.global/getmedia/3bbbe2dd-2183-4a64-9df3-eb87a5c9895d/IFRS-AS-IP-IFRS-15-2024-25.pdf)).

Whichever method is chosen must be applied consistently to similar contracts ([IFRS.org — IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/)). This means the ledger needs, per contract: total contract value (as amended by variations), cost incurred to date, estimated cost to complete, and a chosen progress-measurement method — none of which a generic sales-invoice ledger tracks.

### Work in progress and cost-to-complete

**WIP** on a construction job is the accumulated cost incurred on a contract that hasn't yet been recognised as cost of sales, matched against revenue recognised on the same percentage-of-completion basis. **Cost-to-complete** is the estimate of what's left to spend — without it, the business cannot tell whether a job is actually profitable or heading for a loss until it's too late.

### What goes wrong with a generic ledger

- One "sales invoice" per job hides the certified-vs-claimed gap — the owner thinks they've been paid for what they claimed, not what was certified.
- Retention held gets buried inside ordinary debtors, so it either looks like bad debt (chased too early) or gets forgotten entirely (never chased at release date).
- No job-level cost tracking means plant hire, subcontractor costs, and materials all land in one undifferentiated "cost of sales" — the owner can't see which of 5 concurrent jobs is losing money.
- No distinction between advance payment and revenue means the mobilisation payment gets booked as income the day it lands, overstating profit and understating the liability to "earn it back" through the job.
- No variations tracking means scope creep is invisible until the final account, when it's too late to negotiate.
- LDs and defects costs land as generic "other expenses" instead of being tied to the job and the retention that should offset them.

A worked shape of the problem: a contractor claims $100,000 for the month, the QS certifies $90,000 (a $10,000 dispute carried forward), 10% retention ($9,000) is withheld from the certified amount, and 15% of the certified amount ($13,500) is deducted as mobilisation-advance recovery. The contractor is actually paid $67,500 against a $100,000 claim. A ledger that only records "invoiced $100,000, received $67,500" as an unexplained variance gives the owner no way to see that the gap is retention (an asset due later) plus advance recovery (a liability being worked off) plus a genuine dispute (at risk) — three very different things bundled into one confusing number.

### What this means for the ledger

- **Dimensions**: contract/job, cost code (labour, materials, plant, subcontractor), retention percentage and release date, contract-to-date cost, estimated cost-to-complete, variation number.
- **Documents**: BOQ, contract (with variations log), progress claim, certified payment certificate, retention statement, defects liability schedule, subcontractor invoices, plant hire agreements/logs.
- **Reports**: job profitability (contract value vs cost-to-complete vs revenue recognised), WIP schedule, retention ledger (held and due-for-release, by job), certified-vs-claimed variance, subcontractor liability aging, cash flow forecast incorporating retention release dates.

---

## Real estate

### How the money actually works

Real estate businesses sit on either side of a line that matters enormously for accounting: are they **developing/trading** property (building or buying to sell) or **investing** (holding to earn rent or capital appreciation)? Under IAS 40, property held to earn rentals or for capital appreciation is investment property (fair value or cost model); property intended for sale in the ordinary course of business, or under construction for such sale, is inventory under IAS 2, not IAS 40 ([IAS Plus — IAS 40](https://www.iasplus.com/en/standards/ias/ias40), [PwC — Applying IFRS for real estate](https://viewpoint.pwc.com/content/pwc-madison/ditaroot/gx/en/pwc/industry/industry_INT/industry_INT/real_estate__1_INT/Applying-IFRS-for-the-real-est/2_Acquisition_or_construction_of_real_estate/2_2_0_Definition_and_classification/2_2_1_Principles.html)). A mere change of intention isn't enough to reclassify a property between the two — there needs to be evidence of a change in use ([RSM — Investment property issues](https://www.rsm.global/insights/ifrs-news/investment-property-issues-encountered-practise)).

**Off-plan sales**: units sold before (or during) construction. Deposits collected up front are a liability (a contract liability / advance from customer), not revenue, until the performance obligation is satisfied ([Taxmann](https://www.taxmann.com/post/blog/revenue-recognition-in-real-estate)). Under IFRS 15 (which replaced IAS 11/IFRIC 15), the key question is whether the sale transfers control over time or at a point in time. If the developer's asset has no alternative use and there's an enforceable right to payment for work done, revenue is recognised over time — as percentage of construction completion — rather than only when the unit is handed over ([IFRS.org agenda decision on real estate](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/agenda-decisions/2018/ifrs-15-revenue-recognition-in-a-real-estate-contract-mar-18.pdf), [Grant Thornton](https://www.grantthornton.sa/en/insights/articles-and-publications/get-ready-for-ifrs-15-rec/)). This is a genuine judgement call depending on contract law in the jurisdiction (does the buyer have an interest in the specific unit as it's built, or only on completion?) — flag for confirmation per market.

**Rental income and lease incentives**: rent is usually recognised on a straight-line basis over the lease term, even if the cash pattern is different (e.g. a rent-free period at the start, or stepped rent). A lease incentive (a rent-free period, a cash contribution to fit-out) is spread over the lease term as a reduction to rental income, not recognised entirely in the period it's given.

**Service charges collected from tenants**: money collected from tenants to cover shared building costs (cleaning, security, utilities of common areas) is generally pass-through — collected and spent on the tenants' behalf, not the landlord's own revenue and cost. Mixing it into ordinary rental income overstates both revenue and expenses and hides the reconciliation the landlord owes tenants at year end.

**Agent commissions**: a real estate agent's commission on a sale or letting is separate income, usually invoiced at completion/exchange, and is often held partly in a client trust account until the deal completes — a regulatory requirement in many jurisdictions, and something a generic ledger with no trust-account concept can't represent safely.

### What goes wrong with a generic ledger

- Deposits from off-plan buyers get booked as revenue the day they're received, overstating profit and creating a tax and dividend problem when the sale later falls through.
- No inventory-vs-investment-property distinction means a held-for-rent building depreciates on the P&L (IAS 40 cost model or none at all under fair value) while a held-for-sale building sits as inventory at cost — get this wrong and either profit is misstated or the balance sheet shows the wrong asset class entirely.
- Service charge pass-throughs inflate the landlord's own revenue and expense lines, distorting margin.
- No lease-incentive spreading means income is lumpy and doesn't reflect the real economics of a multi-year lease.

A practical note for the product: most small and mid-sized real estate businesses in Sentryfi's likely market run *both* a development book and an investment book side by side (build some units to sell, keep others to let) — the ledger needs the property/unit as the unit of classification, not the company as a whole, because the same legal entity can hold both IAS 40 investment property and IAS 2 inventory at once.

### What this means for the ledger

- **Dimensions**: property/unit, property classification (investment vs inventory/development), buyer/tenant, lease term, service-charge pool (separate from landlord P&L).
- **Documents**: sale and purchase agreement, off-plan payment schedule, lease agreement, service charge budget and reconciliation, agent commission agreement.
- **Reports**: development cost-to-complete and percentage sold, deferred revenue (deposits held) schedule, rent roll, service charge reconciliation by tenant, investment property valuation register.

---

## Engineering and professional services

### How the money actually works

Three billing models coexist, often within the same firm:

- **Time and materials (T&M)**: bill actual hours at agreed rates, plus recoverable costs.
- **Fixed fee**: one price for defined scope, regardless of hours actually spent — the firm bears the risk of overrun.
- **Milestone billing**: fixed amounts billed as agreed stages are reached, common for larger engineering projects.

**Unbilled revenue (WIP)**: work performed but not yet invoiced. It's a contract asset — value the firm has earned but not yet billed, sitting on the balance sheet, distinct from a debtor (already invoiced, awaiting payment) ([CentSight — Unbilled revenue](https://centsight.com/blog/unbilled-revenue)). Firms typically lose real revenue to WIP that's never billed — a widely-cited industry estimate puts this at up to 5% of revenue, and WIP aged past 60 days sees materially lower realisation ([CentSight — professional services finance](https://centsight.com/professional-services-finance)).

**Retainers**: a client pays up front for a block of future work or availability. This is deferred revenue (a liability) until the work is actually done or the availability period lapses — not income on receipt.

**Recoverable disbursements vs own costs**: costs paid on the client's behalf and passed straight through (travel, third-party fees, printing) are recoverable disbursements — not the firm's own expense, and rebilling them at cost is not revenue in the ordinary sense. The firm's own costs (staff time, office overhead) are absorbed into the fee.

**Utilisation and realisation rates**: two different, commonly confused metrics.
- *Utilisation* = proportion of available staff time spent on billable work (industry benchmark roughly 70–75% for working-level staff, lower for senior/managerial roles) ([Evergreen Accounting](https://www.evergreenaccounting.com.au/professional-services-profitability-wip-utilisation-2/)).
- *Realisation* = proportion of billable hours actually invoiced/collected at standard rates (average firms bill only around 90–95% of hours delivered, before write-offs) ([Magnetic](https://www.magnetic.app/blog/utilization-vs-realization-rate)).
A firm can have excellent utilisation and terrible realisation (everyone's busy, but discounts and write-offs eat the value) — the two need to be tracked and reported separately.

### What goes wrong with a generic ledger

- No unbilled-revenue tracking means the firm has no idea how much value is sitting undelivered to invoice — cash flow surprises follow.
- Disbursements booked as ordinary expense/income inflate both revenue and cost lines and distort margin.
- Fixed-fee and milestone jobs get billed like T&M (as work happens) with no comparison to the agreed scope, hiding overruns until the job is finished and already unprofitable.
- No utilisation/realisation reporting means partners manage by gut feel instead of the two numbers that actually predict profitability.

### What this means for the ledger

- **Dimensions**: client/matter or project, billing model (T&M / fixed fee / milestone), staff member and chargeable rate, disbursement vs fee cost, retainer balance.
- **Documents**: engagement letter/contract, timesheets, disbursement receipts, milestone schedule, retainer agreement.
- **Reports**: unbilled WIP aging, utilisation by staff, realisation by matter, fixed-fee job cost vs budget, retainer balance and burn-down.

---

## Travel and tourism

### How the money actually works

The single most common accounting error in this sector is **principal vs agent** (gross vs net revenue) under IFRS 15. The test is control: if the business controls the good or service (flight, room, tour) before it's transferred to the customer, it's the **principal** and books the full sale as revenue with the supplier cost as an expense (gross). If it merely arranges for another party to provide it, without taking control, it's an **agent** and books only its commission/fee as revenue (net) — the rest is never the agent's revenue at all, even though the cash flowed through its bank account ([IFRS Community](https://ifrscommunity.com/knowledge-base/principal-vs-agent-revenue-gross-vs-net/), [CPDbox](https://www.cpdbox.com/ifrs-revenue-principal-agent/)). A travel agent that buys airline seats in advance and resells them may be principal (gross); one that simply books a client onto a hotel or tour on the supplier's behalf is normally agent (net), even while the full payment passes through the agent's account. Booking the full sale price as revenue when only a commission was earned is the classic mistake, and it badly overstates both revenue and cost of sales.

**Supplier deposits and customer deposits held** are different things and must not be netted against each other:
- Money the travel business pays suppliers up front (hotels, airlines) to secure bookings is a prepayment/asset.
- Money collected from customers ahead of travel is a liability (deferred/contract liability) until the trip is delivered or the cancellation window passes.

**Cancellations and refunds**: need a clear liability for refunds owed, and — where cancellation fees are non-refundable — a mechanism to recognise that portion as revenue (or breakage) only once the likelihood of a refund claim becomes remote, similar in principle to gift-voucher breakage treatment below.

**Tour operator margin schemes (TOMS)**: some jurisdictions (notably the EU/UK) have a specific VAT scheme for tour operators that buy in and resell travel services, taxing only the margin rather than the full sale — this is a real regime, not general accounting practice, and is jurisdiction-specific; confirm applicability before building it in as a default.

### Maldives specifics

- **Resort / guesthouse / liveaboard** differences matter for tax rates and structure: resorts operate on private islands (all-inclusive economics, service charge typically 10% on the bill); guesthouses are local-island small properties with lower guest-night charges; liveaboards (safari boats) have their own itinerant, package-based revenue pattern.
- **Tourism GST (TGST)**: 17% on tourism-sector supplies, effective from 1 July 2025 (up from 16%) ([Travel Trade Maldives](https://www.traveltrademaldives.com/maldives-increases-tourism-taxes-with-tgst-to-17/), [IM Maldives](https://immaldives.com/travel-guide/costs/tax-and-fees/)).
- **Green tax**: charged per guest per night, currently USD 12/night at resorts and larger establishments, USD 6/night at guesthouses and smaller properties (under 50 rooms) — doubled from the prior USD 6 / USD 3 rates in a 2025 increase. Children under 2 at check-in are exempt ([Island Resort Lab](https://islandresortlab.com/maldives-green-tax-2026-rates-children-and-how-to-calculate-it/), [Lets Go Maldives](https://letsgomaldives.com/blogs/maldives-tax-guide-2025-green-tax-gst-updates-you-should-know/)).
- Service charge (commonly 10%) is a separate line from GST and green tax and is typically distributed to staff — it should not be treated as the business's own revenue even though it appears on the guest bill.

These are figures as researched in September 2026; tax rates in the Maldives have changed materially in the last two years and should be re-verified against the Maldives Inland Revenue Authority (MIRA) before being hard-coded.

### What goes wrong with a generic ledger

- Booking gross sale value as revenue when acting as agent — the number one error, and it's a material misstatement, not a cosmetic one.
- Netting customer deposits held against supplier deposits paid, hiding the real liability to guests if a trip needs to be refunded.
- No guest-night tracking means green tax and TGST can't be calculated or reconciled against what was actually collected from guests.
- Commission income lumped in with gross booking value in reporting, making the business look far larger (and less profitable per booking) than it is.

### What this means for the ledger

- **Dimensions**: booking/reservation, principal-or-agent flag per booking line, supplier, guest-nights, property type (resort/guesthouse/liveaboard where relevant), tax type (TGST, green tax, service charge) tracked separately.
- **Documents**: booking confirmation, supplier invoice/voucher, customer payment schedule, cancellation/refund policy record, guest-night log.
- **Reports**: revenue by principal vs agent split, deposits held (customer liability) vs deposits paid (supplier asset), green tax and TGST payable by period, commission income by supplier, cancellation/refund exposure.

---

## Freelance and one-person businesses

### How the money actually works

Freelancers and sole traders operate the simplest and also the most error-prone version of the ledger, because there's no organisational separation between the person and the business.

**Cash vs accrual**: many very small businesses report on a cash basis (income when received, expense when paid) because it's simpler and matches how they actually experience money — but this can misstate the picture in any month with lumpy invoicing, and most tax authorities eventually expect accrual-consistent records above a turnover threshold.

**Drawings vs salary**: a sole trader/freelancer withdrawing money from the business for personal use is *not* paying themselves a salary — it's drawings, a reduction of owner's equity, not a business expense, and it doesn't reduce taxable profit. This is one of the most common misunderstandings in this segment, and getting it wrong overstates or understates tax liability directly.

**Mixing personal and business money**: extremely common in practice — a business card used for a personal purchase, a personal account receiving a client payment. The right software behaviour is not to prevent this (it will happen regardless) but to make it easy to flag and reclassify a transaction as personal/drawings after the fact, and to keep a running drawings account rather than forcing perfect separation up front.

**Simplified records**: many jurisdictions offer simplified expense categories or flat-rate schemes for very small businesses — the ledger should support a lighter chart of accounts here, not the same 200-line chart used by a construction firm.

**Quarterly tax habits**: freelancers with no PAYE/withholding need to set aside tax proactively, usually quarterly, because nothing is deducted at source — the product's most useful single feature for this segment may be a running "tax set-aside" estimate, not a full P&L.

### What goes wrong with a generic ledger

- Drawings get booked as an expense, understating taxable profit and misleading the owner about real business performance.
- No easy reclassification path for mixed personal/business transactions means the owner either doesn't record them at all (understating expenses) or leaves the books permanently messy.
- A full double-entry chart of accounts, presented with no simplification, is intimidating enough that many freelancers simply stop using the software.
- No tax set-aside visibility means the freelancer spends money that's already owed to the tax authority.

### What this means for the ledger

- **Dimensions**: drawings/equity account (separate from expenses), personal-vs-business flag per transaction, simplified expense categories.
- **Documents**: bank statement (often the only real source document), occasional invoices, receipts for larger expenses.
- **Reports**: simple profit summary, drawings to date, estimated tax set-aside, cash position.

---

## Retail

### How the money actually works

**Daily takings**: a till doesn't produce one transaction, it produces hundreds, and posting them individually is usually pointless — the standard practice is one daily (or per-shift) summary journal per till: total sales by tax rate, split by payment method (cash, card), less discounts and returns ([Patriot Software](https://www.patriotsoftware.com/blog/accounting/credit-card-sales/)).

**Cash float and banking**: the float (starting cash in the till) is not revenue and must be excluded from the day's takings; cash actually banked needs reconciling against what the till says was taken in cash, and the difference (over/short) is itself a small but real number worth tracking, not silently absorbing.

**Card settlement timing and fees**: card sales rarely settle to the bank the same day, and they settle net of the processor's fee — so a $100 card sale might show as $97 landing in the bank two days later. Booking the sale gross (debit cash/clearing for $100, credit sales $100) and separately expensing the $3 fee when the statement lands keeps the sales figure honest and the fee visible as a real cost of accepting cards ([AccountingCapital](https://www.accountingcapital.com/journal-entries/journal-entry-for-credit-card-sales/)). A card clearing/suspense account between the sale and the bank deposit is the standard way to bridge the timing gap.

**Discounts and promotions**: reduce revenue at the point of sale, not recorded as marketing expense — a $10 discount on a $50 item is $40 of revenue, not $50 of revenue and $10 of expense (this affects reported gross margin meaningfully if done wrong).

**Returns**: need to reverse both the revenue and the cost of goods sold (put the stock back), and be tracked separately from gross sales so the owner can see the return rate by product.

**Shrinkage and stock counts**: physical stock will not match the book stock — theft, damage, and errors cause shrinkage. Periodic stock counts reconcile the two, and the gap is written off as a cost, not ignored.

**Gross margin by product**: retail lives or dies on margin by SKU/category, not overall revenue — a generic ledger with one "sales" account can't answer "which product lines actually make money."

**Gift vouchers / deferred revenue**: money received for a gift voucher is a liability, not revenue, until redeemed. Where a business can reasonably estimate that some vouchers will never be redeemed (breakage), IFRS 15 requires that expected-breakage amount to be recognised as revenue *in proportion to the pattern of actual redemptions* — not all at once on sale, and not automatically assumed without evidence. If there isn't enough evidence to estimate breakage, it's only recognised once the chance of redemption becomes remote ([CPDbox — breakage](https://www.cpdbox.com/ifrs-revenue-from-breakage/), [BDO](https://www.bdo.co.uk/en-gb/insights/business-edge/business-edge-2017/ifrs-15-in-the-spotlight)).

### What goes wrong with a generic ledger

- Posting every till transaction individually — technically correct, practically unusable at volume, and hides the daily reconciliation that actually matters (till total vs cash banked vs card settled).
- The float gets counted as part of the day's sales, overstating revenue.
- Card fees get missed entirely (netted against sales without anyone noticing), so the true cost of accepting cards is invisible.
- Gift vouchers booked as revenue on sale, both overstating current revenue and creating a real liability the business forgets it owes.
- No product-level margin means poor-margin lines keep getting restocked because the owner only ever sees total revenue.

### What this means for the ledger

- **Dimensions**: till/location, payment method, product/SKU or category, discount type, gift voucher liability account.
- **Documents**: daily Z-report/till summary, card settlement statement, stock count sheet, supplier invoices (for cost/margin).
- **Reports**: daily takings reconciliation (till vs cash banked vs card settled), gross margin by product/category, gift voucher liability outstanding, shrinkage from stock counts, discount/promotion impact on margin.

---

## Wholesale and distribution

### How the money actually works

**Price lists and customer-specific pricing**: the same product can have several valid prices depending on the customer's tier, contract, or volume commitment — a single fixed sale price per product doesn't reflect reality.

**Credit limits and terms**: B2B customers buy on account with agreed payment terms (e.g. net 30/60) and a credit limit; orders above the limit or from overdue accounts should be flagged before shipping, not discovered after the debt is unrecoverable.

**Sales returns**: as with retail, need to reverse both revenue and COGS, and are tracked by reason (damaged, wrong item, quality) because return patterns flag supplier or fulfilment problems.

**Rebates and settlement discounts**: rebates (volume-based retrospective discounts, often paid quarterly or annually) and settlement discounts (a discount for paying early) are contra-revenue, and — importantly — should be *accrued as the qualifying sales happen*, not only recognised when the rebate claim or invoice actually arrives months later ([Strivex](https://strivex.co.uk/wholesale-distribution/)). Getting this wrong overstates revenue and profit in the period, then understates it later when the rebate is finally paid.

**Consignment stock**: goods held at a customer's or reseller's premises while ownership stays with the supplier until sold or consumed. It is *not* a sale on delivery — the consignor keeps the stock as their own inventory asset (often tagged by location) and only recognises revenue when the consignee actually sells or uses it ([Finale Inventory](https://www.finaleinventory.com/blog/accounting-and-inventory-software/consignment-inventory-accounting/), [Wikipedia — Consignment](https://en.wikipedia.org/wiki/Consignment)).

**Backorders**: an order accepted for stock not currently available — this is a commitment, not a sale; it shouldn't hit revenue or reduce available stock until it's actually fulfilled and shipped.

**Dropshipping**: the wholesaler never holds the stock — a supplier ships directly to the end customer. Here the wholesaler is a principal or agent depending on who controls the goods before transfer (same test as travel, above) — usually principal if they take title and bear the risk even briefly, agent if they're merely arranging supply.

**Landed cost**: the true cost of imported goods includes freight, duty, insurance, and handling, not just the supplier's invoice price — using invoice price alone overstates margin, sometimes substantially, on imported lines.

### What goes wrong with a generic ledger

- Fixed pricing with manual overrides for customer deals leads to unrecorded, unreconciled discounting that erodes margin invisibly.
- Rebates recognised only on payment (not accrued against the sales that earned them) misstates every interim period's profit.
- Consignment stock either sits in the consignor's inventory forever unsold in the system (never billed) or gets treated as sold on delivery (revenue recognised too early).
- Landed cost ignored means imported product margin looks far healthier than it is, until a bad quarter of freight costs exposes the truth.

### What this means for the ledger

- **Dimensions**: customer price tier/contract, credit limit and terms, rebate scheme, consignment location, landed cost components (freight/duty/insurance).
- **Documents**: price list, sales contract/rebate agreement, purchase order, consignment agreement, import/customs documentation.
- **Reports**: AR aging against credit limits, rebate accrual vs claims paid, consignment stock by location (still-owned vs sold), landed cost margin by product, backorder/fulfilment status.

---

## Equipment rental / plant hire

### How the money actually works

**Rate cards**: pricing by hour, day, week, or month per asset (or asset category), often with different rates for short vs long hire — the invoice needs to reflect the actual hire period against the applicable rate, not a flat "rental income" line.

**Utilisation**: the percentage of available time (or available hours) an asset is actually earning rent — the single most important number in this business, because an idle machine still costs money (finance, insurance, storage) without earning any.

**Maintenance and fuel costs against a machine**: servicing, repairs, and fuel need to be tracked per asset, not pooled, so the business can see which machines are cost sinks and price or retire them accordingly.

**Depreciation by hours vs time**: equipment with a meter (excavators, generators) is often more accurately depreciated using a units-of-production method tied to actual hours used, rather than straight-line time-based depreciation — a heavily-used asset wears out faster than an idle one, and units-of-production reflects that ([EZO — equipment depreciation](https://ezo.io/ezrentout/blog/equipment-depreciation-management/), [Rentman](https://rentman.io/blog/rental-equipment-depreciaition)). Straight-line is simpler and still common; the choice should be a deliberate one per asset class, not a default applied blindly.

**Damage recharges**: damage found at return is billed back to the hirer, separate from the rental fee itself, and typically offset first against any deposit held.

**Deposits**: a deposit taken at the start of a hire is a liability (refundable) until the equipment is returned undamaged, not rental income.

### What goes wrong with a generic ledger

- Rental income booked as one flat line with no asset dimension makes it impossible to see which machines are actually profitable.
- No utilisation tracking means idle assets keep incurring finance and insurance cost invisibly against no offsetting revenue.
- Maintenance costs pooled into general overhead instead of tagged to the asset hide which machines are becoming money pits.
- Deposits taken booked as revenue overstate income and create a liability the business forgets it owes when equipment is returned undamaged.
- Time-based depreciation applied uniformly to heavily-used and rarely-used assets misstates the real cost of ownership per asset.

### What this means for the ledger

- **Dimensions**: asset/machine, rate card and hire period, utilisation (hours/days available vs hired), deposit liability, damage recharge.
- **Documents**: hire agreement, rate card, return/condition report, maintenance log, deposit receipt.
- **Reports**: utilisation by asset, profitability by asset (rental income less maintenance/fuel/depreciation), deposits held, damage recharge income, fleet-wide asset age and depreciation schedule.

---

## What differs, and what is the same

### The common spine

Every one of these businesses shares the same underlying spine, and it's what should stay identical across all of Sentryfi's industry configurations:

1. **The general ledger** — double-entry, chart of accounts, trial balance, P&L, balance sheet. The mechanics of debits and credits don't change per industry.
2. **Tax** — sales tax/VAT/GST registration, filing, and payment. The *rates and rules* differ (17% TGST for Maldives tourism vs standard GST elsewhere, TOMS for EU tour operators), but the underlying tax-collection-and-remittance mechanism is the same shape everywhere.
3. **Bank** — every business reconciles a bank feed against recorded transactions. This is identical machinery regardless of industry.
4. **Core documents** — every business has a version of "sale," "invoice," "bill," "receipt," and "payment," even when the label differs (progress claim, booking, hire agreement).

### What's genuinely different

What differs is not the ledger mechanics but (a) **when revenue is recognised relative to cash**, (b) **what extra dimensions a transaction needs to carry** (job, asset, guest-night, booking-leg), (c) **what liabilities exist that a generic ledger doesn't model** (retention, customer deposits, gift voucher liability, consignment stock), and (d) **what reports the owner actually needs to run the business day to day**. Getting the recognition timing and the liability modelling right is the hard part — the reports mostly follow once the underlying data is captured correctly.

### Module and report matrix

| Industry | Distinguishing modules needed | Key reports |
|---|---|---|
| Construction & contracting | Job/contract costing, variations log, retention ledger, subcontractor AP, plant hire cost tracking, percentage-of-completion revenue engine | Job profitability, WIP schedule, retention held/due, certified-vs-claimed variance, subcontractor aging |
| Real estate | Property classification (investment vs inventory), off-plan payment schedule, lease/rent roll, service charge pool | Deferred revenue (deposits), rent roll, service charge reconciliation, development cost-to-complete |
| Engineering & professional services | Time tracking, billing-model flag (T&M/fixed/milestone), unbilled WIP, retainer balance, disbursement tracking | WIP aging, utilisation, realisation, fixed-fee job cost vs budget |
| Travel & tourism | Principal-vs-agent flag per booking, supplier deposit tracking, customer deposit liability, guest-night log, tax-type split (TGST/green tax/service charge) | Gross vs net revenue split, deposits held vs paid, tax payable by period, commission income |
| Freelance / one-person | Drawings/equity account, personal-vs-business flag, simplified categories, tax set-aside estimator | Simple P&L, drawings to date, tax set-aside, cash position |
| Retail | Till/daily-takings summary posting, card clearing account, gift voucher liability, product/SKU margin, stock count reconciliation | Daily takings reconciliation, gross margin by product, voucher liability, shrinkage |
| Wholesale & distribution | Customer price tiers, credit limit checks, rebate accrual, consignment stock by location, landed cost | AR aging vs credit limits, rebate accrual vs claims, consignment stock status, landed-cost margin |
| Equipment rental / plant hire | Asset register, rate cards, utilisation tracking, per-asset maintenance cost, deposit liability, units-of-production depreciation | Utilisation by asset, profitability by asset, deposits held, damage recharges |

At sign-up, one question — "what kind of business is this?" — should be enough to select the right combination of rows from this table: which extra dimensions the transaction form needs, which liability accounts get created automatically, and which reports appear by default. The generic spine (ledger, tax, bank, core documents) stays on underneath every configuration.
