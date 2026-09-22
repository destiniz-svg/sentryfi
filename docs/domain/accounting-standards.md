# Accounting standards reference for Sentryfi

Last researched: 22 September 2026.

This is a durable reference for building Sentryfi, a double-entry accounting product for small businesses. It exists so that ledger, invoicing, inventory, fixed-asset, lease, and close-process features are built against the actual rules a small business's books must satisfy, not against guesswork. It draws on IFRS ([ifrs.org](https://www.ifrs.org)), the IFRS for SMEs Standard, and technical summaries from the major accounting networks. Most small businesses that are not full-IFRS reporters follow "IFRS for SMEs" or a local equivalent (e.g. UK FRS 102) that is closely modelled on it; where IFRS for SMEs differs materially from full IFRS, that is called out explicitly. Every section closes with "what this means for the ledger" — the concrete build implication for Sentryfi.

Where a rule is genuinely uncertain, jurisdiction-dependent, or still under IASB review, this document says so rather than guessing.

---

## 1. IAS 1 / IFRS for SMEs — presentation of financial statements

A complete set of financial statements is: a statement of financial position (balance sheet), a statement of profit or loss (and other comprehensive income, if any), a statement of changes in equity, a statement of cash flows, and notes. IFRS for SMEs allows a combined statement of income and retained earnings when the only changes to equity are profit/loss, dividends, and prior-period error corrections — a common shortcut for small companies ([IFRS for SMEs Standard](https://www.ifrs.org/issued-standards/ifrs-for-smes/)).

Key presentation rules:
- **Comparatives**: at least one prior period for every statement and note, unless this is the entity's first period.
- **Going concern**: management must assess the entity's ability to continue at least 12 months from the reporting date. If there is material uncertainty, it must be disclosed; if the entity is not a going concern, a different basis of preparation is used entirely.
- **Offsetting**: assets and liabilities, income and expenses, are not offset against each other unless a standard specifically permits or requires it (e.g. netting a loss provision against the related asset). A debtor and creditor balance with the same counterparty are not netted on the face of the statements just because they are with the same party, unless there is a legal right of set-off and the entity intends to settle net.
- Consistency of presentation and classification from one period to the next, unless a change is justified.

The **statement of changes in equity** shows, for each equity component (share capital, retained earnings, any revaluation surplus), the opening balance, profit or loss for the period, any other comprehensive income, transactions with owners (dividends declared, capital introduced or withdrawn), and the closing balance. For a small owner-managed business with only share capital and retained earnings and no OCI items, this collapses to a short reconciliation — which is exactly why IFRS for SMEs allows combining it with the income statement into a single statement when the only movements are profit/loss, dividends, and prior-period corrections.

A small business's statement of financial position is usually presented in order of liquidity or as current/non-current, whichever is more relevant to understanding the business — a current/non-current split (current = expected to be realised or settled within twelve months, or within the operating cycle if longer) is the norm for a trading SME and is what most bank/lender templates expect. Materiality also governs how much detail appears on the face of the statements versus in the notes: immaterial items can be aggregated, but the aggregation itself must not obscure something a reader would need to make decisions.

**What this means for the ledger**: Sentryfi must be able to generate, at minimum, a balance sheet, profit and loss, a statement of changes in equity (or combined P&L/retained-earnings statement), and a cash flow statement, each with a prior-period comparative column once two periods of data exist. The balance sheet must support a current/non-current split driven by each account's (or, for receivables/payables/loans, each balance's) expected settlement horizon, not a fixed account-type mapping alone — a loan with eighteen months left has a current portion and a non-current portion. Reports must never net a debit and credit balance from different accounts by default — netting must be an explicit, auditable choice (e.g. AR/AP with the same contact plus a documented legal right of set-off). The system should track and, at least annually, prompt for a going-concern assessment flag rather than silently assuming one.

---

## 2. IAS 2 Inventories

Inventory is measured at the **lower of cost and net realisable value (NRV)**.

**Cost** comprises:
- Cost of purchase: purchase price, import duties, non-recoverable taxes, and transport/handling directly attributable to acquisition, less trade discounts and rebates.
- Cost of conversion: direct labour and a systematic allocation of fixed and variable production overheads.
- Other costs only to the extent incurred in bringing inventory to its present location and condition (e.g. specific design costs for a customer).

**Excluded from cost** (expensed as incurred): abnormal waste, storage costs (unless part of the production process before a further stage), administrative overheads unrelated to production, and selling costs ([IAS 2 summary, IFRS.org](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)).

**Cost formula**: FIFO or weighted average cost are both permitted; the same formula must be used for all inventories of similar nature and use. **LIFO is not permitted under IFRS** (it remains permitted under US GAAP, which is a genuine and frequently-tripped-over divergence).

**NRV** = estimated selling price in the ordinary course of business, less estimated costs of completion and estimated costs to sell. Inventory is written down to NRV item by item (or by similar group) when NRV falls below cost, e.g. through damage, obsolescence, or a fall in selling price; the write-down is reversed (up to the original cost) if the circumstances that caused it no longer apply.

**A cost that arrives late** (e.g. a freight invoice or customs bill received after the goods were already booked and possibly sold) is still capitalised into the cost of that inventory if it relates to bringing those specific goods to their location/condition and the inventory is still on hand; if the related inventory has already been sold, the late cost is recognised immediately as an adjustment to cost of sales for the period, not retrospectively restated (unless it is a correction of a prior-period error under IAS 8, which has a different, disclosed treatment).

*Worked example*: a business imports 100 units at £10 each (£1,000). Three weeks later a customs duty bill of £150 arrives, after 40 of the units have already been sold. £90 (60/100 × £150) is added to the remaining 60 units' carrying cost (now £18.50/unit); £60 (40/100 × £150) is posted straight to cost of sales for the period, because it relates to units no longer on hand.

**What this means for the ledger**: Sentryfi must let a business declare one costing method (FIFO or weighted average) per inventory category and apply it consistently — no per-transaction choice. Landed costs (freight, duty) must be allocable to inventory items received, not defaulted to expense. The system needs an NRV/write-down workflow: a manual or rule-based check comparing carrying cost to current expected selling price, producing a journal entry to an inventory write-down/impairment account, with reversal support. A late-arriving purchase cost must route to cost-of-sales automatically if the linked inventory has already been sold (tracked via a cost layer or lot reference), and to inventory cost if still on hand.

---

## 3. IAS 16 Property, plant and equipment

**Initial cost** = purchase price (after trade discounts/rebates) + directly attributable costs of bringing the asset to the location and condition for its intended use (delivery, installation, professional fees) + the initial estimate of dismantling/restoration costs where an obligation exists.

**Subsequent costs**: day-to-day servicing and repairs are expensed. Costs that meet the recognition criteria (probable future economic benefit, cost reliably measurable) — e.g. a major overhaul, a replaced component — are capitalised, and any carrying amount of the replaced part is derecognised.

**Depreciation**: systematic allocation of depreciable amount (cost less residual value) over useful life, using a method that reflects the pattern of consumption of benefits — straight-line, reducing-balance, or units-of-production are all acceptable. Land is not depreciated (unless it has a limited useful life, e.g. a quarry). Useful life and residual value are estimates and must be reviewed at least annually; a change is a change in accounting estimate applied prospectively, not restated.

**Component accounting**: where an asset has significant parts with different useful lives (a building's roof versus its structure, a vehicle's engine versus its body), each significant component is depreciated separately. This matters for an SME mainly with buildings and specialist plant; for most small-business assets (a laptop, office furniture, a single delivery van) one useful life is a reasonable simplification.

**Derecognition**: on disposal (or when no future economic benefits are expected), the asset is removed from the books and a gain or loss is recognised in profit or loss equal to the difference between net disposal proceeds and the carrying amount at that date. Gains are not classified as revenue.

**Revaluation model** is permitted as an alternative to cost, with revaluations kept sufficiently up to date and increases taken to other comprehensive income (a revaluation surplus in equity) unless reversing a prior downward revaluation of the same asset, in which case the increase goes to profit or loss to that extent. **Most SMEs use the cost model** because revaluation requires recurring independent valuations, adds OCI/equity complexity, and rarely serves a small business's reporting audience (owners, a bank, a tax authority) the way it might for a listed company ([IAS 16 summary, IFRS.org](https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/)).

*Worked example (disposal)*: a van cost £20,000, has £14,000 of accumulated depreciation (carrying amount £6,000), and is sold for £7,500. The business derecognises £20,000 cost and £14,000 accumulated depreciation, records £7,500 cash received, and posts a £1,500 gain to a non-revenue "gain/loss on disposal of assets" P&L line — never to sales revenue.

**What this means for the ledger**: a fixed asset record needs cost, acquisition date, useful life (or rate), depreciation method, and residual value as first-class fields, with a depreciation schedule generated automatically each period and posted as a journal entry (debit depreciation expense, credit accumulated depreciation — never credit the asset cost account directly). Disposal must be a guided workflow that removes cost and accumulated depreciation, records proceeds, and posts the resulting gain/loss to a non-revenue P&L line. Sentryfi should default every asset to the cost model; revaluation, if offered at all, should be a distinct, clearly-labelled path that is off by default. Useful-life and residual-value changes should be editable mid-life without requiring prior periods to be reopened, since IAS 16 treats them as prospective estimate changes.

---

## 4. IFRS 15 Revenue from contracts with customers

The **five-step model**: (1) identify the contract, (2) identify the performance obligations (distinct promises to transfer goods or services), (3) determine the transaction price, (4) allocate the transaction price to each performance obligation based on relative standalone selling price, (5) recognise revenue as (or when) each performance obligation is satisfied ([IFRS 15 five-step model](https://ifrsbuddy.com/learn/en/ifrs-15-five-step-model), [CPDbox](https://www.cpdbox.com/5-step-model-revenue-recognition-ifrs-15-journal-entries-example/)).

**Over time vs point in time**: revenue is recognised **over time** if any one of these holds — the customer simultaneously receives and consumes the benefit as the entity performs; the entity's performance creates or enhances an asset the customer controls as it is created; or the asset has no alternative use to the entity and there is an enforceable right to payment for performance completed to date. Otherwise revenue is recognised at the **point in time** control transfers (delivery, acceptance, title passing). This is the crucial distinction for **construction and engineering contracts**, which almost always meet one of the over-time criteria (customer-controlled land/asset, no alternative use, enforceable payment right) and so recognise revenue progressively rather than only on completion.

**Measuring progress over time**: **output methods** (surveys of performance completed, units delivered, milestones achieved) directly measure value transferred; **input methods** (costs incurred as a proportion of total expected cost, labour hours) measure effort expended, which is a proxy and can misstate progress if inputs don't correlate with value delivered (e.g. wasted material or upfront design cost). A cost-to-cost input method is common for construction but must exclude costs that don't reflect progress (abnormal waste, uninstalled materials not yet incorporated into the work).

**Contract assets and liabilities**: a **contract asset** arises when the entity has performed (recognised revenue) but not yet billed/has an unconditional right to payment — common in over-time construction billing behind cost. A **contract liability** (deferred revenue) arises when the customer has paid or is billed ahead of performance — a deposit or advance payment. These are distinct from straightforward trade receivables, which arise only once the right to payment is unconditional (i.e. only the passage of time is required).

*Worked example (allocation)*: a business sells a bundle of hardware (standalone price £800) plus a 12-month support plan (standalone price £400) for a bundled price of £1,000. The £200 discount is allocated proportionally: hardware gets £800/£1,200 × £1,000 = £667 recognised at the point of delivery; support gets £400/£1,200 × £1,000 = £333 recognised over the 12 months as the service is provided.

**Variable consideration** (discounts, rebates, performance bonuses/penalties, refund rights) is estimated using expected value or most-likely-amount, and included in the transaction price only to the extent it is highly probable there will be no significant reversal.

**Significant financing component**: if the timing of payments provides the customer or the entity with a significant benefit of financing (e.g. payment more than roughly a year before or after delivery), the consideration is adjusted for the time value of money and the difference recognised as interest income/expense, not revenue. A practical expedient exists if the gap is expected to be one year or less.

**Principal vs agent**: the entity is a **principal** (recognises revenue gross) if it controls the good or service before transferring it to the customer; it is an **agent** (recognises only its fee or commission, net) if it merely arranges for another party to provide it. This is critical for **travel agents**: a travel business that resells package holidays it assembles and controls is typically a principal (gross revenue); one that merely books an airline ticket or hotel room on a customer's behalf, without taking control of it, is an agent and should recognise only the commission — booking the full fare as revenue would materially overstate turnover ([IFRS Community: principal vs agent](https://ifrscommunity.com/knowledge-base/principal-vs-agent-revenue-gross-vs-net/), [Grant Thornton insight](https://www.grantthornton.global/en/insights/articles/ifrs-15-insights/principal-versus-agent-considerations/)).

**What this means for the ledger**: Sentryfi needs a contract/performance-obligation model that is richer than "invoice = revenue" — each sales document should be able to carry one or more performance obligations, a satisfaction method (point in time vs over time, and if over time, an input or output progress measure), and link to contract asset/liability accounts distinct from trade receivables/deferred income. Invoicing and revenue recognition must be decoupled: an invoice raised is not automatically revenue recognised. The system must let a business flag itself (or a specific product line) as principal or agent so gross vs net revenue posting is deliberate, not a side-effect of how an invoice was typed. Long-term contract businesses (construction, engineering) need percentage-of-completion support with a defensible progress input.

---

## 5. IFRS 16 Leases

**Lessee model**: with limited exemptions, IFRS 16 requires lessees to recognise a **right-of-use (ROU) asset** and a **lease liability** for essentially all leases — the old operating/finance lease split for lessees is abolished. There is no longer an "off-balance-sheet operating lease" for a lessee under full IFRS 16.

**Exemptions** (elective, by class of underlying asset or lease-by-lease): **short-term leases** (lease term of 12 months or less at commencement, with no purchase option) and **low-value assets** (assets that are low value when new — commonly benchmarked around USD 5,000, though this is not a bright-line threshold in the standard itself, and the asset must not be highly dependent on or interrelated with other leased assets). For these, lease payments can simply be expensed on a straight-line basis over the lease term, exactly like the old operating-lease treatment ([House of Control: IFRS 16 exemptions](https://www.houseofcontrol.com/blog/ifrs-16-exemptions-short-term-and-low-value), [IFRS Community: scope of IFRS 16](https://ifrscommunity.com/knowledge-base/scope-of-ifrs-16/)).

**Initial measurement**: the lease liability is the present value of remaining lease payments, discounted at the rate implicit in the lease (or, if that can't be readily determined — the normal case for an SME), the lessee's incremental borrowing rate. The ROU asset is initially measured at the amount of the lease liability, plus payments made at or before commencement, plus initial direct costs, plus an estimate of dismantling/restoration costs, less any lease incentives received. Subsequently, the ROU asset is generally depreciated straight-line over the shorter of useful life and lease term, and the lease liability is unwound using the effective interest method, with cash payments split between interest and principal.

*Worked example*: a business leases a delivery van for 4 years at £500/month, incremental borrowing rate 6%. The lease liability is the present value of 48 payments of £500 at 6% — roughly £21,300. The ROU asset starts at the same £21,300 (assuming no upfront payments, incentives, or direct costs) and is depreciated straight-line over 4 years (~£444/month). Each month's £500 cash payment is split between interest (unwinding the liability at 6%, largest in month 1) and principal repayment — so the combined depreciation-plus-interest expense is higher than £500 in the early years and lower later, front-loading the P&L charge versus the flat rental the business actually pays.

**What a small business with equipment on finance actually has to do**: identify every lease (a van, a photocopier, a unit lease, equipment finance) that runs longer than the short-term/low-value threshold; establish a discount rate; calculate and post the initial ROU asset and lease liability; and each period post depreciation on the ROU asset and interest on the liability separately (this typically front-loads the expense compared with a flat rental charge). A lease that looks like a simple monthly rental in the bank feed is not automatically an expense — if it fails both exemptions, it must be capitalised.

**IFRS for SMEs difference — this is explicit and important**: the IFRS for SMEs Standard has **not** been aligned with IFRS 16. It retains the older **Section 20** model, which keeps the classic **operating vs finance lease distinction** for lessees, based on whether substantially all risks and rewards of ownership transfer (finance lease → asset and liability recognised, depreciated; operating lease → simply expensed on a straight-line basis, off-balance-sheet). As of the IASB's 2025 review cycle, aligning Section 20 with IFRS 16 was explicitly deferred, not adopted ([IFRS.org: Aligning Section 20 with IFRS 16 — ways forward](https://www.ifrs.org/content/dam/ifrs/meetings/2021/september/sme-implementation-group/ap4b-ifrs-16-ways-forward.pdf)). A small business reporting under IFRS for SMEs (rather than full IFRS) may therefore still legitimately keep a genuine operating lease off-balance-sheet — this is a real and current divergence, not a simplification Sentryfi should silently override.

**What this means for the ledger**: Sentryfi needs a lease register (asset description, term, payment schedule, discount rate, classification decision) separate from ordinary recurring-expense rules, because a lease is not just a recurring bill. The product should let the business declare which basis it reports under (full IFRS/IFRS 16 single model, or IFRS for SMEs Section 20 classification) since the correct journal entries genuinely differ — this must be a setting, not an assumption. For the IFRS 16 path, the system must compute and post ROU asset depreciation and effective-interest unwind separately each period, not a flat expense. Short-term/low-value leases should have a lightweight "just expense it" toggle so most small equipment rentals don't require full lease accounting.

---

## 6. IAS 21 The effects of changes in foreign exchange rates

**Functional currency** is the currency of the primary economic environment the entity operates in (usually the currency it prices and collects/pays in, not necessarily its country of incorporation) — determined once, changed only if the underlying economics genuinely change.

**Initial recognition**: a foreign currency transaction is translated at the **spot rate on the transaction date** (an average rate for the period is an acceptable approximation if rates don't fluctuate significantly).

**At each reporting date**:
- **Monetary items** (cash, receivables, payables, loans — anything to be received or paid in a fixed or determinable amount of money) are retranslated at the **closing rate**.
- **Non-monetary items** measured at historical cost (most inventory, most PP&E) are **not retranslated** — they stay at the rate on the date of the original transaction.
- Non-monetary items measured at fair value are translated at the rate on the date fair value was determined.

**Exchange differences** on monetary items are recognised in **profit or loss** in the period they arise (except for certain differences on a net investment in a foreign operation, which is a group/consolidation scenario unlikely to matter to a single-entity SME).

*Worked example*: a UK business (functional currency GBP) buys stock from a US supplier for $10,000 when the rate is £1 = $1.25 (cost £8,000), on 60-day credit. At the transaction date it posts inventory £8,000 and a $10,000 payable, translated at £8,000. At the reporting date, one month later, the rate has moved to £1 = $1.30 — the payable is retranslated to £7,692, and the £308 difference is a foreign exchange **gain** in profit or loss (the liability is now cheaper in GBP terms). The inventory stays at £8,000 regardless of the rate movement — only tested against NRV, never against FX.

**Why inventory cost is not remeasured**: inventory purchased in a foreign currency is initially recorded at the functional-currency cost using the spot rate on the purchase date; because it is a non-monetary asset held at historical cost, it is not retranslated at each reporting date even while exchange rates move. It is only re-tested against NRV under IAS 2 (in functional currency), not revalued for FX. Only the monetary payable to the foreign supplier (if unpaid) moves with the exchange rate — the inventory cost itself is frozen at acquisition.

**What this means for the ledger**: every transaction needs a currency and an FX rate captured at transaction date; the chart of accounts must distinguish monetary from non-monetary balances so period-end revaluation logic applies only to monetary ones (cash, AR, AP, loans in foreign currency) and never touches inventory or fixed-asset cost. A period-end FX revaluation routine must post the resulting gain/loss to a P&L account automatically, with an audit trail per balance revalued.

---

## 7. IFRS 9 — basics for SMEs (receivables and loans)

**Trade receivables and expected credit losses (ECL)**: IFRS 9 requires impairment to be recognised on an expected-loss basis (not just when a loss has actually occurred). For trade receivables (and contract assets) without a significant financing component, entities apply the **simplified approach**: recognise **lifetime expected credit losses** from initial recognition, without needing to track whether credit risk has significantly increased. In practice this is done with a **provision matrix** — receivables are grouped by shared risk characteristics and ageing bucket (current, 1–30 days, 31–60, 61–90, 90+), a historical loss rate is applied to each bucket, and the rate is adjusted for current and forward-looking information (economic outlook, known customer issues) ([PwC provision matrix guide](https://www.pwc.ch/en/publications/2020/IFRS%209%20-%20Impairment%20-%20Provision%20Matrix%20-%20Practical%20Guide.pdf), [PKF Littlejohn: two ways of calculating ECLs](https://www.pkf-l.com/insights/ifrs-9-the-two-ways-of-calculating-ecls/)). The matrix is reassessed at each reporting date.

*Worked example*: a business has £50,000 of receivables — £30,000 current (0.5% expected loss rate), £12,000 at 1–30 days (2%), £5,000 at 31–60 days (8%), £3,000 over 90 days (40%). The provision = (30,000×0.5%) + (12,000×2%) + (5,000×8%) + (3,000×40%) = £150 + £240 + £400 + £1,200 = £1,990, posted as a bad-debt/ECL provision, not written off against any specific invoice.

**Amortised cost and effective interest for loans**: a loan (received or given) that is held to collect/pay contractual cash flows and has basic (SPPI — solely payments of principal and interest) terms is measured at **amortised cost** using the **effective interest method**: transaction costs and any premium/discount are spread over the loan's life so that a constant rate is applied to the outstanding carrying amount each period, rather than recognising interest on a simple flat-rate or straight-line basis. This matters for SME finance leases, directors' loans, and bank term loans with arrangement fees.

**What this means for the ledger**: accounts receivable needs an ageing report as a native, always-available view (not a bolt-on), because it is the direct input to the ECL provision matrix. Sentryfi should support a configurable loss-rate-by-ageing-bucket table and post a bad-debt/ECL provision journal automatically or on a prompted review cadence — not only when a specific invoice is manually written off. Loan/borrowing records need principal, rate, fees, and term fields sufficient to run an effective-interest amortisation schedule, rather than assuming flat-line interest.

---

## 8. IAS 7 Statement of cash flows

Cash flows are classified as **operating**, **investing**, or **financing**. Operating activities can be presented by the **direct method** (major classes of gross cash receipts and payments — cash received from customers, cash paid to suppliers and employees) or the **indirect method** (start from profit or loss, adjust for non-cash items like depreciation and working-capital movements). IAS 7 encourages the direct method but permits either; in practice almost everyone, including most SMEs, uses the **indirect method** because it can be derived mechanically from the P&L and balance-sheet movements without a separate cash-receipts/payments ledger.

**What a small business can produce from a ledger**: if every transaction in the ledger is properly coded to a bank/cash account and classified by nature, a competent system can generate the indirect-method statement automatically by comparing two balance sheets and adjusting the P&L for non-cash items (depreciation, provisions, FX revaluation) and working-capital changes (movement in receivables, payables, inventory). A true direct-method statement additionally requires cash receipts/payments to be tagged by activity type (operating/investing/financing) at the point of entry, which most small-business bookkeeping doesn't bother to do unless the system enforces it.

*Worked example (indirect method)*: profit for the period is £10,000. Depreciation of £2,000 is added back (non-cash). Receivables increased by £1,500 (cash not yet collected, so subtracted). Payables increased by £800 (cash not yet paid, so added back). Operating cash flow = 10,000 + 2,000 − 1,500 + 800 = £11,300. This reconciliation is mechanical once accounts carry a cash-flow classification tag; it requires no separate cash-receipts ledger the way the direct method does.

**What this means for the ledger**: Sentryfi should generate the indirect-method cash flow statement automatically from existing ledger data (P&L plus balance sheet deltas plus a mapping of each account to operating/investing/financing) as the default, since it requires no extra user discipline. Every account needs a cash-flow classification tag (operating/investing/financing) as part of its setup so the statement can be built without manual reclassification each period. Offering the direct method is a "nice to have," not a baseline requirement.

---

## 9. IAS 37 Provisions, contingent liabilities and contingent assets; IAS 10 Events after the reporting period

**IAS 37**: a **provision** is recognised only when all three hold: there is a present obligation (legal or constructive) as a result of a past event; it is probable that settlement will require an outflow of resources; and the amount can be estimated reliably. A **contingent liability** (possible obligation depending on a future event, or a present obligation that isn't probable or can't be reliably measured) is disclosed in the notes, not recognised in the accounts. A **contingent asset** is disclosed only if inflow is probable, never recognised until realisation is virtually certain (at which point it's no longer contingent).

**IAS 10**: events between the reporting date and the date the financial statements are authorised for issue are either:
- **Adjusting events** — provide evidence of conditions that existed at the reporting date (e.g. a customer's insolvency shortly after year-end confirming a receivable was already impaired at year-end) — the financial statements are adjusted.
- **Non-adjusting events** — indicative of conditions arising after the reporting date (e.g. a fire destroying a warehouse after year-end) — not adjusted, but disclosed if material.
- If a going-concern-threatening event occurs after the reporting date, the financial statements may need to be prepared on a basis other than going concern entirely.

*Worked example (IAS 37)*: a business is being sued by a former supplier for £40,000 over a contract dispute. Legal counsel advises settlement is probable at around £25,000. A provision of £25,000 is recognised (Dr Legal expense, Cr Provision) — not the full claim amount, and not merely disclosed, because all three recognition criteria are met. If counsel instead advised the claim was only possible, not probable, nothing would be recognised and it would be disclosed as a contingent liability with a description and estimated range instead.

**What this means for the ledger**: Sentryfi needs a provisions register distinct from ordinary accruals — something with an obligating event, a probability judgement, and an estimate, that a person actively assesses, not something auto-generated from unpaid bills. There should be a lightweight way to flag and note subsequent events between period-end and the point the accounts are finalised/locked, distinguishing adjusting (triggers a journal entry before lock) from non-adjusting (note only). This is inherently a human judgement call the system should prompt for at year-end close, not something to infer automatically.

---

## 10. The four month-end adjustments everyone needs

Every accruals-basis close rests on four adjustment types:

1. **Accrued expense** (accrual) — a cost has been incurred but not yet invoiced/paid. *Example: electricity used in September, bill arrives in October.* Dr Expense, Cr Accrued liability. Reversed (or naturally cleared) when the actual invoice is booked.
2. **Prepaid expense** (prepayment) — cash paid for a cost that relates to a future period. *Example: 12-month insurance paid upfront in January.* Initially Dr Prepayment (asset), Cr Cash/Payable; then released to expense each month it relates to (Dr Expense, Cr Prepayment).
3. **Accrued income** — income earned but not yet invoiced. *Example: consulting work delivered in September, invoiced in October.* Dr Accrued income (asset), Cr Revenue; reversed when the invoice is raised.
4. **Deferred income** (income received in advance / unearned revenue) — cash or invoice received for goods/services not yet delivered. *Example: a customer pays a 12-month subscription upfront.* Dr Cash/Receivable, Cr Deferred income (liability); released to revenue as delivered (this is also where IFRS 15's contract-liability concept lands for a simple subscription business).

**What this means for the ledger**: Sentryfi needs first-class accrual, prepayment, accrued-income, and deferred-income schedules — not just journal entries typed by hand each month — where a person enters the total and the period it covers once, and the system generates and posts the monthly release automatically. Each schedule entry needs a clear source document reference and an easy way to see the remaining unreleased balance at any time (this is also what a prepayments/deferred-income note in the statements is built from).

---

## 11. Double-entry mechanics

**The accounting equation**: Assets = Liabilities + Equity, at all times, for every entity, at any point in time. Every transaction is recorded as at least one debit and one credit of equal total value, so the equation never breaks.

**Debit/credit rules by account type**:

| Account type | Increases with | Decreases with | Normal balance |
|---|---|---|---|
| Asset | Debit | Credit | Debit |
| Liability | Credit | Debit | Credit |
| Equity | Credit | Debit | Credit |
| Revenue | Credit | Debit | Credit |
| Expense | Debit | Credit | Debit |

**Control accounts and subsidiary ledgers**: the general ledger holds a single control account for, e.g., trade receivables and trade payables; the detail (each customer's or supplier's balance) lives in a subsidiary ledger. The control account balance must always equal the sum of subsidiary ledger balances — any mismatch signals a posting error and must be investigated, not plugged.

**Trial balance**: a listing of every account's debit or credit balance at a point in time; total debits must equal total credits. It doesn't prove the accounts are correct (it won't catch a transaction posted to the wrong account, or one omitted entirely) — only that debits and credits are in balance.

**Closing entries and retained earnings**: at period end, revenue and expense (P&L) accounts are closed to zero, with the net result (profit or loss) transferred into retained earnings (an equity account); balance-sheet accounts carry forward. This is what separates "this period's" P&L from the cumulative balance-sheet position.

*Worked example*: a customer pays a £1,200 sales invoice by bank transfer. The ledger posts Dr Bank £1,200 (asset increases), Cr Trade receivables — that customer's subledger and the control account £1,200 (asset decreases). Both sides are debits/credits of equal value, the equation stays balanced, and the control account still ties to the sum of subledger balances.

**Suspense accounts**: used temporarily to hold a transaction that can't yet be fully coded (unknown counterparty, unclear classification) so the books still balance while the correct treatment is investigated. **A suspense account balance must never persist past period close** — it represents unresolved, unexplained entries, and letting it linger both breaks the audit trail and risks misstating the accounts it should have hit. It should generate an active, visible exception until cleared.

**Reversing entries vs deletion**: once a journal entry has been posted (particularly if a period is locked or the entry has been relied on for a filed return, invoice, or statement sent to a third party), it should be **reversed** with an equal and opposite entry referencing the original, not deleted. Deletion destroys the audit trail; a reversal preserves a full history of what was recorded, when, by whom, and why it was corrected. Entries in an open, unlocked, never-reported period may reasonably be edited or deleted, but this should still be logged.

**Audit trail expectations**: every posted entry should carry who created it, when, from what source document (invoice, bank feed, manual journal), and — for any correction — a link back to what it reverses or amends. Locked periods should be genuinely immutable in the ledger, with corrections only possible via a new, dated, cross-referenced entry in an open period.

**What this means for the ledger**: Sentryfi's posting engine must enforce debits = credits at the database transaction level (reject any unbalanced entry outright), maintain control-account/subsidiary-ledger integrity automatically (a customer invoice posts to both the AR control account and that customer's subledger in the same transaction), and never allow a hard delete of a posted, period-locked, or externally-referenced entry — only reversal. A trial balance and a suspense-account balance check should be running health indicators, not just report outputs, and a non-zero suspense balance at proposed period-close should hard-block the close (or require an explicit, logged override) rather than being a passive warning.

---

## 12. Month-end and year-end close checklists

**Month-end close** (as practised):
1. Ensure all sales invoices and purchase bills for the period are entered — nothing recognisable as revenue or cost should be sitting unrecorded outside the ledger.
2. Reconcile every bank and cash account to the statement/feed — every ledger cash balance must tie to an external, verifiable source.
3. Reconcile control accounts (AR, AP) to subsidiary ledgers — catches postings made to the control account without a matching customer/supplier entry, or vice versa.
4. Post depreciation for the period, generated from the fixed asset register rather than typed manually each month.
5. Post the four standard adjustments: accruals, prepayments, accrued income, deferred income releases (section 10 above) — these are what separates a cash-timing ledger from an accruals-basis one.
6. Review and post any inventory write-downs (NRV) or cost corrections identified during the period.
7. Post FX revaluation of monetary balances, if applicable — every foreign-currency cash, receivable, payable, or loan balance retranslated at the closing rate.
8. Review the ECL/bad-debt provision against the current ageing — the provision matrix is only as good as its last update.
9. Review the trial balance: confirm it balances and that account balances look reasonable (flag unusual movements) — a balanced trial balance is necessary but not sufficient; a sanity review catches miscoded entries a balance check can't.
10. Confirm the suspense account is zero; investigate and clear if not — this should block close, not just be noted.
11. Generate and review P&L and balance sheet; compare to budget/prior period — the human check that the numbers make business sense.
12. Lock the period once reviewed, so no further postings can land in it without an explicit, logged reopen.

**Year-end close** (in addition to the above, at the final period of the year):
1. Confirm all twelve months are reconciled and locked.
2. Physical/perpetual inventory count and reconciliation to the ledger — differences between counted and book quantities are investigated and adjusted, with a note of the cause where known (shrinkage, miscount, unrecorded movement).
3. Fixed asset register review: confirm additions/disposals for the year, review useful lives and residual values for any that no longer reflect actual use.
4. Review provisions and contingent liabilities for the year; assess subsequent events up to the date the accounts are finalised, classifying each as adjusting or non-adjusting.
5. Confirm lease register completeness and re-check any short-term/low-value classifications are still valid (a short-term lease that gets renewed or extended may no longer qualify for the exemption).
6. Review revenue recognition for any open/part-completed contracts (contract asset/liability balances correctly stated, percentage-of-completion reassessed against latest cost-to-complete estimates).
7. Close P&L to retained earnings.
8. Prepare the full statement set (balance sheet, P&L, changes in equity, cash flow, notes) with comparatives.
9. Perform a going-concern assessment — explicitly, as a documented judgement, not an assumption carried over from last year.
10. Lock the year; carry forward opening balances to the new year.
11. Retain the full audit trail and supporting documents per the applicable statutory retention period (jurisdiction-dependent — flagged as uncertain here since it varies by country, commonly five to seven years, and Sentryfi should let the business set its own retention policy rather than hard-coding one).

**What this means for the ledger**: Sentryfi should offer a literal, stateful close checklist per period (not just reports the user might remember to run) — each step above as a trackable item with a completion state, an owner, and a link to the relevant report or register. Locking should be a real, enforced state transition (not a convention), unlockable only via an explicit, logged action. The year-end checklist should be distinguishable from month-end in the UI so users aren't asked to do a physical inventory count every month.

---

## Sources

- [IFRS Foundation — issued standards](https://www.ifrs.org/issued-standards/list-of-standards/)
- [IFRS for SMEs Standard](https://www.ifrs.org/issued-standards/ifrs-for-smes/)
- [IAS 2 Inventories](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)
- [IAS 16 Property, Plant and Equipment](https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/)
- [IFRS 15 five-step model — IFRS Buddy](https://ifrsbuddy.com/learn/en/ifrs-15-five-step-model)
- [IFRS 15 five-step model with journal entries — CPDbox](https://www.cpdbox.com/5-step-model-revenue-recognition-ifrs-15-journal-entries-example/)
- [Principal vs agent, gross vs net revenue — IFRS Community](https://ifrscommunity.com/knowledge-base/principal-vs-agent-revenue-gross-vs-net/)
- [IFRS 15 principal versus agent considerations — Grant Thornton](https://www.grantthornton.global/en/insights/articles/ifrs-15-insights/principal-versus-agent-considerations/)
- [IFRS 16 short-term and low-value lease exemptions — House of Control](https://www.houseofcontrol.com/blog/ifrs-16-exemptions-short-term-and-low-value)
- [Scope of IFRS 16 — IFRS Community](https://ifrscommunity.com/knowledge-base/scope-of-ifrs-16/)
- [Aligning Section 20 Leases of IFRS for SMEs with IFRS 16 — IFRS.org staff paper](https://www.ifrs.org/content/dam/ifrs/meetings/2021/september/sme-implementation-group/ap4b-ifrs-16-ways-forward.pdf)
- [IFRS 9 impairment: provision matrix practical guide — PwC](https://www.pwc.ch/en/publications/2020/IFRS%209%20-%20Impairment%20-%20Provision%20Matrix%20-%20Practical%20Guide.pdf)
- [IFRS 9: the two ways of calculating ECLs — PKF Littlejohn](https://www.pkf-l.com/insights/ifrs-9-the-two-ways-of-calculating-ecls/)

Areas flagged as needing local-jurisdiction confirmation rather than a single global answer: statutory document retention periods (varies by country); the exact low-value lease threshold under IFRS 16 (illustrative in Basis for Conclusions, not a bright-line in the standard); whether a given small business reports under full IFRS, IFRS for SMEs, or a local GAAP (e.g. UK FRS 102) — this determines whether the IFRS 16 single lessee model or the older operating/finance split applies, and Sentryfi should ask rather than assume.

---

## Appendix A: glossary of terms used above

- **AR / AP** — accounts receivable / accounts payable; the control accounts for amounts customers owe the business and the business owes suppliers.
- **Amortised cost** — a financial asset or liability's initial recognition amount, adjusted for principal repayments and the cumulative amortisation of any difference between that initial amount and the maturity amount, using the effective interest method.
- **Contract asset** — an entity's right to consideration for goods/services already transferred, conditional on something other than the passage of time (e.g. reaching a milestone); becomes a receivable once the right is unconditional.
- **Contract liability** — an entity's obligation to transfer goods/services for which it has already received consideration (or has an amount due) from the customer.
- **ECL** — expected credit loss; the probability-weighted estimate of credit losses over the relevant time horizon.
- **Effective interest method** — a way of allocating interest income/expense over the relevant period so a constant rate applies to the carrying amount.
- **FX** — foreign exchange.
- **NRV** — net realisable value; estimated selling price less costs of completion and costs to sell.
- **OCI** — other comprehensive income; items of income and expense not recognised in profit or loss, but in equity (e.g. a revaluation surplus).
- **Performance obligation** — a promise in a contract to transfer a distinct good or service to a customer.
- **Provision matrix** — a table of expected loss rates by receivables ageing bucket, used under IFRS 9's simplified approach.
- **ROU asset** — right-of-use asset; a lessee's asset representing its right to use a leased item for the lease term.
- **SPPI** — solely payments of principal and interest; the contractual cash-flow test a debt instrument must pass to qualify for amortised-cost measurement under IFRS 9.
- **Standalone selling price** — the price at which an entity would sell a good or service separately to a customer; used to allocate a bundled transaction price under IFRS 15.

## Appendix B: chart of accounts touchpoints

A rough map of which standards bear on which parts of a small business's chart of accounts, useful when scoping which account types need extra fields or behaviour beyond a plain debit/credit balance.

| Account area | Standards involved | Extra behaviour needed |
|---|---|---|
| Cash and bank | IAS 7, IAS 21 (if foreign-currency accounts) | Cash-flow classification tag; FX revaluation if non-functional-currency. |
| Trade receivables | IFRS 9, IFRS 15 | Ageing, ECL provision matrix, links to contract assets. |
| Trade payables | IAS 21 (if foreign-currency) | FX revaluation of foreign-currency balances. |
| Inventory | IAS 2 | Costing method, landed cost allocation, NRV write-down. |
| Prepayments / accrued income | Accruals principle | Release schedule over the period covered. |
| Fixed assets | IAS 16 | Depreciation schedule, disposal workflow, cost-model default. |
| Right-of-use assets / lease liabilities | IFRS 16 / IFRS for SMEs Section 20 | Present-value calculation, depreciation/interest split or straight-line expense depending on reporting basis. |
| Contract assets / contract liabilities | IFRS 15 | Distinct from AR/deferred income; linked to a specific contract and its performance obligations. |
| Loans and borrowings | IFRS 9 | Effective interest amortisation schedule; current/non-current split. |
| Provisions | IAS 37 | Obligating event, probability judgement, estimate; distinct from accruals. |
| Accrued expenses / deferred income | Accruals principle | Release schedule; deferred income also intersects IFRS 15 contract liabilities for service/subscription businesses. |
| Retained earnings | IAS 1 | Automatic roll-forward from P&L close; not directly postable outside closing entries and prior-period error corrections. |
| Suspense | — (control mechanism only) | Must be zero at period close; never a permanent home for any balance. |

## Appendix C: consolidated build requirements

This pulls every "what this means for the ledger" line above into one reference table, for a quick scan when scoping a feature rather than re-reading the full standard-by-standard detail.

| Area | Sentryfi must |
|---|---|
| Statements | Generate balance sheet, P&L, changes in equity, and cash flow with comparatives; split current/non-current by settlement horizon, not fixed mapping. |
| Netting | Never net unrelated debit/credit balances by default; require an explicit, logged set-off decision. |
| Inventory costing | Enforce one costing method (FIFO or weighted average) per inventory category; no LIFO. |
| Landed costs | Allocate freight/duty to on-hand inventory cost; route to cost-of-sales automatically if the related stock has already sold. |
| Inventory NRV | Support a write-down workflow with reversal, tracked against carrying cost. |
| Fixed assets | Track cost, life, method, residual value; auto-generate depreciation postings; block direct credits to cost accounts. |
| Disposals | Guided workflow removing cost and accumulated depreciation; gain/loss to a non-revenue P&L line. |
| Revenue | Model performance obligations distinct from invoices; support over-time and point-in-time recognition; separate contract asset/liability from AR/deferred income. |
| Principal/agent | Let a business or product line declare gross vs net revenue treatment explicitly. |
| Leases | Maintain a lease register separate from recurring bills; support both the IFRS 16 single model and IFRS for SMEs operating/finance split, selectable per reporting basis. |
| FX | Capture transaction-date rate per transaction; revalue only monetary balances at period end; never revalue inventory/PP&E for FX. |
| Receivables | Provide an always-available ageing report; support a configurable loss-rate provision matrix with automatic posting. |
| Loans | Support effective-interest amortisation schedules, not flat-line interest. |
| Cash flow | Auto-generate the indirect-method statement from account-level cash-flow classification tags. |
| Provisions | Maintain a provisions register distinct from accruals, requiring an explicit probability judgement. |
| Subsequent events | Provide a way to log and classify events between period-end and finalisation as adjusting or non-adjusting. |
| Accrual-type adjustments | Provide first-class accrual, prepayment, accrued-income, and deferred-income schedules with automatic periodic release. |
| Posting engine | Enforce debits = credits at the transaction level; keep control accounts and subledgers atomically in sync. |
| Suspense | Block period close on any non-zero suspense balance, or require a logged override. |
| Corrections | Disallow hard deletion of posted/locked/externally-referenced entries; require reversal with cross-reference. |
| Audit trail | Record who/when/source for every entry; make locked periods genuinely immutable. |
| Close process | Provide a stateful month-end and year-end checklist, not just reports a user must remember to run. |
