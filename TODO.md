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
- For the imports work: a Customs assessment for a shipment, and one BML or MIB charge advice for a transfer and one for an LC. (The clearing agent's invoice and GST status arrived 23 Sep 2026: not registered.)

Accountant questions still open — GST at import, input tax timing, duty drawback, real bank charges, green tax, income tax deductibility timing, construction revenue recognition, agent disbursements — are tracked in `docs/domain/to-confirm.md`.

---

## Build order

The phases below say *what*; this says *when*. Set 23 September 2026. Each sprint ends deployed, checked in a real browser, and recorded here. Reorder when the owner says so, never silently.

**Sprint 1 — The phone, because that is where people are**
1. Shared mobile parts, built once: tab bar, bottom sheet, money row, day header, standing pill, empty state, offline line, undo strip.
2. The main app on a phone: Home (cash card, thirty-day trend, Needs you), the Record sheet, Money (bills and invoices, swipe for the common action), More.
3. Bank lines on the phone, one card per line.
4. The expense manager's navigation settled (Home, Tin, Send, Owed back, Me), with Owed back for money paid out of pocket.
5. The desk shell: grouped rail, breadcrumb bar, one filled action per page (design slice 3).

**Sprint 2 — A complete core**
6. Fixed assets and year end.
7. Money borrowed: every kind of loan, repayments split for you.
8. Dimensions: project, branch, department, machine on any line.
9. Multi-currency finished: month-end revaluation, dollar invoices.
10. People finished: Face ID and fingerprint sign-in through passkeys, spending limits, password reset.
11. The security review that gates real money for companies other than Altura.

**Sprint 3 — Stock, the adviser, and imports (the owner's live problem)**
12. Stock: items, quantities, what they cost, what a sale earned.
13. The adviser: stock or cost or asset, the charges on a document read, asked and learned.
14. Shipments and landed cost: freight by container, CBM or chargeable weight; the agent's disbursements; Customs as charged.

**Sprint 4 — The business modules**
15. Projects, construction first: budget, committed, claims and certification, retention, cost to complete, watched.
16. Purchase orders and sales orders, deliveries received against them.
17. Quotes, repeat billing, expense claims, approvals, payment runs, the customer portal.

**Sprint 5 and after**
18. The CFO and the morning brief.
19. Offline everywhere in the field; guided first-run; the documented interface for AI and other software.
20. Sellable: a second country pack, Dhivehi and right to left, sign-up and plans, the practice portal.
21. The expense companion app.

**Now:** Sprint 5, item 20: sellable. *Item 19 done 23 Sep 2026:* **Offline in the field**: every write from a phone carries its own key and happens once, however often a weak signal resends it (request_keys, per person, out of the app role's reach); cash spends, counts, asking for more, cash received, deliveries, expense claims and stock counts are kept on the phone with no signal and send themselves; the app opens with no signal on its last answers (who you are, your companies and role, your tins; forgotten on signing out); the waiting list names each thing and what the server refused, which can be let go. `tools/field.js`. **Guided first run**: Getting your books going, eight steps ticked off from the books themselves (details, bank, opening, first bill, first invoice, logo, people, first close), the next one with why and where, on Home on the desk and phone; each figure on Figures says what it counts. `tools/setup.js`. **For AI and other software**: keys a person makes (Settings, Assistant) acting as them in one company, read only or read and draft; a draft key makes draft bills, draft invoices and orders waiting for approval and nothing else; posting, approving, paying, receiving and closing are refused whatever the person's role; keys reach the books only (never sign-in, passwords, backups, settings or other keys); every write logged; off in one tap. OpenAPI at /api/openapi.json; an MCP server at /api/mcp through the same door. `tools/assistant.js`; tests 239, security 87. *The phone, refined, 23 Sep 2026 (owner's reference):* white cards on a soft lift, one black card per screen, yellow for one thing, icons in pale circles, a greeting in the top bar, a floating pill tab bar (DESIGN.md, "The phone, refined"). Home rebuilt (cash, how long it lasts, figures to swipe, money out by month, where the cash is, needs you); More with icons; every bordered card on a phone lifts by one rule. The CFO redone the same way on phone and desk: cash and the next thirty days in the black card, the morning in five parts, checks folded and filtered by Act / Watch / Good, shares as thin bars. Ask the CFO now answers from what it has read when it runs out of rounds (it used to give up). Still in the old register: the expense manager's board (site staff and cash holders), and inner pages beyond their cards and headings. *Branding and documents redesigned, 23 Sep 2026 (owner's review):* two panes like a form beside its paper (one Editing picker, a few tabs, labels inside the fields, chips, a save bar with undo), after the owner's Ofacc+ reference. Eight ready-made designs (Minimal, Soft and Edge light; Classic, Elegant, Band, Bold, Compact); changing one keeps the company's own copy, and copies can be copied, renamed, deleted and put on every kind. QR code: check it is genuine (a public page at /v/<fingerprint> reads the issued copy and says if it has been cancelled since), how to pay, or the website. A signature drawn with a finger or mouse. The rail regrouped (Needs you; Buying and selling; Money; Work and assets; The books; Company at the foot) and folding; the invoice list's columns aligned. `tools/documents.js` (18 checks); tests 236, security 77. *Documents, done 23 Sep 2026 (before item 19, as asked):* one drawing for every document (preview beside the form, the page, print and PDF, the customer's link), sized in millimetres: A4, Letter, A5, 80 and 58 mm receipts. Branding and documents: logo (colours read from it), colour with a contrast check, typeface, details, stamp and signature (paper taken out of a photo), how to pay, footer; a template per kind (invoice, quotation, sales order, purchase order, delivery note, goods received note, credit note): classic, modern or compact, paper, columns, what shows, title, notes, terms, every label; English, or English and Dhivehi (suggested Thaana labels, to be checked by a Dhivehi writer); industry starting points (construction, trading and import, services, resort and tourism, retail). A tax invoice always says Tax Invoice with TIN, GST number, rate and GST, and GST in MVR in another currency. A new invoice is a page with the invoice drawn beside the form. Invoices and credit notes keep their issued copy with a fingerprint; the app role cannot change or remove it. `tools/documents.js` (13 checks); tests 235, security 77. Open: server-made PDF attachments for email (print to PDF today), a QR code to the customer's link, AI filling the form from a sentence, receipts and statements as documents, Dhivehi labels checked by a native writer. *Item 18, first half, done 23 Sep 2026:* The CFO (Needs you): four figures kept apart (cash now; due in and due out over 30 days, each opening onto its invoices, schedules, bills, claims, orders and loan instalments; what that leaves); anomalies the week they happen (a cost at twice its usual week, a bill far above its supplier's usual, customers sixty days late, each with its entries); a profile from a year of books (what it sells, to whom, suppliers, cost structure, margin where goods are sold, busiest and quietest month, financing) that takes the owner's notes; a market note from the rates the company records, put into its own figures with source and date; and the morning brief (headline, yesterday, today, noticed, market, learned), kept per day, read aloud, and emailed at each person's hour. It never posts. `tools/cfo.js`; tests 226, security 71. *Second half, 23 Sep 2026:* the written summary and advice now come from Gemini (the key already on Railway); the CFO checks the business as a CFO would (runway, current and quick ratios, days to get paid, to pay and for stock to sell, the cash cycle, profit and goods margin now against before, revenue against a year ago, costs growing faster than revenue, the biggest customer, bills in other currencies, repayments covered by profit, GST to keep aside and when it is due, stock not sold in 90 days, projects over budget or heading for a loss, and whether the books are up to date), each with a verdict, a plain explanation and its figures; Ask the CFO answers questions from the books through read-only tools (figures, checks, profile, account balances, invoices and bills, month by month, the journal) and cites only entries and documents the tools returned. Push, 23 Sep 2026: every notification goes to each person's inbox under the bell ("What happened") and to every device they turn notifications on for (the switch under the bell, and on More on a phone; an iPhone or iPad needs Sentryfi added to the Home Screen, iOS 16.4 and later). Told as it happens: a claim, a purchase order or a bill over someone's limit waiting for approval (to those who approve); a claim approved or sent back and an order approved (to whoever made it); repeat billing raising invoices; a customer opening their link. Hourly: anything new in Needs you (at risk and blocked again each day it is still true, waiting and ageing each week; more than three at once become one push) and the morning brief at each person's hour. VAPID keys are made once and kept in the database; devices and keys are out of the app role's reach. Tests 231, security 74. *Still waiting on the owner:* which outside sources to read for the market (MMA rates, fuel, freight into Malé, Customs changes, tourist arrivals). Scenarios ("what if I buy the second excavator?") later. **Sprint 4 done 23 September 2026.** *Item 17 done 23 Sep 2026:* quotes (QT-0001, good until a date; accepted, a sales order with the same lines; declined or past its date, kept); repeat billing (every week, month, three months or year, keeping its day of the month, raising each missed date, stopping at its end or while paused, optionally posting itself; raised by an hourly job and whenever Needs you opens); expense claims (EC-0001, line by line, approved by someone else within their limit onto each cost and owed to the person on 2400); Approvals (orders, claims, and bills over their recorder's limit, in one list; an approver may post a bill); payment runs (bills and claims paid from one account in one entry, never more than owed, with the transfers to make and each supplier's account number, downloadable for the bank); the customer portal (a private link per customer to their invoices, what they owe and how to pay; no account, read-only, printable, turned off in one tap; the link table is out of the app role's reach). `tools/sprint4.js`; tests 221, security 70. Open: a bill paid by explaining a bank line is not tied to the bill in Payments; claims have no receipt photo yet; the portal shows invoices in our own currency only. *Item 16, orders, done 23 Sep 2026:* purchase orders (PO-0001) are approved by whoever orders them when it is within what they may approve (the approve right and their spending limit), and otherwise wait for someone whose limit covers them, shown in Needs you; nothing is received against an unapproved order. Deliveries record quantities (never more than ordered, several allowed) and post nothing. The bill is made from what arrived and is not yet billed, at the ordered prices unless the supplier's differ (reported), split into stock and costs line by line, and skips the spending-limit check because the order was approved: the order, its deliveries and its bill are one cost. Sales orders (SO-0001) go out and are invoiced from what went out, stock leaving at average cost. Open purchase orders on a project count as committed there until billed. Cancel before anything moves; close to stop expecting the rest. `tools/orders.js`; tests 213, security 65. *Item 15, projects, done 23 Sep 2026:* a project has a customer, a contract value, retention (a percentage up to a cap on the contract) and a budget by kind of cost. Orders and subcontracts are committed until billed against; a bill against one is charged to its kind of cost. Progress claims are cumulative; a certificate is the certified value to date less what was certified before, invoiced less its retention, which is revenue held by the customer (1310) until released and invoiced. Spent, revenue and retention are ledger queries, each figure on the page opening to its entries; the forecast takes the larger of budget and spent plus committed, per kind; an overrun shows in Needs you. `tools/projects.js`; tests 208, security 64. Open: variations to the contract, hours, and a bill of quantities come with item 16 and later. **Sprint 3 done 23 September 2026.** *Item 14, shipments and landed cost, done 23 Sep 2026:* a shipment is a bill of lading with its containers (CBM); the bills linked to it are its goods. Every landing cost waits on 1360 until shared: a bill line said to be for the shipment (freight on the supplier's invoice, the clearing agent's lines) or Customs and bank charges paid directly. Shared by value, by weight, or by container space (CBM, then value within each container); goods on hand carry their share into their average cost, goods already sold send theirs to cost of goods sold. Import GST paid at Customs is claimed by a registered company. A bill whose costs are shared cannot be reversed quietly. The adviser puts a clearing agent's lines on the open shipment and keeps sizes (10mm vs 16mm) apart. Built against one real shipment (56 t of rebar, two 20ft containers, USD CNF invoice, a clearing agent not GST-registered; in `docs/real-world-samples/source/`, git-ignored). `tools/shipments.js`; tests 206, security 63. Still wanted from the owner: a Customs assessment (duty and import GST lines) and a BML or MIB charge advice for a transfer and an LC, to confirm how those read. *Item 13, the adviser, done 23 Sep 2026:* bills are read line by line (photo and voice); "What it was for" on each bill suggests stock, a cost on its own account, or an asset, from what was decided for this supplier before, then any supplier, then stock item names, then the words on the charge (a lasting thing over MVR 15,000 goes on the register). Only a decision for this supplier's same charge is sure; everything else is asked with its reason, and what is saved is learned (months ignored, so a monthly charge is asked once). A bill whose every line is sure goes in split without asking; otherwise it goes in as one general cost as before. Stock to 1350, costs to their accounts, assets onto the register; reversing takes an asset back off unless depreciated. `tools/adviser.js`; tests 198, security 62. *Item 12, stock, done 23 Sep 2026:* items; weighted average cost for the whole company; a bill says which items it brought in (Bills, Stock) and the rest of it stays a cost; an invoice line picks an item and posting takes it out at average cost in the same entry; nothing goes below zero; the value on hand always equals Stock on hand (1350); counts to 5870, stock already held to 3900 Opening balances; a reversed bill takes its stock back out unless some was sold; margin per item. `tools/stock.js`; tests 191, security 61. Open on purpose: a credit note does not return stock (count it back), a back-dated bill does not re-cost earlier sales, no reorder levels or locations yet. **Sprint 2 done 23 September 2026**, each item deployed and checked live:
- 6. Fixed assets and year end: a register by kind, straight-line or reducing-balance depreciation charged monthly on a cumulative target (closed months catch up; the last month lands on the residual), selling or scrapping with its gain or loss, closing a year (depreciation first, then the books closed through 31 December), earlier years' earnings apart from this year's, and last year beside this year on the statements. `tools/assets.js`.
- 7. Loans of every kind (bank, hire purchase, finance lease, trust receipt, murabaha, ijara, diminishing musharaka, director loans both ways): schedules, a flat rate shown with its real yearly rate, every repayment split into debt and cost (the lender's figure wins), asset finance paying for an asset on the register, overdue instalments in Needs you. `tools/loans.js`.
- 8. Dimensions: project, branch, department and machine on bills, invoices and cash spends; sealed in the hash (v2; untagged entries keep their v1 seal); profit and loss filtered or split by any kind. Settings, Tracking. `tools/dimensions.js`.
- 9. Multi-currency finished: invoices in another currency, paid in it with the realised exchange gain or loss on its own line, and month-end revaluation of everything held or owed in another currency (on Closing). Credit notes on foreign invoices refused until they carry their own rate. `tools/currency.js`.
- 10. People finished: Face ID and fingerprint sign-in (passkeys), a bill limit per person, an administrator's reset link (only for someone in that company alone), and every other session ended on a password change. `tools/passkeys.js`.
- 11. The security review: passed with fixes; see `docs/security-review-2026-09-23.md` and `npm run test:security` (51 checks). Open on purpose: composite foreign keys, enforcing the content policy, rotating the demo password.
- Found on the way: five forms filled in yesterday's date before 5am (UTC, not local); fixed.
- Email, 23 Sep 2026 (after Sprint 2): Resend on sentryfi.app. Confirm the address at sign-up (closes the review's open item), Forgot password by email, alerts on password changes and new Face ID devices. One sender per kind: accounts@, security@, and support@, which receives mail and forwards it to sentryfi.app@gmail.com. `tools/email.js`; security suite 58 checks.

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

**Design system rebuilt.** Tokens and shared components rebuilt to match the settled design direction (ink, signal yellow, deep sea), then every screen moved onto them, browser checks green throughout. Do it before the modules multiply the screens.
- **Two mobile apps, at app quality.** Asked for on 23 September 2026: most people use Sentryfi on a phone, and the redesign had only covered the desk. The **main app** on a phone — for the owner, the accountant and every level that reads the books — designed as a first-class mobile app, not the desk shrunk. The **expense manager** — the phone board — for assigned field staff only: send a bill, run the tin, confirm cash received, see what is owed back. Research in `docs/domain/mobile-app-design.md`; designs on the canvas. *Designed 23 Sep 2026:* bank lines one card per line, and a thirty-day cash trend on Home, both on the canvas. *Gaps found against Xero, QuickBooks and Zoho Books (23 Sep 2026):* explain bank lines on the phone, one card per line (Xero's strongest mobile feature); a cash trend on the Home card, not only today's figure; a pay-now link on an invoice; Face ID or fingerprint sign-in through passkeys; notifications asked for at a useful moment. Deliberately not copied: automatic GPS mileage (boats and fuel matter more here), and a separate app for staff expenses (one install, the role decides). *Done 23 Sep 2026:* the role rule — only field staff get the expense manager; everyone else gets the main app on any screen, verified live. **Done when:** both are designed from the research, built, and pass the phone, foldable and people checks, and an owner can run the business from a phone without reaching for a laptop.
  - *Done 23 Sep 2026:* settled tokens live (warmer ground, deep sea, status pairs at 4.5:1); slice 1, standing pills and statement money; slice 2, money on bank, bills, invoices and tins, and text links in deep sea. Slice 3, the page shell (grouped rail, breadcrumb bar, one filled action per page), done 23 Sep 2026.
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

**The CFO: watches, guides, advises.** Asked for on 23 September 2026, and it absorbs what was "the watching layer" (old step 34) and the analytics of D4. An advisor built into the product that learns this business and keeps learning, and brings the outside world to it:

- **It learns the business.** From the ledger and the answers the owner gives: what the company sells, to whom, its suppliers, its seasons, its margins by line, its cost structure, how it is financed. The profile is visible and correctable, and it grows with every month of books.
- **It watches.** Continuous reconciliation, anomalies raised the week they happen, and four figures kept apart: cash now, expected in, committed out, and a forecast.
- **It reads the market, here and abroad, and translates it into this company's numbers.** Maldives: MMA and Customs exchange rates, MIRA and Customs changes, the gazette, fuel and freight into Malé, tourist arrivals for anyone whose customers depend on them. Abroad: freight indices, commodity prices for what the company imports, exchange rates, interest rates. A market note says what changed and what it does to *this* business: "freight from Jebel Ali is up about 12% — your next container of fittings costs about MVR 4,000 more landed, and LED margin falls from 22% to 19%."
- **Every morning, a brief.** Three minutes, at a time the owner chooses, in the app and as a push where the phone allows, and readable aloud in Dhivehi or English for the drive to site: what changed since yesterday, what to do today, one market note in the company's own figures, one thing learned. Drawn on the canvas as "The CFO's morning brief".
- **Practical and creative.** Specific actions with a figure attached, never generic advice; a scenario on request ("what if I buy the second excavator?"); a question answered from the books with the entries behind it.

The rules that do not bend: every figure opens onto its entries, and every market claim carries its source and date — an advisor that cannot show its working is guessing. It advises and drafts; it never posts. It says when it is unsure. It is a skill the product grows: its knowledge of each company lives in the company's own records, and its knowledge of the world is refreshed daily, shared across companies so it is gathered once. Built on the Claude API with the model chosen per job — a small model to gather and summarise, a larger one to advise — so a brief costs cents, not dollars.
**Done when:** an owner reads the brief every morning because it is worth reading: it caught something before month end, put a market change into their own figures, and taught them one thing — and every claim in it could be checked.

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
