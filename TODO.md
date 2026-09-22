# Build plan

A complete, simple accounting product for founders and entrepreneurs.
A Maldives edition and an international edition, from one codebase.
Altura's own books are kept in it first, and prove it works.

Full history, rationale and design narrative behind every decision here: `docs/plan-history.md`.

---

## Where we are

| Step | What's built and live | Date |
|---|---|---|
| 1 | Ledger sealed and balanced: whole-laari money, hash-chained entries, per-company isolation | 19 Sep 2026 |
| 2 | Bills captured by photo and voice, tax treatment recorded not guessed, duplicates caught | 19–22 Sep 2026 |
| 4 | Phone board: offline queue, ten-second undo, cash tins, no-signal shell | 19 Sep 2026 |
| 7 | Sales invoices, customers, receipts, credit notes, off the purchased tool's tables | 22 Sep 2026 |
| 8 | Bank accounts and cash tins as real accounts, balances never stored | 22 Sep 2026 |
| 9 | Bank statement import reads a real 1,094-row file cleanly; not yet posted into Altura's books | 22 Sep 2026 |
| 10 | Periods and closing a month, with deliberate reasoned adjustments | 22 Sep 2026 |
| 11 | Trial balance, P&L and balance sheet, computed from the ledger, nothing stored | 22 Sep 2026 |
| 12 | Tax engine: GST rates and periods as dated configuration, a bill keeps its own rate | 22 Sep 2026 |
| 13 | GST return pack at `/tax`, MIRA-format statements; box-number mapping still open | 22 Sep 2026 |
| 14 | History import: CSV and direct Zoho, proven on a real company (Enricher Holdings) | 22 Sep 2026 |
| 15 | Multi-currency: MVR and USD accounts and bills, rate stored not recomputed | 22 Sep 2026 |
| 16 | Roles and people, cash tin handover with sign-off | 22 Sep 2026 |
| 17 | Nightly encrypted backup, proven by restore into an empty database | 22 Sep 2026 |
| — | Design review fixes: button contrast, invoice undo, currency, branding, bundle size | 19 Sep 2026 |

Live at **https://sentryfi.app**.

Checked two ways: backend guarantees via `npm run test:local`, and every screen against the real browser with `tools/*.js`, signed in as the "Sentryfi Checks" company.

---

## Waiting on people, not code

- Import Altura's real bank statement and answer its 326 questions (step 9).
- Close one real month on Altura and hand the three statements to the accountant — milestone two's own "done when".
- Key one real GST return into MIRAconnect; the accountant maps the figures to the MIRA 205 boxes and confirms the GST rate history (steps 12, 13).
- Register Sentryfi at api-console.zoho.com, set `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` on Railway, then connect Zoho and confirm the field names (step 14).
- Bring in Altura's own Zoho history (step 14).
- Rotate the demo password before real money; the leaked screenshot in the public repo's git history needs a rewrite and the owner's say-so.
- Before real money: the accountant signs off the chart of accounts, the director-money treatment, opening balances and the first return.
- Copy `BACKUP_KEY` from Railway (service sentryfi, Variables) into a password manager; without it no backup can be read.
- Decide the one leftover row in the old purchased `expenses` table: keep it or delete it.
- For the imports work: one clearing agent worksheet for an assessment, one BML or MIB charge advice for a transfer and one for an LC, and the clearing agent's GST registration status.

Accountant questions still open — GST at import, input tax timing, duty drawback, real bank charges, green tax, income tax deductibility timing, construction revenue recognition, agent disbursements — are tracked in `docs/domain/to-confirm.md`.

---

## The plan

### Phase A — Make the core complete and real

**Real money and security review.** Prove one company cannot reach another's data through any route — not only the database, but every endpoint, export, connector and cached query. The last gate before real figures. *(was step 18)*
**Done when:** the review is signed off and the "nothing here is real" line comes off the site.

**Fixed assets and year end.** An asset register, a life and method per asset, depreciation on a schedule, gain or loss on disposal, and the year closed into retained earnings with comparatives. *(was step 28)*
**Done when:** an asset bought this year shows at its written-down value unprompted, and a closed year produces comparatives.

**Dimensions.** A line can carry a project, branch, department or machine, so the ledger answers "which site lost money" without a second set of books.
**Done when:** any report can be filtered or grouped by any dimension a company has switched on.

**Money borrowed.** Loans of every kind — director loans, bank loans, hire purchase, overdrafts — with the split between principal and interest handled on each repayment.
**Done when:** a loan repayment posts principal and interest correctly without anyone doing the split by hand.

**Design system rebuilt.** Tokens and shared components rebuilt to match the settled design direction (ink, signal yellow, deep sea), then every screen moved onto them, browser checks green throughout. Do it before the modules multiply the screens. **← next**
- **Two mobile apps, at app quality.** Asked for on 23 September 2026: most people use Sentryfi on a phone, and the redesign had only covered the desk. The **main app** on a phone — for the owner, the accountant and every level that reads the books — designed as a first-class mobile app, not the desk shrunk. The **expense manager** — the phone board — for assigned field staff only: send a bill, run the tin, confirm cash received, see what is owed back. Research in `docs/domain/mobile-app-design.md`; designs on the canvas. *Done 23 Sep 2026:* the role rule — only field staff get the expense manager; everyone else gets the main app on any screen, verified live. **Done when:** both are designed from the research, built, and pass the phone, foldable and people checks, and an owner can run the business from a phone without reaching for a laptop.
  - *Done 23 Sep 2026:* settled tokens live (warmer ground, deep sea, status pairs at 4.5:1); slice 1, standing pills and statement money; slice 2, money on bank, bills, invoices and tins, and text links in deep sea. *Next slice:* the page shell — grouped rail, breadcrumb bar, one filled action per page header.
**Done when:** no screen still uses a hand-rolled colour, spacing or component the tokens should supply.

**Opening balances from a trial balance.** The importer takes Zoho's `.xlsx`/`.csv` trial balance directly, instead of opening balances being converted by hand. *(was step 14)*
**Done when:** a trial balance file sets every opening balance without manual re-entry.

**QuickBooks and Xero connections.** Same connector interface as Zoho; plus chunked reading for a large direct Zoho pull. *(was step 14)*
**Done when:** a QuickBooks or Xero company can bring its history in the same way Zoho does.

**Bank lines settle the bill they paid.** Today a bank line settles a supplier's balance as a whole; it should settle the specific bill once bills track what has been paid against them. *(was step 9)*
**Done when:** the bank screen says which bill a line paid, not just which supplier.

**Tax calendar completed.** Company Annual Fee, Withholding Tax, Remittance Tax and green tax added to the calendar and the return pack. *(was step 13)*
**Done when:** every revenue type that applies to Altura is on the deadline board.

**Receipts bundled into the return pack.** Today receipts are linked from each bill, not bundled into the filing pack. *(was step 13)*
**Done when:** the pack downloaded before filing contains every receipt behind its statement line.

**Bill reader uses the tax pack's rate.** The extraction prompt still hints 8%; it should read the rate in force from the tax pack. *(was step 12)*
**Done when:** changing the Maldives GST rate changes what the reader expects, with no code change.

**Multi-currency, finished.** Revaluing foreign balances at month end (unrealised gain/loss), the realised gain or loss on settlement, dollar sales invoices, and dollar lines in history import and bank statements. *(was step 15)*
**Done when:** a USD balance revalues correctly at month end and a dollar invoice posts and settles correctly.

**People, finished.** Spending limits per person, passkeys, ending other sessions on a password change, an administrator-issued password reset, a drafts queue for site staff's submissions, a per-spend approval limit on a tin, and an expense claim for someone who paid with no tin at all. *(was step 16)*
**Done when:** every one of those six behaviours works and is checked in the browser.

**Voice everywhere.** Cash spends and counts can be said out loud, the same way a bill can be today, with the recording kept against the entry as evidence. *(was step 2)*
**Done when:** a cash spend or count can be recorded by voice and its recording is retrievable afterwards.

**The photograph, kept.** Every bill's image stored and addressed by its own content hash, retrievable against the entry for the five years the law requires. *(was step 5)*
**Done when:** opening any bill finds its photograph without asking anyone.

**Hide what is not ready.** Any screen still reading from the purchased tool's own tables (Clients, Items) goes behind a flag until rebuilt on the ledger. *(was step 6)*
**Done when:** every reachable screen reads from the ledger and nothing on screen is a figure nobody should trust.

**Migrations framework.** The schema is still applied as idempotent SQL at every boot; it needs a proper migrations framework.
**Done when:** a schema change ships as one migration, not a rerun of the whole schema.

**Clean-ups.** About 1,600 lines found in code review: delete the purchased catalogue route and tables, the stale design-render tools, two unused dependencies (`@react-pdf/renderer`, `recharts`) and three unused UI components; share one field style, one money parser, one date formatter and one tab row instead of per-page copies; use the shared `validate` middleware everywhere.
**Done when:** the flagged 1,600 lines are gone and nothing duplicates what is now shared.

### Phase B — The adviser and imports

**The adviser.** Nothing posts unguided: on every document it decides stock vs cost vs asset, whether it belongs to an open shipment, the tax treatment, timing and duplicates — asking at most one question per document, in plain words, and remembering the answer. Includes the seventh question, reading each charge on a Customs notice or agent's invoice line by line, and the read-ask-learn rule: a charge it does not recognise is asked about once and remembered against that supplier and wording. It proposes; a person accepts; it never posts. *(was step 26b)*
**Done when:** a founder can record a container, a freight bill, an insurance premium and a laptop, each landing correctly with a reason shown, and the app asks at most four questions in total.

**Imports and landed cost.** A shipment collects every cost against it — invoice, freight, insurance, duty, bank charges, inland transport — and spreads them across the goods by value, weight, volume or count, covering FCL, LCL by CBM and air by chargeable weight. Disbursements paid on the importer's behalf are told apart from the agent's own supply. The Customs-assessed figure is recorded as charged, never recalculated or questioned. *(was step 23a)*
**Done when:** an owner opens one shipment and sees what it actually cost landed, per unit, against the invoice price — and a month later the stock on the balance sheet agrees.

### Phase C — Modules

**Projects.** Time-based work — schedule, budget by cost code, committed cost, hours, claims and certification, cost to complete — construction first, the same machinery for any project business. *(was step 19)*
**Done when:** an owner opens one project and sees spent, committed, claimed, certified and retained, each figure open to its entries.

**Procurement.** Purchase and sales orders, goods received matched to what was ordered and invoiced, partial deliveries included, spending limits and an approver above them. *(was steps 21, 27)*
**Done when:** an order, a delivery and an invoice for the same goods become one cost, not three.

**Inventory and stock.** Quantity-based stock, landed cost, margin per unit, valuation held consistently month to month. *(was step 23)*
**Done when:** stock on hand, its cost and its margin are all ledger queries, not a spreadsheet.

**Equipment and rental.** Machine register, utilisation, hours, fuel and maintenance, machine-level profitability, rate cards. *(was step 20)*
**Done when:** a machine's profitability is a report, not a guess.

**Construction.** Bills of quantity, variations, progress claims, retention, certified work, work in progress. *(was step 22)*
**Done when:** a progress claim, its certification and its retention are all tracked against the contract.

**Hospitality.** Rooms, occupancy, ADR and RevPAR, food and beverage, guest deposits, agent commissions. *(was step 24)*
**Done when:** a hotel's occupancy and revenue figures are ledger queries.

**Retail till.** A day's takings from a point of sale arrive as one balanced entry per till per day. *(was step 26a)*
**Done when:** nobody retypes a till's day from a spreadsheet.

**Payroll.** Gross to net, deductions per country, payslips, the filings that follow. Waits for the tax engine to be real everywhere it is sold. *(was step 25)*
**Done when:** a payslip posts a correct entry and the filings it produces are accepted.

**Leases and hire purchase.** What a lease puts on the balance sheet and through the P&L, for companies whose auditors apply IFRS 16. *(was step 26a)*
**Done when:** a financed machine is on the balance sheet at the right figure without anyone computing it by hand.

**Group and consolidation.** Several companies, intercompany balances that eliminate, one set of statements for the group. *(was step 29)*
**Done when:** a group statement balances, intercompany balances cancel, and each company's own books are unchanged by being consolidated.

**The rest of the money.** Quotes that become orders and invoices, repeat billing with a reminder ladder, expense claims for people without a tin, time against a job, approvals with a record of who said yes, budgets against actuals, a payment run that pays several suppliers and matches back, a customer portal to see, pay and query. *(was step 27)*
**Done when:** a small business can quote, bill, chase, claim, approve and pay from here without a spreadsheet beside it.

### Phase D — Across everything

**Offline everywhere in the field.** Bills already queue and send themselves with no signal; the same must hold for cash spends, counts, deliveries received and confirming money handed over. *(was step 26)*
**Done when:** a supervisor with no signal can do their whole job.

**Guided and teaching.** Opening books, bringing history in, the first bill, close and return walked through in the app; one sentence beside each figure explaining why. *(was step 26)*
**Done when:** a founder who has never kept books opens theirs without outside help.

**Made for AI to work with.** Beyond the reader, a documented interface for a company's own assistant and other software — the same door a person uses. It may read, draft and propose; it may never post. *(was step 26)*
**Done when:** an assistant can read everything and post nothing, and every draft it makes ends at a person's name.

**Analytics traceable to entries.** Which site made money, who pays late, what the month costs before it ends, what is committed but unspent — every figure open to the entries behind it. *(was step 26)*
**Done when:** no analytics figure exists that cannot be clicked through to its entries.

### Phase E — Sellable

**Second country pack and e-invoicing adapters.** A pack proves the shape is a shape, not a special case: rates, invoice rules, periods, withholding, and where mandated — Peppol, ViDA, ZATCA, MyInvois, the Indian IRP — the format and clearance step. *(was step 30)*
**Done when:** a company in a second country keeps correct books and files without a line of ledger code changing.

**Dhivehi and right-to-left.** Thaana reads right to left; rails and rows mirror, numbers never do. *(was step 31)*
**Done when:** the same screens read correctly in Dhivehi and no figure moves.

**Being bought.** Self-service sign-up and trial, plans by modules/companies/people/storage, a practice portal for an accountant running several clients, a documented API and webhooks. *(was step 32)*
**Done when:** somebody who has never met us opens books, brings their history in, and pays, unassisted.

**Being trusted.** Data residency answered plainly, a status page, a way to reach a person, the security review repeated whenever a connector or export is added. *(was step 33)*
**Done when:** a cautious buyer's questions have answers on a page, not in a conversation.

### Phase F — On top

**The watching layer.** Continuous reconciliation, anomalies raised as they happen, cash now/expected/committed/forecast kept as four distinct figures, questions answered from the ledger with workings shown. Reads and drafts only, never posts. *(was step 34)*
**Done when:** an anomaly is raised the week it happens, not at month end.

**The expense companion app.** A separate, lighter app for capturing personal or team expenses on the move, feeding the same ledger through the same door as everything else — for people who need expense capture without the full accounting product.
**Done when:** an expense captured in the companion app appears in the main books with nothing re-entered.

---

## Rules of the work

- **Gated commits.** Lint, build and tests must pass before anything lands.
- **Verify every UI change in a real browser** — `tools/*.js` against a live Chrome, not a guess from the code.
- **One thing at a time, finished.** The old store is removed in the same step that replaces it; two record stores never coexist longer than one step.
- **Nothing posts without a person.** Capture and connectors propose; a person accepts.
- **Tax rules are configuration, never code.** A new country is a pack, not a rewrite of the ledger.
- **Nothing is deleted.** A correction is a reversing entry with a reason; the original stays.
- **One step at a time.** Keep this file current — an item leaves "the plan" when it is done and says so in "Where we are".
- **Token efficiency.** Cheaper models for research and bulk rewrites; read only the part of a file you need; use `docs/domain/*` instead of re-researching what is already settled.

---

## References

`PRODUCT.md`, `DESIGN.md`, `docs/domain/*`, `docs/plan-history.md`.
