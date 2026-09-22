# Money borrowed and paid: borrowing, banking charges, payroll and expenses

*Last researched: 22 September 2026.*

This is a durable domain reference for Sentryfi. It exists so that anyone building the ledger, the bank feed, the payroll module or the expense module understands the real-world mechanics before they design a screen or a schema. It does not prescribe UI. It prescribes what must be true underneath: how a loan actually amortises, what a payslip is actually made of, what a merchant discount rate actually does to a settlement, and why hiding director transactions in a suspense account is a recurring cause of tax trouble for small businesses. Where the Maldives has a specific shape (pension, expatriate quota costs, MIRA filings), it is flagged but not detailed — a separate Maldives tax reference covers rates and forms, and this document cross-references it rather than duplicating it.

Every section closes with **what this means for the ledger**: the concrete implication for Sentryfi's data model or postings.

---

## 1. Borrowing: every kind a small business meets

### 1.1 Bank term loan

A lump sum advanced once, repaid over a fixed term through scheduled instalments that blend interest and principal. Almost always secured (property, equipment, personal guarantee) for a small business. The lender sets an amortisation schedule at drawdown; the business's job is to service it and know, at any date, what's still owed.

**What this means for the ledger:** a term loan is a single liability record with a start date, principal, rate, term, and repayment frequency, from which an amortisation schedule is generated (or imported from the lender). Each repayment posts as two lines: interest expense and principal reduction. See §2 for the maths.

### 1.2 Overdraft / working capital line

A revolving facility against a current account, usually with a set limit, drawn and repaid as cash moves. Interest is charged daily on the drawn balance only, not on the limit, and often at a materially higher rate than a term loan because it is unsecured or lightly secured and the bank has less certainty about the outstanding balance at any moment.

**What this means for the ledger:** the overdrawn balance is a liability that moves daily; it should not be booked as one static loan record. It is best modelled as a bank account whose balance can go negative up to the agreed limit, with interest accrued and charged periodically (often monthly) as a separate expense posting — not folded silently into the account's closing balance.

### 1.3 Invoice financing / factoring (with and without recourse)

The business sells or pledges unpaid invoices to a financier for an advance (typically 70–90% of face value), with the balance paid on collection less a fee. **With recourse**: if the customer doesn't pay, the business must repay the advance — the receivable and a matching liability stay on the business's books until collected. **Without recourse** (true factoring): the financier absorbs bad-debt risk, and the sale of the receivable can be treated as a genuine sale — the receivable is derecognised. The distinction matters because it changes whether the balance sheet still shows the customer debt or shows a loan instead.

**What this means for the ledger:** recourse factoring needs a liability line ("advance against invoice financing") alongside the untouched receivable, plus a financing-fee expense; non-recourse factoring derecognises the receivable and records a factoring expense (the discount) at the point of sale, with cash for the advance and later the balancing remittance.

### 1.4 Asset finance / hire purchase (HP)

The business acquires an asset (vehicle, machinery) and pays it off over time; legal title normally transfers only at the end once the final ("balloon" or nominal) payment is made. Economically the business controls and uses the asset from day one, so accounting treats it as if owned: the asset is capitalised, a matching liability is recognised for the amount financed, and each instalment splits between interest and principal exactly like a term loan.

**What this means for the ledger:** HP creates two entries at inception — a fixed asset and a liability of the same amount — and then an amortisation schedule identical in mechanics to §2. Depreciation runs on the asset independently of the loan schedule.

### 1.5 Finance lease vs operating lease

A **finance lease** transfers substantially all the risks and rewards of ownership to the lessee even though legal title may never pass — it is accounted for like HP (asset + liability, depreciation + interest). An **operating lease** is a genuine rental — the lessor keeps the risks and rewards, and (under simplified small-business regimes) payments are simply an expense as incurred, though under full IFRS 16 even operating leases now generally get a right-of-use asset and lease liability for anything beyond short-term/low-value. For a small business product, the practical question is usually: does the contract look like a purchase (transfer of ownership, bargain buyout, lease term ≈ asset's useful life) or a rental?

**What this means for the ledger:** Sentryfi needs a lease classification flag per contract. Finance leases and HP follow the loan-amortisation model; simple short-term operating leases (most small-business equipment and premises rentals under a simplified regime) can post as a straight recurring expense — but the schema should not assume every lease is a simple expense, because that breaks the moment a client has a finance lease.

### 1.6 Letter of credit (LC) facility and trust receipt / loan against import

Common for import-heavy Maldivian businesses. An LC is the bank's conditional payment guarantee to an overseas supplier, drawn against shipping documents. It is not itself a loan — but once the bank pays the supplier and the business hasn't yet paid the bank, that exposure becomes a **trust receipt (TR)** or loan-against-import: a short-term liability that lets the business take and sell the goods before settling the bank. LC commissions and TR interest are real, recurring costs of import trade finance.

**What this means for the ledger:** an LC facility itself is off-balance-sheet (a contingent commitment / facility limit), but the moment goods are received against a TR, a liability must be recognised for the TR amount, with interest accruing until settlement, alongside inventory received. LC opening/amendment commissions are fees (§4), not interest.

Worked example: a shop imports USD 20,000 of stock under an LC. The bank pays the overseas supplier and releases the shipping documents against a 90-day trust receipt at 9% p.a. On receipt, the business books inventory of the MVR equivalent and a TR liability of the same amount; over the 90 days it accrues interest (roughly MVR-equivalent of USD 20,000 × 9% × 90/365 ≈ USD 444) as a finance cost, separate from the LC's own one-off opening commission (often 0.1–0.25% of the LC value per quarter) which is a fee, not interest, and separate again from the stock's own cost, which doesn't change because of how it was financed.

### 1.7 Supplier credit (trade credit)

Ordinary "pay in 30/60/90 days" terms from suppliers. Interest-free if paid on time, but the true cost shows up as forgone early-payment discounts or as penalty/late fees if terms are missed — and stretching supplier terms is a genuine (if informal) source of working-capital finance.

**What this means for the ledger:** this is just accounts payable with due dates; the "financing" element is implicit in cash-flow timing, not a separate liability. Where a supplier charges explicit late-payment interest, that becomes a finance-cost line, not a purchase-price adjustment.

### 1.8 Director / owner loans, both directions

**Business owes the director** (director lends money into the company): a genuine liability of the business, ideally on written terms (amount, rate if any, repayment plan). **Director owes the business** (company lends to the director/shareholder, or funds drawings beyond entitlement): a genuine receivable from the director, which many tax regimes scrutinise closely — an undocumented, long-outstanding director loan can be recharacterised as taxable income or trigger benefit-in-kind style charges. See §3.

**What this means for the ledger:** director loans need their own named liability/receivable accounts per director — never merged into general suspense or into share capital — with a running balance, so the direction and size of the debt is always visible at a glance.

### 1.9 Personal loans used in the business

A common small-business reality: the owner takes a personal loan (their name, their liability) and injects the cash into the business. The loan itself is not a business liability — the business owes nothing to the bank — but the injected cash is either capital introduced or a director loan to the business, and any interest the owner separately wants to recover from the business must be an explicit, documented charge, not folded into the personal loan's own interest.

**What this means for the ledger:** record the cash injection as capital introduced or a director loan (per owner's intent), never as a bank loan liability of the business, since the business has no direct obligation to that lender.

### 1.10 Islamic finance structures common in the Maldives

Maldivian banks (including Islamic windows) commonly offer Sharia-compliant alternatives to conventional lending. These avoid *riba* (interest) by structuring the return as profit on a trade, a rental, or a co-ownership buyout instead:

- **Murabaha** (cost-plus sale): the financier buys the asset the business wants and immediately resells it to the business at cost plus an agreed mark-up, payable in instalments. Economically similar to a term loan for a specific purchase, but structured as two sales. Murabaha is reported to account for roughly 75–80% of Islamic banking transactions globally ([MDPI overview of Islamic accounting](https://www.mdpi.com/1911-8074/16/7/335)).
- **Ijara** (lease): the financier buys and leases the asset to the business for rent; ownership may or may not transfer at the end (ijara wa iqtina / ijara muntahia bittamleek is lease-to-own). No rental can be recognised before the asset is actually delivered to the customer ([Kandoo, Ijara & Diminishing Musharaka](https://www.kandoo.co.uk/guides/ijara-diminishing-musharaka-islamic-finance-explained)).
- **Diminishing musharaka**: the financier and business jointly own an asset; the business buys out the financier's share in instalments while paying rent on the portion it doesn't yet own. Commonly used for property and increasingly cited as well suited to small-scale entrepreneurs ([Ijara CDC](https://ijaracdc.com/diminishing-musharaka/)).

Economically, all three still produce a schedule of payments that a business needs to split into a "finance cost" portion (the mark-up, rent, or profit share) and a "principal reduction" portion (paying down what's owed), even though the legal form (sale, lease, co-ownership) is not a loan. **Flag: exact accounting treatment (recognising a murabaha payable at cost-plus vs at present value, IFRS vs AAOIFI standards) varies by institution and jurisdiction — treat the accounting-standard specifics as uncertain and confirm with a Maldivian accountant or the bank's documentation before finalising chart-of-accounts labels.**

**What this means for the ledger:** Sentryfi should not hard-code "loan = interest-bearing." A financing facility record needs a structure type (conventional loan, murabaha, ijara, diminishing musharaka, HP, finance lease) and, regardless of legal form, a schedule that separates "finance cost" from "capital/principal reduction" — the P&L cares about the finance cost, the balance sheet cares about the reducing obligation. Label the finance-cost line "profit/rent" rather than "interest" when the facility is Islamic, since some businesses and their auditors care about that distinction for compliance reporting.

---

## 2. The mechanics: amortisation, rates, fees, arrears

### 2.1 Amortisation schedules: equal instalment vs equal principal

**Equal instalment (annuity / reducing balance, the normal method)**: every payment is the same amount, but the mix shifts — early payments are mostly interest (the balance is largest), late payments are mostly principal (the balance is smallest). This is what almost all consumer and small-business term loans use.

**Equal principal**: the principal portion is fixed every period (loan amount ÷ number of periods), and interest is calculated on the shrinking balance, so the *total* instalment starts high and falls over the term. Less common for small-business lending but used in some structured/project finance and some Islamic facilities.

**How to split a repayment into interest and principal (equal-instalment method):**

1. Interest for the period = outstanding balance × periodic rate (annual rate ÷ payments per year, for a simple approximation — see §2.2 for why this is an approximation, not exact, for many "flat rate" products).
2. Principal for the period = instalment amount − interest for the period.
3. New balance = old balance − principal for the period.

### 2.2 Worked example: MVR 120,000 term loan, 12% p.a. reducing balance, 12 monthly instalments

Monthly rate = 12% / 12 = 1%. Instalment (annuity formula) ≈ MVR 10,657.71.

| Month | Opening balance | Interest (1%) | Principal | Instalment | Closing balance |
|---|---|---|---|---|---|
| 1 | 120,000.00 | 1,200.00 | 9,457.71 | 10,657.71 | 110,542.29 |
| 2 | 110,542.29 | 1,105.42 | 9,552.29 | 10,657.71 | 100,990.00 |
| 3 | 100,990.00 | 1,009.90 | 9,647.81 | 10,657.71 | 91,342.19 |
| 4 | 91,342.19 | 913.42 | 9,744.29 | 10,657.71 | 81,597.90 |
| 5 | 81,597.90 | 815.98 | 9,841.73 | 10,657.71 | 71,756.17 |
| 6 | 71,756.17 | 717.56 | 9,940.15 | 10,657.71 | 61,816.02 |
| 7 | 61,816.02 | 618.16 | 10,039.55 | 10,657.71 | 51,776.47 |
| 8 | 51,776.47 | 517.76 | 10,139.95 | 10,657.71 | 41,636.52 |
| 9 | 41,636.52 | 416.37 | 10,241.34 | 10,657.71 | 31,395.18 |
| 10 | 31,395.18 | 313.95 | 10,343.76 | 10,657.71 | 21,051.42 |
| 11 | 21,051.42 | 210.51 | 10,447.20 | 10,657.71 | 10,604.22 |
| 12 | 10,604.22 | 106.04 | 10,551.67 | 10,657.71 | 0.00 (rounding) |

Total interest paid over the year ≈ MVR 7,945; total repaid ≈ MVR 127,945. Note the shape: month 1's instalment is 89% principal-light (only 9,457.71 of 10,657.71 reduces the balance) while month 12's instalment is 99% principal — this is the mechanical reason early settlement (§2.5) surprises borrowers, and the reason a bank quoting "12% on the original amount" (flat) would produce a much bigger number than this reducing-balance schedule.

**Equal-principal variant of the same loan**, for contrast: fixed principal = 120,000 / 12 = 10,000 per month, interest on the falling balance. Month 1: interest 1,200.00, instalment 11,200.00. Month 12: interest 100.00, instalment 10,100.00. Total interest ≈ MVR 7,800 — slightly less than the equal-instalment schedule above, because the balance falls faster in the early months. Businesses rarely get to choose; the lender's product determines which method applies, but the schedule should still be modelled explicitly rather than assumed.

### 2.3 Effective interest vs flat / add-on rate — why "6% flat" is roughly 11% effective

A **flat (add-on) rate** calculates interest once, on the *original* principal, for the *whole* term, then divides evenly into instalments — regardless of the fact that the outstanding balance is falling every month. Because the borrower only has the full principal for a moment and the average outstanding balance over the term is roughly half the original amount, the true cost of borrowing (the effective/reducing-balance rate, comparable to APR) is roughly double the flat rate for typical amortising terms. A commonly cited approximation for loans of 3–7 years is:

**Effective rate ≈ 1.85 × flat rate**

So a "6% flat" loan is close to 11% effective — which is exactly the example the product brief flags, and it checks out: 6% × 1.85 ≈ 11.1% ([flat-rate mechanics and the ~1.85× rule of thumb](https://www.transunion.com/tools/apr-calculator); [Wikipedia, Flat rate (finance)](https://en.wikipedia.org/wiki/Flat_rate_(finance))). A more precise conversion uses (2 × r × n) / (n + 1) where r is the flat rate and n the number of instalments. This matters enormously for a product like Sentryfi: many small-business lenders (especially for vehicle and equipment finance, and some microfinance) quote flat rates because they look cheaper, and a business owner comparing "6% flat" against "9% reducing balance" from another lender is being misled unless the numbers are converted to the same basis.

**What this means for the ledger:** when a user enters a loan's terms, Sentryfi should ask whether the quoted rate is flat or reducing-balance, and if flat, either convert it to an equivalent reducing-balance schedule (preferred — because that's what actually happens to the balance) or clearly label the flat schedule as flat and separately surface the effective rate so the business isn't fooled by its own paperwork.

### 2.4 Fees paid up front, and their treatment

Arrangement/processing fees, valuation fees, legal fees on security documents, LC-opening fees on trade-finance-linked loans — all commonly deducted from the amount actually disbursed, or invoiced separately at drawdown. Two things must both be visible: (a) the *contractual* principal (what interest accrues on), and (b) the *net cash received* (contractual principal minus fees withheld). Under accrual accounting, up-front fees that are part of securing the financing are typically treated as a cost of the loan and either expensed at drawdown or spread over the loan term, rather than netted invisibly against the loan balance.

**What this means for the ledger:** record the loan liability at its full contractual principal, record the fee as a separate expense (or deferred cost amortised over the term, for anyone applying stricter accrual treatment), and record cash received as the net amount — the difference must reconcile to the fee, not vanish.

### 2.5 Early settlement

Paying off a loan before term usually means: repaying the outstanding principal, any accrued-but-unpaid interest to the settlement date, and often an early-settlement fee/penalty set by the lender. Because equal-instalment schedules front-load interest, settling early after only a few payments still leaves most of the original principal outstanding — a common source of borrower surprise ("I've paid six months, why do I still owe almost everything?").

**What this means for the ledger:** early settlement needs a "settlement quote" calculation — principal outstanding as of the settlement date (from the amortisation schedule, not a linear guess) plus accrued interest plus any penalty — and the resulting payoff should close the liability to zero and record the penalty as a separate finance-cost line, not blended into "interest."

### 2.6 Arrears and penalty interest

A missed instalment doesn't just delay payment — many facilities charge penalty interest on the overdue amount (often at a materially higher rate than the contractual rate) from the due date until paid, and some also raise the effective risk classification of the loan on the lender's side. For the business, arrears must be tracked separately from the "normal" schedule: which instalments are overdue, since when, and what penalty is accruing.

**What this means for the ledger:** a loan's status needs an arrears state (current / N days overdue) independent of the base amortisation schedule, with penalty interest accruing as its own line so the business can see "what we contractually owe" separately from "what the missed-payment penalty has added."

Worked example: a business misses its month-7 instalment of MVR 10,657.71 (from §2.2) entirely, and the lender charges penalty interest at an extra 3% p.a. on the overdue amount from the due date. Thirty days later, the overdue instalment plus roughly MVR 27 of penalty interest (10,657.71 × 3% × 30/365) is owed on top of the loan continuing to amortise normally in the background — two separate running balances (the base schedule and the arrears/penalty) that a single "amount overdue" figure would obscure.

### 2.7 What the balance sheet and P&L should show, at any date

- **Balance sheet**: the loan's outstanding principal (current portion due within 12 months shown separately from the long-term portion, under most small-business reporting conventions), any accrued-but-unpaid interest as a separate short-term liability, and — for HP/finance lease/murabaha-style facilities — the matching asset and its accumulated depreciation.
- **P&L**: only the interest/finance-cost portion of each period's payment, never the principal repayment (principal reduction is a balance-sheet movement, not an expense) — this is the single most common bookkeeping error to protect against in the product.

**What this means for the ledger:** every repayment posting must always split into (at minimum) a principal line hitting the loan liability and an interest line hitting a finance-cost expense account — the UI should never let a user post a "loan repayment" as a single undifferentiated expense line, because that overstates costs and understates the remaining liability.

---

## 3. Director and owner money

### 3.1 Capital introduced vs loan

**Capital introduced** is the owner permanently putting money into the business as equity — it increases the owner's stake, is not repayable on demand in the way debt is, and has no interest. **A director/owner loan to the business** is debt — repayable (on whatever terms are agreed), and interest can legitimately be charged. The two must never be merged: mislabelling a loan as capital (or vice versa) misstates both equity and liabilities and can cause real tax and legal consequences (e.g. treating a repayable loan repayment as a tax-free capital return, or treating what's really equity as a deductible interest expense).

### 3.2 Drawings

Money (or goods, or personal use of business assets) the owner takes out of an unincorporated business (sole trader/partnership) against their equity stake — not a wage, not an expense of the business, and not, by itself, a taxable transaction at the point of withdrawal (though profit is still taxed regardless of what's drawn). For a company, the equivalent withdrawal by a director who isn't taking it as salary or dividend is a director loan (owed back) unless formally declared as a dividend.

### 3.3 Personal card used for business, business card used personally

Both happen constantly in small businesses and both are legitimate *if made visible*: a personal card paying a business expense creates a liability to the individual (they're owed reimbursement) exactly like any other payable; a business card used for a personal purchase creates a receivable from the individual (they owe the business) exactly like a director loan. The failure mode is not the mixing itself — it's letting it sit unrecorded or dumped into a generic "miscellaneous"/suspense account, where it becomes invisible to the business owner and to whoever prepares the accounts.

**Worked example of why direction matters**: a director pays a MVR 4,000 supplier invoice from their personal account (business now owes the director MVR 4,000 — a payable to them), and the same month withdraws MVR 6,000 in cash from the business account for personal use, undocumented (the business is now owed MVR 6,000 — a receivable from the director). Net the two together in a single "director account" and the balance shows the director owes MVR 2,000 — correct as a net figure, but if the two events are merged into one undifferentiated line, nobody can later answer "did the director repay the loan, or did the business simply owe them less" — a distinction that matters if either side is later challenged.

### 3.4 Why this must be visible, and the tax risk of getting it wrong (general terms)

Undocumented or long-outstanding director loans, drawings disguised as expenses, or expenses buried in suspense accounts are a recurring trigger for tax authority scrutiny internationally: a director loan account that stays overdrawn (director owes the company) for an extended period can be recharacterised as a taxable benefit or deemed distribution in many regimes; personal expenses claimed as business costs can be disallowed and penalised on review; and a business that can't produce a clean, reconciled director loan/drawings ledger loses credibility with lenders and auditors alike. This is a general-principles point — actual thresholds and treatment are jurisdiction-specific (including for the Maldives, covered in the separate Maldives tax reference) and should not be inferred from this document.

**What this means for the ledger:** Sentryfi needs first-class "director/owner" accounts (per individual, separate from generic suspense), a running balance that clearly shows direction (business owes them / they owe business), and no code path that lets a bank-feed transaction or a receipt get filed to "suspense" and forgotten — suspense should be a visible, ageing, actively-cleared queue, not a place things disappear to.

---

## 4. Banking and payment charges

Small businesses pay for banking in more ways than the monthly account fee, and most of these costs are either invisible in raw bank statements (netted against settlement) or lumped into a single "bank charges" line that hides what's actually happening.

- **Account fees**: monthly/annual maintenance, minimum-balance charges, statement fees. Recurring, predictable, straightforward expense postings.
- **Transfer fees, local and international**: local transfers may be free or a flat fee; international wires carry a sending fee, and the *receiving* bank and any **correspondent banks** in the chain often deduct their own charges before the money arrives — meaning the amount received is less than the amount sent, and the gap is a real cost the business must see, not just tolerate.
- **FX spread vs published rate**: when a bank converts currency, it rarely uses the mid-market/published rate — it applies a spread, so the effective exchange rate used is worse than the rate quoted on financial news sites. Worked example: mid-market rate USD/MVR 15.42, bank sells USD at 15.60 — on a USD 1,000 supplier payment that's MVR 180 of hidden cost (15,600 paid vs 15,420 mid-market value), with no separate "fee" line anywhere on the statement to point to. This spread is a real cost even though it never appears as an explicit charge.
- **Card acquiring / merchant discount rate (MDR) and settlement timing**: accepting card payments costs a percentage of each transaction (the MDR, split between the card scheme, issuing bank, and acquirer) plus sometimes a fixed per-transaction fee; the business receives the sale amount *net* of this fee, often batched and settled one or more days after the sale — so a day's card sales in the till/POS won't match the day's bank deposit, and reconciliation needs to bridge that timing and fee gap explicitly. Worked example: Monday's till shows MVR 12,000 of card sales at a 2.5% MDR; the acquirer settles MVR 11,700 into the bank account on Wednesday. A naive reconciliation that expects Monday's till total to appear in Monday's or even Wednesday's bank deposit, at the full amount, will show a permanent MVR 300 "unexplained" gap multiplied across every batch unless the MDR and the settlement lag are both modelled explicitly.
- **Cheque charges**: issuing, clearing, or bouncing a cheque commonly carries its own fee, still relevant in markets (including the Maldives) where cheques remain in use for larger payments.
- **Cash handling / deposit fees**: many banks charge for depositing cash over a threshold, reflecting the bank's own cost of physically handling notes.
- **LC and guarantee commissions**: opening, amending, or extending a letter of credit or a bank guarantee carries a commission (often a percentage per quarter or per annum of the facility amount), separate from any interest on drawn trust receipts (§1.6).

**What this means for the ledger:** every one of these needs to be a distinct, taggable expense category rather than a single "bank charges" bucket, and the two "invisible" ones — FX spread and MDR/settlement timing — need explicit handling: Sentryfi should reconcile the *gross* sale/transfer amount against the *net* amount received and post the difference as an identified cost (FX loss, acquiring fee), not silently absorb it into a rounding difference or an unreconciled gap.

---

## 5. Payroll fundamentals (for country packs)

### 5.1 Gross to net

Gross pay (base salary/wages, allowances, overtime, commission, bonus) less statutory deductions (employee's share of pension/social contributions, income tax withheld at source where applicable) less any other authorised deductions (loan repayments, court orders, benefit contributions) equals net pay — what actually hits the employee's account. Employer costs sit on top of gross: the employer's own share of pension/social contributions, any payroll-related levies, and (where relevant) permit/quota costs for expatriate staff — none of these come out of the employee's pay, but they are real costs to the business and must be visible as such.

### 5.2 Employer vs employee contributions

Most statutory schemes split the contribution between employer and employee — e.g. the Maldives Retirement Pension Scheme (MRPS) requires a combined 14% of pensionable wage, split as a minimum 7% from the employer and 7% from the employee (an employer may choose to cover the full 14% itself, but not reduce below the 7% employer minimum) ([Maldives Pension Administration Office, employer FAQ](https://old.pension.gov.mv/en/faq/employers); [Pension Office, MRPS](https://pension.gov.mv/en/mrps)). The employee's share is withheld from gross pay; the employer's share is an additional cost, not a deduction from the employee. **Flag:** exact current rates, thresholds, and any recent amendments belong in the separate Maldives tax reference — treat the 7%/14% figures above as indicative of the *shape* only, and verify current rates there before shipping.

### 5.3 The payslip's parts

A complete, auditable payslip needs: employee and pay-period identification; each earnings component itemised (base, overtime, allowances, bonus) rather than a single lump "salary" figure; each deduction itemised (pension, tax, loan repayment, other) with the statutory ones clearly distinguished from voluntary ones; year-to-date totals for earnings and deductions; and the employer's own contributions shown even though they don't reduce net pay, because the employee (and any auditor) needs to see the full cost of employment, not just what lands in the bank account.

### 5.4 Accruals for leave and bonuses

Leave entitlement earned but not yet taken is a real liability the business owes the employee (either as future paid leave or as a cash payment on leaving) and should accrue period by period, not appear only when someone resigns. Bonuses that are contractually or customarily expected (a 13th-month payment, a performance bonus tied to a period already worked) should likewise accrue across the period they're earned in, rather than being expensed as a single spike in the month they're paid — otherwise the P&L understates the true cost of labour in every period except the payout month.

**Worked example**: an employee earns 2.5 days of paid leave per month on a salary of MVR 15,000/month (≈ MVR 682/day on a 22-working-day month). Each month the business should accrue a leave liability of 2.5 × 682 ≈ MVR 1,705, whether or not the employee actually takes the leave that month. After six months with no leave taken, the accrued liability is ≈ MVR 10,230 — a real number that should appear on the balance sheet, not just surface as a shock expense when the employee resigns and the leave is paid out in one lump.

### 5.5 Final settlement on leaving

When employment ends, the final payslip typically needs to true up: any unpaid salary to the last working day, payment in lieu of unused accrued leave, any notice-period pay or severance where applicable, deduction of any outstanding loan/advance balance owed by the employee, and the return of any pension contributions handling required by the scheme (e.g. what happens to accrued MRPS balances). Getting this wrong — under- or over-paying a final settlement — is a common source of dispute and, for statutory items, of compliance exposure.

### 5.6 The general shape of statutory filings

Most jurisdictions require: periodic (commonly monthly) filing and payment of withheld employee tax and both employer and employee pension/social contributions; periodic reporting of total payroll and headcount to the relevant authority; and annual reconciliation/summary filings. The Maldives shape specifically involves MRPS contribution filings and, for businesses employing expatriate staff, work-permit-linked levies and quota costs administered separately from pension — both belong in the Maldives tax reference for rates and forms; this document only notes that a payroll module must be able to produce the *inputs* those filings need (gross pay, contribution base, employer/employee split, headcount by category including expatriate staff) even before Sentryfi automates the filing itself.

### 5.7 What a payroll module must store to be auditable

- Every payslip as an immutable record once issued (corrections happen via a new adjusting entry, not by silently editing history).
- Each earnings and deduction line itemised with its type (not just a total), so statutory vs voluntary, and taxable vs non-taxable, can be distinguished later.
- The contribution base used for each statutory calculation (not just the resulting number), so a rate change can be audited against what was actually applied at the time.
- Employer-cost lines (employer pension share, permit/quota costs) linked to the employee and period they relate to, separately from the net-pay liability.
- A running leave/bonus accrual balance per employee, independent of when it's actually paid out.

**What this means for the ledger:** payroll needs its own sub-ledger with employee-level, period-level granularity feeding summary postings into the general ledger (gross wages expense, employer contributions expense, net pay liability, statutory liabilities) — collapsing payroll straight into a single "wages" expense line loses the itemisation that both employees and tax authorities will eventually ask for.

---

## 6. Expense management as a discipline

### 6.1 Expense policy

A written (even if simple) statement of what the business will reimburse, at what limits, and under what conditions — the practical anchor that everything else (approval, receipt rules, per diem) hangs off. Without one, every claim becomes a case-by-case negotiation and inconsistent decisions erode trust and control.

### 6.2 Out-of-pocket claims

The classic model: an employee spends their own money, submits a claim with evidence, gets reimbursed. Simple, but slow (employees front cash and wait), and the weakest link for control because the "spend" event and the "record" event are separated in time and often in accuracy (memory, lost receipts).

### 6.3 Per diem

A fixed daily allowance for travel-related costs (meals, incidentals) instead of itemised receipts for every coffee and snack — reduces admin overhead for both employee and business, at the cost of some precision, and needs a published rate table (by destination/grade) to be fair and auditable.

### 6.4 Mileage

Reimbursement for personal-vehicle business use, typically a rate per distance unit that's meant to cover fuel, wear, and insurance together rather than itemising each. Needs a defensible rate and a record of the journey (from/to, purpose, distance) to survive scrutiny — a bare total with no journey detail is a common weak point.

### 6.5 Corporate cards and reconciliation

Cards issued to employees or departments push the spend event and the record event closer together (many modern platforms auto-import transactions), but still require reconciliation: matching each card transaction to a receipt and a business purpose, flagging anything unmatched, and closing the statement period cleanly. Corporate cards shift the control problem from "did we ever get reimbursed correctly" to "can we prove every card transaction was legitimate business spend."

### 6.6 Receipt capture and digital receipts

Photographed or emailed receipts are now broadly accepted by tax authorities in most jurisdictions in place of paper originals, provided the image is legible, complete, and retained for the required period — but the specific retention period and any format requirements are jurisdiction-specific and should be confirmed per country pack rather than assumed globally. The practical requirement for a product is: capture the image at the point of spend (not weeks later from memory), extract the key fields (vendor, date, amount, tax) reliably enough to reduce manual entry, and retain the original image alongside the extracted data, not instead of it.

### 6.7 Approval routing

Claims need to reach the right approver (manager, finance, both above a threshold) without becoming a bottleneck — the practical failure modes are approvals that take so long employees stop bothering to claim small amounts (leading to under-reporting of real costs) and approvals that are effectively rubber-stamped because the approver has no context to actually judge the claim.

### 6.8 Controls that matter

- **Segregation of duties**: the person who submits a claim should not be the person who approves or pays it — even in a very small business, this can mean the owner reviews everyone else's claims and a second person (accountant, co-owner) reviews the owner's own.
- **Duplicate detection**: the same receipt submitted twice (by accident or deliberately), or the same transaction claimed both as an out-of-pocket expense and appearing on a corporate card feed — needs automatic flagging, not reliance on a reviewer noticing. Worked example: an employee photographs a MVR 850 dinner receipt and submits it as a claim, then the same MVR 850 also lands on the company card feed three days later because they paid with the card, not cash — without a match on amount + vendor + date (within a short window, since card settlement can lag), the business pays out MVR 850 twice for one meal.
- **Policy breach flagging**: claims over a threshold, outside allowed categories, or missing required evidence should be flagged automatically at submission, not discovered after payment.

**What this means for the ledger:** every expense claim, whether out-of-pocket, per diem, mileage, or a card transaction, must resolve to the same underlying object — amount, category, business purpose, evidence, approver, payment method — so the ledger doesn't need special-case logic per submission channel; the channel is metadata, not a different data model. Segregation of duties and duplicate detection are join conditions over that same object (submitter ≠ approver; matching amount+vendor+date within a window), not bolt-on features.

### 6.9 What the leading products do, and where they fall short

- **Zoho Expense**: competitively priced with a genuinely usable free tier (up to three users), and reviewers rate its automated/AI fraud-detection features as stronger than Expensify's in some comparisons — but the free plan's user cap and feature limits (including no travel booking below its higher tier) are hit quickly by a growing small business ([Ramp's Zoho Expense alternatives comparison](https://ramp.com/blog/top-zoho-expense-alternatives)).
- **Expensify**: positions itself as expense-plus-travel in one platform and explicitly supports any corporate card (Amex, Chase, Citi, Bank of America) rather than requiring its own card — useful for businesses that already have banking relationships and don't want to switch — but its own marketing doesn't claim strong fit above roughly 1,000 employees, and, more relevantly for Sentryfi's market, its card-agnostic model still assumes a market with mature corporate card infrastructure ([Brex's Expensify competitors comparison](https://www.brex.com/spend-trends/expense-management/expensify-competitors-and-alternatives)).
- **Ramp**: built around its own charge card, which ties spend limits to the business's cash balance rather than a credit line, and card coverage skews heavily to the US — a poor fit for a business that can't or won't move banking to Ramp, and a non-starter anywhere Ramp's card isn't issued ([Brex's Expensify competitors comparison](https://www.brex.com/spend-trends/expense-management/expensify-competitors-and-alternatives)).
- **Brex**: broad global card coverage (spending in 40+ currencies claimed) with granular auto-enforced spend controls by category/merchant/transaction — strong for a multi-entity, multi-currency scale-up, but again card-centric, and that card infrastructure simply isn't available or practical in many smaller markets, including much of the Maldives' small-business segment.
- **Payhawk**: explicitly built for multi-country, multi-currency operations with structured approval and company-card management — a genuine fit for the problem this document covers, but aimed at businesses already operating across borders, not the single-location small trader.
- **Pleo**: (limited independent detail surfaced in this research pass; **flag as uncertain** — verify directly against current Pleo material before citing specific claims) broadly positioned similarly to Payhawk/Brex: a company-card-plus-software model aimed at mid-market European businesses.

**The pattern across all of them**: every major player's core value proposition is built around *issuing a corporate card* and building expense management on top of the data that card generates. That's a strong model where card infrastructure, card acceptance, and easy card issuance are all mature — and a weak-to-unusable model where they aren't. For a very small business (a handful of staff, no dedicated finance person) and for a country without mature corporate-card issuance and acceptance (a real constraint in much of the Maldives' small-business economy, where cash, bank transfer, and personal cards still dominate day-to-day spend), the entire category's default assumption — "give everyone a company card and build controls around the card feed" — simply doesn't apply.

### 6.10 What a better expense companion would do

- **Treat cash and bank-transfer spend as first-class, not a fallback.** Out-of-pocket and personal-card claims should get the same real-time capture, categorisation, and policy-checking as a card transaction — not a degraded manual-entry path bolted on because "most users have cards."
- **Capture at the point of spend, not at month-end.** A receipt photo taken immediately, with amount/vendor/date extracted automatically, beats any amount of card-feed automation if the card doesn't exist.
- **Make director/owner money visible by construction**, not by discipline — because in a very small business the "employee" submitting expenses is very often the owner, and the segregation-of-duties problem (§6.8) is structurally harder there than in any product designed around a finance team reviewing staff claims.
- **Don't require a change of bank to get spend controls.** A business that can't or won't move its banking relationship to get a corporate card should still get budgets, category limits, and approval routing on top of whatever payment method it already uses.
- **Keep the policy and the ledger in the same place.** A separate expense tool that has to be reconciled back into the accounting system is itself a control gap (data can drift, categorisation can disagree) — for Sentryfi specifically, expense capture should post directly into the same ledger this document describes, not into an adjacent silo.

---

## Sources

- [TransUnion, APR Calculator — flat rate vs APR mechanics](https://www.transunion.com/tools/apr-calculator)
- [Wikipedia, Flat rate (finance)](https://en.wikipedia.org/wiki/Flat_rate_(finance))
- [Maldives Pension Administration Office, MRPS overview](https://pension.gov.mv/en/mrps)
- [Maldives Pension Administration Office, employer FAQ](https://old.pension.gov.mv/en/faq/employers)
- [MDPI, An Overview of Islamic Accounting: The Murabaha Contract](https://www.mdpi.com/1911-8074/16/7/335)
- [Kandoo, Ijara & Diminishing Musharaka explained](https://www.kandoo.co.uk/guides/ijara-diminishing-musharaka-islamic-finance-explained)
- [Ijara CDC, Diminishing Musharaka](https://ijaracdc.com/diminishing-musharaka/)
- [Ramp, Top Zoho Expense Alternatives & Competitors 2026](https://ramp.com/blog/top-zoho-expense-alternatives)
- [Brex, Top Expensify Competitors For Expense Management 2026](https://www.brex.com/spend-trends/expense-management/expensify-competitors-and-alternatives)
