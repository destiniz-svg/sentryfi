# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

npm workspaces. Backend is Express 5 on Node, talking to PostgreSQL through `pg` with hand-written SQL — no ORM, because the ledger's guarantees live in constraints, triggers and row-level security, and an ORM's job is to hide exactly that. Zod validates every request. Sessions are JWT in an http-only cookie with bcrypt password hashing. Google Gemini reads photographed bills. Frontend is Vite, React 19, Tailwind v4, TanStack Query v5, framer-motion and @react-pdf/renderer, route-split and served by the same Express process, so Railway runs one service. Hosted on Railway, Singapore region. Playwright drives the system Chrome for looking at what has been built.

Recorded 19 September 2026 by reading what is deployed. The previous entry here described Next.js 15, Drizzle, Better Auth, Cloudflare R2, Anthropic vision and Microsoft Graph; none of those are in the repository, and a stack section that describes an intention rather than a fact is worse than none.

## Users

**Roles follow the pattern any accountant already knows**, so an accountant opening Sentryfi recognises the permission model without being taught it, and a business moving from another product does not have to invent a mapping. Two roles are added on top, because a construction company works on site and the standard set has nowhere to put those people. Revised 19 September 2026.

Roles are held per company, not per person, so the same individual can be an administrator in one entity and a viewer in another. A person may hold more than one.

### On the desk

- **Administrator.** Everything, plus adding people and changing settings. Abdulla Thinan, owner and director of Altura Pvt Ltd, part of the Steva Enterprises group. A non-accountant who builds the app himself with Claude Code and uses it on his phone on site, one-handed, in bright sun. His three hardest jobs: clearing a backlog of bills, tracking cash against bank against who funded what, and GST.
- **Accountant.** A licensed Maldivian accountant or a group CFO. The books: adjustments, closing a month, the return, the full trail. Can correct anything with a reason and delete nothing. Signs off the chart of accounts, the funding treatment and each filing.
- **Manager.** The daily work: record bills, raise invoices, take payments, chase what is unpaid, import the bank. Cannot change settings, the chart of accounts or tax rules. This is the office admin role under its standard name.
- **Approver.** Says yes or no to spending above a limit, and nothing else. Exists so a procurement officer on site can buy without waiting, up to a figure, and cannot commit the company beyond it.
- **Viewer.** Reads, never posts. The other directors of Altura and the Steva companies sit here, watching what they have put in and what the project has spent. They never record their own contributions; an administrator or manager does.
- **Auditor.** Reads everything, including the full trail, from outside, and changes nothing. Reviews a closed period against the archive.

### On the phone

- **Site staff.** Photograph a bill, tag the project. They see no money at all: no balances, no other people's bills, no books. Untrained in bookkeeping, often on poor connectivity, sometimes with gloves or wet hands. Their queue survives a day offline.
- **Cash holder.** Site staff who also hold a cash box. They spend from it with a bill or without one, count it when asked, and ask for a top-up. They see exactly one number, what is left in their own box, and never a company balance. They can never move money themselves. Shaped in `docs/shape-petty-cash.md`.
- **Procurement officer.** Buys for the site. Records what was ordered, confirms what arrived, and carries a spending limit. Sees their own orders and their own limit, and nothing else. Added 19 September 2026; the scenario it exists for is in Capabilities.

### Not yet

- **Future customers**, not at launch: owners of other Maldivian small businesses in the industries the plan names. Multi-tenant from day one so they can be added without a rewrite. Public sign-up, billing and self-serve onboarding are out of scope for the first release.

## Product Purpose

**A complete accounting core that any business can keep its books in, with the modules and the tax rules it actually needs switched on. Altura's books are kept in it first, and prove it.**

**Who it is for, said plainly (22 September 2026): founders and entrepreneurs, and the point is to make accounting simple for them.** Not accountants first, though an accountant must be able to sign off everything in it. The person this is built for started a business to do the work, not to keep books, and every decision — the plain words, the camera, the three taps, the app asking only when it is genuinely unsure — serves that. Simplicity is the product; correctness underneath is what makes the simplicity honest.

Three parts, in this order, decided 19 September 2026 after reviewing the 2026 market research on automated accounting against what is built:

1. **The core is finished to 100% before anything is built on it.** Not most of it. A double-entry system that is 80% complete is not 80% useful — it is a system whose figures cannot be trusted, because the missing fifth is where the money went. The core is listed below and nothing in it is optional.
2. **Every other capability exists, and each one is switched on per company.** A contractor turns on projects and retention. A rental business turns on machines and utilisation. A hotel turns on rooms and occupancy. Nobody is shown a module they do not use, and nobody is told a capability does not exist because their industry is not the one the product was built for.
3. **The tax rules are configuration, not code.** A Maldivian company gets GST at 8%, the inclusive-or-exclusive question, unregistered suppliers, TIN and GST numbers, and the MIRA return formats. A company anywhere else gets its own rates, its own periods and its own forms. The core does not know what country it is in; the pack does.

Altura is the proving ground rather than the specification. Every bill recorded within minutes of arriving, every return filed from the app on time — if it cannot do that for one construction company in the Maldives, the wider product is a claim rather than a fact.

Sentryfi's promise to the person using it stays "Snap it. Record it. Done." Photograph a bill, check what was read, confirm. Behind the plain-language interface a correct double-entry ledger keeps the books right without anyone reading the word debit.

## The Core

Finished to 100%. This is the list, and the build plan in `TODO.md` works through it in order. A capability is in the core when the books are wrong without it.

- **The ledger.** Double-entry, whole-laari integers, balanced entries enforced by the database, a hash chain so an altered record shows, and each company's books sealed off by the database rather than by queries remembering to filter. *Done 19 September 2026.*
- **The chart of accounts.** Per company, editable, with a sensible starting set.
- **Money owed (AP).** Bills, supplier accounts, how their tax was quoted, duplicate detection, approval, payment.
- **Money owed to you (AR).** Sales invoices, customer accounts, receipts, what is overdue.
- **Cash and bank.** Accounts, balances, transfers, cash boxes held by named people.
- **The bank agrees with the books.** Statement import per bank's own format, matching, and an exception list a person clears.
- **Periods and closing.** A period that can be closed, and closed periods that refuse new entries without an adjustment.
- **Financial statements.** Trial balance, profit and loss, balance sheet, produced from the ledger and not from a document.
- **Multi-currency.** Held in the currency transacted, reported in the company's own, with the rate used recorded rather than recomputed.
- **The tax engine.** Rates, periods, treatments and forms as versioned configuration, so a rate change does not rewrite history and a new country does not need new code.
- **Who may do what.** Roles per company, capabilities not job titles, enforced in the database. *Foundation done 19 September 2026.*
- **The paper.** Every record's supporting document attached, addressed by content hash, retrievable by name for as long as the law requires.
- **The trail.** Nothing deleted, every correction a reversing entry carrying a reason, and every change answerable as who, when and why.
- **Fixed assets.** An asset register, a life and a method per asset, depreciation posted on a schedule, and the gain or loss when one is sold. A balance sheet carrying equipment at what it cost five years ago is wrong, and every business that owns a machine has this problem.
- **Year end.** The year closed, the profit rolled into retained earnings as an entry with a date on it, and the comparative figures that every statement shows beside this year's.
- **Dimensions.** A line can carry a project, a branch, a department or a machine, so the same ledger answers "which site lost money" without a second set of books. The dimensions a company uses are its own; the ledger only knows that a line may carry them.
- **Backups, proven.** The whole database copied nightly, encrypted, kept away from the server, and restored into an empty database to prove it comes back. Software holding the only copy of a company's books and no proven restore is a liability, not a product. *Done 22 September 2026.*

## Modules

Each one is switched on per company and invisible when it is off. None of them may change how the core records money; they add dimensions, documents and screens on top of it. The list was completed on 22 September 2026, when the product stopped being built only for Altura and started being built to sell.

**Money, beyond the core**

- **Quotes and orders, both ways.** A quote a customer accepts becomes a sales order and then an invoice; a purchase order goes out, the delivery is received against it, and the supplier's bill is matched to both before it is paid. Nobody types the same figures three times, and a short delivery is caught before the money leaves.
- **Stock.** What is on hand, what it cost to land here, what it is worth, and what a sale of it earned. Counted, adjusted with a reason, and valued the same way every month.
- **Imports, and what a container really costs.** A shipment gathers everything that arrives against it over the weeks it takes — the supplier's invoice in its own currency, freight, insurance, customs duty, the clearing agent, the bank's charges on the transfer, inland transport — and spreads them across the goods to give a true cost per unit. It knows which of those belong in the cost of the goods and which do not, tells the owner what has not arrived yet, and says plainly how much more than the invoice price the goods actually cost. Asked for on 22 September 2026: this is the thing an importing business most often gets wrong, and it is wrong in the direction of thinking it is making money.
- **Repeat billing.** Invoices that issue themselves on a schedule, retainers, and a reminder ladder for what is late — the ordinary way a small business collects money.
- **Expense claims.** Money a person spent out of their own pocket, with the photograph, approved and paid back. The cash tin covers a float; this covers everyone without one.
- **Time.** Hours against a project or a job, charged out or costed in, and the same hours feeding payroll where payroll is on.
- **Approvals and limits.** What a person may commit without asking, what needs a second name, and the record of who said yes.
- **Budgets and the year ahead.** A budget per account or dimension, budget against actual on every report, and a cash forecast built from what is already owed and owing.
- **Paying suppliers.** A payment run: what is due, what is selected, one file or one transfer, and the bank line matched back automatically.
- **Getting paid.** A payment link on an invoice, and the receipt recorded when it clears. Card and bank rails differ by country and are part of the country pack.
- **A door for the customer.** A page a customer opens to see what they have been invoiced, what they have paid, and what is still owed, to download an invoice, to pay it, and to raise a query against a line. The same for a supplier: what we have of theirs, and what we have paid. It is the company's own records shown outward, not a second set.

**Industry packs**

- **Projects, and the work that takes time.** Its own module, asked for on 23 September 2026, and the one most of these businesses live in. A project is anything with a start, an end and money moving through it: a contract, a fit-out, a survey, a design job, a boat refit, a client engagement. It holds the schedule and the phases, the budget by cost code, what has been spent and committed so far, the hours people and machines put in, what has been claimed and certified, what is retained, and what it will cost to finish. It is watched rather than merely recorded: an owner is told when a project turns, not when the year closes. Construction is the sharp case — bills of quantity, variations, progress claims, certification, retention, mobilisation recovery, work in progress, revenue over time — and every other project business is the same machinery with fewer parts.
- **Procurement.** Purchase requests, orders, goods received, three-way matching, spending limits and approvals.
- **Construction.** Bills of quantity, variations, progress claims, retention, certified work, work in progress.
- **Equipment and rental.** Machine register, utilisation, hours, fuel and maintenance cost, machine-level profitability, rate cards.
- **Inventory and fuel.** Quantity-based stock, landed cost, margin per unit, opening plus purchases less sales equals closing.
- **Hospitality.** Rooms, occupancy, ADR and RevPAR, food and beverage, guest deposits, agent commissions. In the Maldives this covers guesthouses, liveaboards and resorts, which are three different businesses with one tax regime.
- **Retail and the till.** A day's takings from a point of sale arriving as one balanced entry per day per till, not as a spreadsheet somebody retypes.
- **Petty cash.** Boxes held by named people, spending with or without a bill, counts, top-ups, reimbursement. *Done 22 September 2026.*
- **Payroll.** Gross to net, the deductions each country requires, payslips, and the filings that follow. Built per country, like tax.
- **Leases and hire purchase.** What a lease puts on the balance sheet and what it puts through the profit and loss, for companies whose auditors apply IFRS 16.

**For the group, and for the accountant**

- **Group and consolidation.** Several companies, intercompany balances that eliminate, and one set of statements for the group. Altura is already a group; most of the businesses buying this are.
- **The accountant's view.** The same books in the words an accountant uses, with the journal, the trail and the working papers behind each figure, and a practice signing off several clients from one place.
- **Reports of their own.** The standard statements, plus a report somebody builds once, saves, and has emailed to them every month.

## Where it is sold, and in what edition

Two editions of one product, decided 22 September 2026. The ledger, the screens and the modules are the same in both; what differs is the pack that sits on top.

**The Maldives edition.** Everything a Maldivian business is asked for by MIRA, in the words a Maldivian accountant uses: GST at 8% general and 17% tourism with the full rate history, the inclusive-or-exclusive question that an unregistered supplier makes unavoidable, TIN and GST numbers, the return keyed into MIRAconnect by the 28th with the Input and Output Tax Statements in MIRA's own layouts, Green Tax per guest night, corporate income tax bands, pension contributions, and records kept five years. This is the edition that proves the product works, because a small country's rules are specific enough that nothing can be faked.

**Both editions carry every module.** Decided 22 September 2026. The Maldives edition is not a cut-down one: purchase orders, sales orders, inventory and stock, and everything else a modern accounting product covers are in it, in Maldivian words and Maldivian rules. A Maldivian business should never have to choose between software that knows MIRA and software that knows stock. The international edition is the same set, carrying another country's pack, with the same plain language and the same three-tap flow rather than the dense grey screens the category ships.

**The international edition.** The same product with a country pack instead of the Maldivian one, at the standard the rest of the market expects: a consumption tax with as many rates and periods as the country has, statements in the formats an auditor there recognises, and the local words for them. Where a country mandates electronic invoicing, that belongs in its pack, not in the ledger.

### What a country pack contains

A pack is data and layouts, never ledger code:

- Tax rates with the dates they took effect, and the treatments a supplier can quote in.
- What a compliant invoice must show, and how the number is made.
- Filing periods, due dates, and the form or statement layout the authority wants.
- Withholding taxes, reverse charge, and any tax on paying somebody abroad.
- Electronic invoicing where it is mandated — Peppol in Europe and Singapore, ViDA as it arrives, ZATCA in Saudi Arabia, MyInvois in Malaysia, the IRP in India. A pack declares the format and the clearance step; the entry behind it is the same balanced entry as any other.
- Payroll: the deductions, the ceilings, the payslip and the filings.
- The statement formats and the vocabulary a local accountant expects.

Adding a country is writing a pack. It must never mean touching the ledger.

### What a country needs beyond tax

- **Language.** English throughout, and Dhivehi in the Maldives edition, which is written in Thaana and reads right to left. Every screen is built so the direction can flip without the layout breaking.
- **Money and dates.** The currency it is kept in, the currencies it transacts, and dates and separators written the way that country writes them.
- **Where the data sits.** Which region a company's books are stored in, and who may be sent them, because some buyers cannot use a product that cannot answer this.
- **Banks.** Open banking where it exists, and statement files where it does not. The Maldives has no open banking; the file reader is not a fallback there, it is the road.

## Connections

Sentryfi connects to the accounting software a company already uses, in three directions, and each is a different promise.

**Bringing history in.** A company that has kept books elsewhere arrives with years of records. Opening balances, the chart of accounts, customers, suppliers and closed periods come across so the first month here is not the first month of the business. Zoho Books, QuickBooks Online and Xero all expose this over OAuth; anything else arrives as CSV with the columns mapped rather than assumed.

**Running alongside.** Nobody moves a live set of books over a weekend. Sentryfi records bills, cash, projects and tax while another product keeps issuing sales invoices, and the two agree. That is the actual state Altura is in today.

**Handing over.** Everything leaves in a form an accountant can use: journal exports, statements, and the supporting document behind every entry. A company that wants to go elsewhere is not held by its own records.

### The rule that does not bend

**An integration posts through the same door as a person, and never into the tables.** Every imported record becomes a balanced journal entry through `postEntry`, with the same constraints, the same numbering, the same seal and the same audit trail. A connector that wrote rows directly would be a hole straight through every guarantee the ledger makes, and it is exactly how integrations are usually built.

Three consequences follow:

- **Every imported record carries where it came from** — the system, the account, and that system's own id for it — so importing the same month twice recognises itself rather than doubling the books.
- **An import that cannot balance does not post.** It lands as something a person resolves, the same as a bill whose tax nobody has established.
- **Nothing is imported silently.** A connector proposes; a person accepts. The market research is right that the assistant layer may draft and not post, and an integration is the same kind of actor.

### What connects

- **Zoho Books** — OAuth, REST. The incumbent at Altura and the first one that has to work.
- **QuickBooks Online** — OAuth, REST.
- **Xero** — OAuth, REST.
- **Anything with an API.** The connector interface is the product's own, not each vendor's: a connector maps a foreign record onto the ledger's shape and declares what it can and cannot bring. Adding one is writing a mapping, not changing the books.
- **Banks, by file.** There is no open banking in the Maldives. Statements arrive as exports and the column layout is read, not assumed, so another bank is configuration.
- **CSV, always.** The floor that works when nothing else does, and the only thing guaranteed to exist for a company leaving a product that has no API.

### What it will not do

It will not file on anyone's behalf, because no revenue authority in scope offers it. It will not keep two products in sync as a permanent arrangement — running alongside is a migration state with an end, not a feature, because two systems holding the same figure is how they come to disagree.

## What a company chooses

Set once when the books are opened, changeable afterwards by an administrator.

- Which jurisdiction, and therefore which tax rules and forms.
- Which modules are on.
- The reporting currency, and which currencies are transacted.
- The chart of accounts, from a starting set or their accountant's own.
- Which roles exist and what each may do, from the standard set.
- Period length, and when a period closes.
- Which accounting software to bring history in from, and whether anything keeps running alongside while the move happens.
- Whether the interface speaks plainly or in accounting terms — the same ledger underneath, described two ways, because an owner and their accountant are not reading for the same thing.

## What cuts across everything

Not modules. Four properties every screen and every module must have, written down 22 September 2026.

**It works with no signal.** A bill photographed where there is no coverage is recorded on the phone and sends itself when there is — already true for bills, and the rule for everything a person does in the field: cash spent, a count, a delivery received, a confirmation of money handed over. The books are never blocked by a boat being out of range. Reading what is on a photograph needs a connection; recording what a person typed does not.

**It is guided, and it teaches as it goes.** Somebody who has never kept books is walked through opening them, bringing history in, recording the first bill, closing the first month and filing the first return, in the app rather than in a manual. The app tells them what needs them next, which it already does, and never leaves them staring at a chart of accounts wondering which line is theirs.

Beyond that, it explains the thing it just did, where it did it, in one line: why the bank's charge on a transfer belongs in the cost of the goods and the GST does not; why a cost that arrives after the goods are sold cannot go back into stock; what a rate difference between the invoice and the payment is. A founder who uses this for a year should understand their own books, and be harder to mislead by anybody. Not a course, not a tooltip nobody reads: the one sentence that explains the figure in front of them, next to that figure.

**It is made for AI to work with, and it draws the line.** The reader already takes a photograph or a spoken note and fills a bill in. Beyond that: a company's own assistant, and other software, reach the books through the documented interface — the same door a person uses, never the tables. Anything automatic may read, draft and propose. It may not post. Accounting mathematics is not something an assistant gets an opinion about, and the trail must always end at a person's name.

**It reads, asks, and learns.** Stated by the owner on 23 September 2026: "you should understand what charges. When those are provided, ask if it confuses or not on record. Clarify. Not everything is recorded; the system learns."

The product does not arrive knowing every charge a Maldivian importer meets, and it does not pretend to. It reads the documents it is given — a Customs assessment notice, a clearing agent's invoice, a port bill, a bank's charge advice — and for each line it either recognises the charge or asks about it:

- **A charge it knows** is posted to the right place with its reasoning shown: "Non-registration processing fee — a Customs charge, part of what these goods cost."
- **A charge it does not know, or one that could be two things,** is put to the person once, in their words: "Real Zone's invoice has 'Form Set, 5 × 25.00'. Is this something they paid on your behalf, or their own fee?" The answer decides the tax treatment and the cost, so it is asked, never guessed.
- **The answer is remembered** against that supplier and that wording, visibly, so the same line on the next invoice is not asked about again, and a person can see why the product now believes what it believes and change it.
- **A figure set by somebody else's rules is recorded as charged.** Customs' assessed value, its uplifts and its exchange rate are Customs' business; the product keeps them and does not second-guess them.

So the product's knowledge of charges grows from the owner's own paperwork rather than from a list somebody wrote in advance. Nothing needs a field before it has happened once, and nothing is asked twice.

**It answers questions.** Analytics that a founder actually asks: which site made money, which customer pays late, what the month costs before it ends, what is committed but not yet spent. Read from the ledger with the entries behind each figure shown, never a dashboard figure nobody can trace.

## The platform a product needs to be sold

None of this changes how money is recorded. All of it decides whether anyone outside Altura can buy the thing. Written down 22 September 2026, when the product's audience widened from one group of companies to a market.

- **Getting in.** Somebody signs up, gets a trial, opens their books, and is not waiting on anybody to provision them.
- **Getting their history in.** The connectors and the CSV floor that already exist, wrapped in a first-run that takes a company from "we use Zoho" to "our trial balance matches" without an implementation project.
- **Plans, and what each one carries.** Which modules, how many companies, how many people, how much storage, and what happens when a trial ends: the books stay readable, because holding somebody's records hostage is not a pricing strategy.
- **Billing for the product itself.** Kept well away from the ledger. A company's books never pay for Sentryfi from inside the company's books.
- **The practice.** An accountant who keeps ten companies signs in once and moves between them, with their own sign-off and their own trail.
- **An interface for other software.** A documented API and webhooks on the same door every person uses: nothing writes to the tables, ever.
- **Answering for itself.** Backups proven by restore, a page that says whether it is up, a way to reach somebody, and a straight answer about where the data sits and who may see it.
- **Its own languages.** English, Dhivehi in the Maldives edition, and a layout that does not break when the writing runs the other way.

## Current state, honestly

Rewritten at the end of 19 September 2026. This section exists so nobody, including a future session, mistakes what is deployed for what is designed. It is kept blunt on purpose.

**The ledger is real and proven.** Money is whole laari in integers. Every change to the books is a balanced two-sided entry written through one function, sealed with the hash of the entry before it, and impossible to edit or delete — a correction is a new opposite entry with a reason, and the original stays. Each company's books are walled off by the database rather than by queries remembering to filter, and with nothing set nothing is visible, so a forgotten filter fails closed. `npm run ledger:selftest` proves it against the real database in **88 checks** inside a transaction it rolls back, and the same guarantees run in CI on every push against a Postgres service container.

**Bills reach it.** A bill can be recorded and posted from a screen, photographed and read, with the tax treatment recorded rather than guessed and duplicates caught before they post. Suppliers, projects and cost codes exist.

**The shell knows who you are.** A request resolves to a company, checks membership, and carries what the person may do. Roles are per company. Screens ask by capability, never by role name.

**Most of what is on screen is still the purchased product.** Invoices, payments, expenses, clients and items run on the purchased PERN tool's own tables, not the ledger. Its domain model has no payables, no projects, no petty cash, no multi-company and no roles, and it stores money as floating point. Until each of those moves — steps 4 to 6 of the plan — the app has two record stores, which is exactly what this product record forbids, and the plan now ends every one of those steps by removing what it replaced.

**What does not exist at all:** periods and closing, the statements, multi-currency, the tax engine, bank import and reconciliation, the paper kept against entries, backup, the phone board, every module, and the "what needs you" screen that this record calls the product's central idea.

**What it cannot do yet, in plain terms:** it cannot tell you what you are worth, what you owe in total, whether last month was profitable, or what your return will say. It can record a bill correctly, which is the foundation for all of those and none of them.

### How it is checked

- **Tests run on every push** against a real Postgres in CI, not a stand-in — the ledger's guarantees are deferred constraint triggers, plpgsql, row-level security and a restricted role, and a fake implements none of them.
- **CI** lints, builds, tests and audits dependencies. High and critical vulnerabilities fail the build.
- **A browser is part of the toolchain.** `node tools/shoot.js` drives the Chrome on the machine, screenshots desk and phone signed in or out, and measures what a screenshot cannot: tap targets under 44px, controls with no accessible name, heading structure, sideways overflow and console errors. It found three bugs on its first run that reading the code had missed, including a dark mode that had gone blank.

### Two standing warnings

**The design system's rules were being broken in code while correctly recorded in `DESIGN.md`**, including a colour the document records as tested and rejected. The document is the authority; when they disagree, the code is wrong.

**A token that flips between themes must never be a background under hard-coded text.** This has now caused two separate failures: a theme picker rendering white on white, and the sign-in panel going blank in dark mode. Anything dark by intent rather than by theme uses `--ink-panel`; anything sitting on the signal yellow uses `--on-accent`.

## Positioning

A complete accounting core with the industry modules and the tax pack a company actually needs, rather than a general ledger that assumes every business is the same one.

The Maldives pack is the sharp end and the reason this exists: it produces MIRA-format return figures and the exact Input and Output Tax Statements for MIRAconnect, reads mixed MVR and USD documents, records which way round a supplier quoted GST, and knows that many suppliers are not registered at all. Zoho Books, QuickBooks and Xero produce none of that, and the 2026 market research reviewed on 19 September 2026 shows no vendor addressing it either.

The second difference is who the interface is for. A correct double-entry ledger, described in plain words to the person who owns the business and in accounting terms to their accountant, from the same records. Most products pick one audience and make the other learn.

The fourth is that it is sold in two editions from one codebase: a Maldives edition that carries MIRA's rules to the last detail, and an international edition that is the same product with another country's pack on it. The competitors go the other way, building for a large market and adding small countries late or never, which is why a Maldivian business ends up keeping a spreadsheet beside its accounting software.

The third is the order it was built in. The ledger came before any screen: balanced entries enforced by the database, a hash chain, per-company isolation. The market research names that ordering as the right one and most products did the reverse, bolting automation onto a flat record store. Retrofitting it is expensive; we do not have to.

## Operating Context

- **Entities:** Altura Pvt Ltd is the contractor. Steva Hotels (subsidiary of Steva Enterprises) is the client and project owner of a 48-room hotel build. Steva Enterprises is the group parent. Each is a separate company in the app; intercompany transfers mirror across books.
- **Money in reaches Altura three ways:** directors hand cash or transfer directly; Steva Enterprises transfers; excavator rental income from Road Development Corporation (RDC). The plan's recommended treatment records director and Steva money as customer advances from Steva Hotels against the construction contract. This treatment is pending confirmation by a licensed Maldivian accountant and has GST timing consequences.
- **Cash and bank:** multiple petty cash boxes and bank accounts in MVR and USD (BML, MIB, SBI Maldives). Bank statement CSV formats vary by bank; the importer must be column-mapped, not hard-coded.
- **Construction workflow:** project and job costing by cost code (materials, labour, subcontractors, equipment, fuel, transport and boat freight, site overheads), budget versus actual, unpaid supplier bills, retention, progress billing (IPC), and work in progress.
- **Tax calendar (verify with MIRA before filing):** GST general sector 8%, filed by the 28th of the following month, monthly or quarterly by turnover, via MIRAconnect plus Excel Input and Output Tax Statements uploaded to the MIRAconnect Statement Portal. TGST 17% for the hotel once operating. Green Tax per guest night. Corporate income tax 0% to MVR 500,000 and 15% above, annual return by 30 June with interim payments. Time of supply is the earlier of invoice date or payment date. There is no public MIRA filing API; "one-click filing" means a complete pack the owner keys in and uploads. **MIRA administers 24 revenue types**, listed in full in `docs/real-world-samples/mira-revenue-types.md` from Altura's own tax clearance certificate. Three that apply to Altura are not modelled above and must be added before any deadline board is trusted: the **Company Annual Fee**, **Withholding Tax** and **Remittance Tax**, the last two likely for a contractor employing foreign labour. Business Profit Tax still exists as a clearable type for historical periods although income tax superseded it, and fines and interest clear as their own type rather than as an adjustment. A tax clearance can be **conditional**; Altura's is. Confirm the applicability of each type with the accountant. **GST is quoted both ways in practice** (confirmed against real documents on 19 September 2026): State Trading Organisation adds 8% on top of the item total, while many suppliers quote a GST-inclusive figure from which the tax is `amount × 8 ÷ 108`. The app must read which convention a document follows and record its choice, never assume one. **Many suppliers are not registered at all** — Island Zone Construction and the Maalhos Council both issue documents with no tax line and no TIN, and claiming input tax on those would be a false claim.
- **Records:** accounting records and supporting documents must be kept at least 5 years. Nightly encrypted database dumps and a human-readable monthly filing pack sync to OneDrive so the folder alone is an auditor-ready archive.
- **Coexistence:** Zoho Books free plan keeps issuing sales invoices for now. Sentryfi handles expenses, bills, cash and bank, projects, directors' ledger, and the tax centre. Historical Zoho data arrives by CSV import.
- **Connectivity:** site use has poor connectivity. Capture is offline-first: photos queue locally and sync when online. The phone is a fast capture front end; the server is the source of truth.
- **Runtime AI:** requires a separate Anthropic API key with pay-as-you-go billing. The owner's Claude Max subscription covers building, not runtime.

## Capabilities and Constraints

The ordered plan for building these, and the rule that no phase starts before the one above it, is `TODO.md`. This is the detail beneath The Core and Modules above, not a parallel list. Where it and those sections differ, those are right: they were written later and deliberately.


- **What needs you (added 19 September 2026).** The people using this are building things, finding work and closing deals. The books are not their job; they are a thing that has to stay right while they do their job. So the app does not wait to be asked. One place answers "what am I holding up?", assembled from the books rather than typed by anyone: bills nobody has read, a supplier billed twice, a cash box nobody has counted in three weeks, an invoice a fortnight overdue, eleven days to the deadline with two things still wrong with the return. This replaces a dashboard of figures with a short list of things that need a person. A figure tells you how you did; this tells you what to do. It is also the app's only notification surface, so nothing else nags.
- **Nothing is deleted; money records are voided (decided 19 September 2026).** An invoice, a bill or a payment leaves the books by being voided, never removed: it keeps its place and its number, stops counting towards every total, and carries the reason, the time and the person who did it. The reason is required in the database, not only in the form, because a void without a reason is a quieter delete. This is the pattern every established accounting system uses, and the reason they give is the one that matters here: a deleted record leaves no trace of what it was, so the trail can only say that something went, while a voided one still shows the original amount and who removed it. It also keeps the numbering unbroken, which is the first thing an auditor checks. Voided records stay visible in their lists, struck through and marked, because hiding them would be a delete under another name. Customers and catalogue items are exempt: they are reference data, not financial events.
- **Only ask when genuinely unsure.** A clear bill from a known supplier posts without a question. A possible duplicate, an amount that could not be read, a supplier never seen before: those go in front of a person. Everything else the app handles. This is a rule about when to interrupt, and it applies on every surface.
- **Buying, receiving and being invoiced (added 19 September 2026).** A procurement officer buys twenty tonnes of cement on site and photographs the delivery note. The supplier invoices the office a fortnight later. Without this, those are two unrelated records: the cost is counted twice, or the invoice is paid with nobody checking it against what actually turned up. On a construction job that happens weekly. So the ordered, received and invoiced quantities are held separately and matched against each other, partial deliveries included, because they are normal. A short delivery is caught before payment, not after. Each procurement officer carries a spending limit; purchases under it happen, purchases over it wait for an approver.

- Snap flow: capture (camera, gallery, batch multi-select), client-side compress and strip EXIF, the image stored and addressed by its own content hash, extraction to typed JSON with a confidence per field, duplicate detection, one-tap confirm that posts a balanced journal, and learning from every manual correction. **Corrected 19 September 2026:** this described Cloudflare R2 and Claude vision. Neither is in the repository — the file arrives through multer and Google Gemini reads it. The storage described here does not exist yet at all; the image is read and discarded.
- Never auto-post below a confidence threshold. The review step is mandatory.
- Quick entry without a bill: amount, what for, paid from, with voice input for hands-free site use.
- **Site cash boxes (added 19 September 2026, shaped in `docs/shape-petty-cash.md`).** Each box is money in a named person's custody, not a pooled account: its own ledger account, its own holder, its own last-counted date. The holder spends with a bill through the ordinary snap flow, or records a spend that produced no bill at all in three taps. A spend with no bill claims no input tax and says so at the moment of recording. The holder counts the box on demand; a difference is recorded as its own line with a reason, and "not sure" is an allowed reason. The holder can ask for a top-up but can never move money. Only the Administrator or Manager tops a box up.
- Money In screen: source (director by name, Steva Enterprises, Steva Hotels, RDC rental, other), method (cash or bank account), project.
- **Directors' contributions are a view of Money In, not a section (corrected 19 September 2026 on the owner's challenge).** Every contribution is a Money In entry carrying a source, so it is recorded once, in one place. The Directors' Contribution Ledger is that data grouped by person with running totals, and the director contribution statement is its export. An earlier draft of the web shell gave Directors its own nav slot, which implied a second place to record and maintain the same money and is how two views of one figure drift apart. A sub-ledger does not get top-level navigation; suppliers do not, and neither should directors. The Director role still signs in and lands on that view as their home, which is a role landing page rather than a section. This does not depend on the funding treatment: whether director money is finally recorded as customer advances, equity or a loan changes which account it posts to, not whether it needs its own part of the app.
- **Paying people back (added 19 September 2026).** Any capture, with a bill or without, carries an "I paid it myself" toggle that moves the source from the cash box to the person and creates an amount owed back to them. The Owner sees one total for what the company owes its people and settles it from a bank account or a cash box. Distinct from topping up a box, which is the same money moving to a different place.
- Directors' Contribution Ledger: who put in how much, cash versus transfer, running totals.
- Bills and payables with due dates and retention. Projects with budget versus actual by cost code. Plain-English reports: P&L, cash flow, project cost, director contribution statement.
- Tax centre: configurable engine keyed by effective date and industry profile, GST period status, MIRA 205/206 figures, Excel statements in MIRA's fixed template (tab named exactly "Input Tax Statement", 11 columns), pre-filing checklist, deadline reminders.
- Multi-company, with each company's books sealed off in the database rather than by the application remembering to filter. Roles are the standard business-software set plus two site roles, listed under Users, held per company so one person can hold different roles in different entities.
- Appearance: daylight board (white) by default. The night board (ink ground) follows the device's appearance setting automatically, with a manual override in Settings and a "keep daylight" lock for site use. Decided 19 September 2026 on the owner's request for a recommendation.
- Append-only, hash-chained journal. Void instead of delete. Soft delete everywhere.
- Login by passkeys and device biometrics with 2FA fallback.
- Terminology in the UI: "Money In", "Money Out", "Paid from", "Owed to", "Site cash", "the cash box", "Top up", "Count the cash box", "Difference", "We owe you", "Pay back". The words float, imprest, replenish, reconcile, variance and expense claim never appear on the phone. Accounting terms never appear on the phone at all (decided 19 September 2026): the debit-and-credit journal lives only in the desktop Accountant / CFO shell, and the phone proves a posting in plain words plus a "Balanced" line.
- Language: English first, Dhivehi later.
- **The phone board leads with spend (decided 19 September 2026).** Under the platform split the phone is an expense dashboard, so its band is headed "Spent this month" and carries the month figure. The cash and bank position was not dropped, because tracking cash versus bank is one of the owner's three hardest jobs and an expense dashboard that hides it would be worse rather than purer; it sits on the line beneath as a single figure. Under the band, "Where it went" breaks the month into cost codes as proportional bars. The board shows three recent movements rather than five, with the rest behind See all. Spend, the breakdown and the position all move together on posting, undo and reversal, and the parts always sum to the whole.
- **Layout follows the platform split (19 September 2026).** Phone: Administrator, site staff, cash holders and procurement officers, for the expense dashboard and capture only. Desktop web: Accountant, Auditor, Director and Manager, for the full suite. The Owner uses both. **Moved from phone to desktop by this change:** recording Money In, reversing or adjusting a posting, topping up a cash box, bank statement import and reconciliation, the directors contribution ledger, and the tax centre. **Staying on the phone:** the snap, review and confirm flow; the expense dashboard; site cash spending, counting and asking for a top-up; the waiting queue; and the plain-words proof that a posting balanced.
- Hotel operations are a module and a jurisdiction concern rather than a deferral. TGST and Green Tax belong to the Maldives pack; rooms, occupancy and agent commissions to the hospitality module. Both are built when the hotel needs them rather than being absent from the product.
- iOS PWA limits apply: small storage quota that can be evicted, no background sync, push only after home-screen install.
- **Undecided:** the exact MIRA 205 v.25.1 box wording and Output Tax Statement column headers; legal ownership of the excavators (determines who invoices RDC and remits GST); the final funding treatment for director and Steva money. All await the accountant.
- **Undecided:** whether and when Sentryfi replaces Zoho Books for sales invoicing.

## Deployment

Recorded 19 September 2026. The repository is the source of truth: pushing to `main` builds and deploys. Nothing is deployed by hand.

- **Repository:** `github.com/destiniz-svg/sentryfi`, public, branch `main`.
- **Railway project:** `hearty-courtesy`, service `sentryfi`, production environment, Singapore (`asia-southeast1`). Connected to the repository, so every push to `main` triggers a build.
- **Live:** `https://sentryfi-production.up.railway.app`.
- **Custom domain:** `sentryfi.app` is attached to the service and ownership is verified, but **the DNS does not yet point at Railway**. On 19 September 2026 the domain still resolved to a name.com parking address, so the certificate stayed in issuing and the domain did not serve. Railway's own record status read as propagated and was wrong; check what the domain actually resolves to, not the dashboard. The target is `4xcxcgmg.up.railway.app`. Because this is the apex rather than a subdomain, a literal CNAME is not valid DNS, so it needs name.com's ALIAS or ANAME record type.
- **Build:** `npm run build` runs `npm run render` first, so the design contact sheets in `public/design` are regenerated from the artboards on every deploy and cannot drift from them.
- **Security gate:** Railway refuses to deploy a dependency tree carrying a critical advisory, and did so once, on `next@15.5.4`. Treat that as a feature rather than an obstacle. Keep `next` current.
- **Databases already provisioned** in the older `ledger-mv` Railway project: PostgreSQL production and dev, 5GB volumes each, same Singapore region. Not yet wired to the app.

## Brand Commitments

- Name: **Sentryfi**, one capital, chosen by the owner on 19 September 2026 (earlier working names: LedgerOS, then SnapPilot for a few hours). Domain: sentryfi.app is the assumed home and did not resolve on 19 September 2026; sentryfi.com and sentryfi.io are taken. Known name collisions to clear before launch: a Calgary startup already called Sentryfi, Sentry Financial in the US, and the registered software brand Sentry (sentry.io). The plan PDF and the superseded artboards still carry the old names.
- Name meaning to carry in the brand: a sentry keeps watch; the app stands guard over the books.
- Tagline: "Snap it. Record it. Done."
- Ambition at launch: Altura first, SaaS-ready underneath. Built for the owner's three companies now; multi-tenant by design, with no public sign-up or billing yet.
- Voice: confident, calm, professional, plain language, no accounting jargon outside the Accountant view.
- The owner chose a bold and expressive direction for the core mobile flow on 19 September 2026, recorded in the Design artifact "LedgerOS Core Mobile Flow" (https://claude.ai/artifact/68pfaMyCkAWkiyTN36bfH1): four phone artboards for Home, Snap, Review, and Recorded. This is a starting reference, not a binding design system; the visual world is being decided in the shape round of the same day.
- Logo brief from the owner: simple and modern. No logo, wordmark, or brand assets exist yet.
- **Colour, settled 22 September 2026.** Ink, signal yellow and a deep sea supporting colour, over the two alternatives that were drawn and compared (category blue, and a warm clay challenger) in the canvas "Sentryfi redesign direction" (https://claude.ai/artifact/DZaR7bTQ8rqb3cNAB7DiKc). The reasoning is in DESIGN.md: accounting software is a field of blues and greens, nobody in it owns yellow, and yellow earns its place here rather than being chosen for effect, because high-visibility yellow is what safety wear is and ink on yellow is the most readable pair in direct sun. The research that colour psychology rests on does not support picking a hue for its supposed meaning; what it supports is fit between the colour and what the product does.

## Evidence on Hand

- The design and build plan PDF "LedgerOS: Mobile-First Finance App Design and Build Plan for Altura Pvt Ltd", prepared 18 September 2026. It is a technical and product blueprint, not accounting or legal advice.
- The Design artifact linked above.
- **A reference front end**, cloned 19 September 2026 to `reference/ai-invoice-and-billing-manager-ui-boilerplate-code` and assessed in `docs/reference-frontend.md`. Vite, React 19, Tailwind v4, TanStack Query, on mock data with every API call commented out. **Verdict: take the chassis, leave the domain.** Adopt its CSS-variable token layer, theme context, app shell and command palette, and its API-facade plus React Query architecture. Reject its model outright: receivables only, one flat tax percentage, no payables, no cash accounts, no ledger, no rufiyaa and no exchange rates. Relevant to the desktop suite only; it has no mobile navigation at all. The clone is git-ignored.
- **Real Altura and Steva documents, supplied by the owner on 19 September 2026** and recorded in `docs/real-world-samples/`: a 1,094-row Bank of Maldives statement export covering 1 January to 9 September 2026, three supplier documents (one with no GST, one with GST added on top, one billed to Steva and paid by Altura), six Bank of Maldives transfer receipts, two Altura sales invoices to Road Development Corporation, an RDC purchase order, the 2022 directors' report, the Ministry of Economic Development and Trade registry profile, and the MIRA tax clearance certificate.
- **Altura's registry facts** are recorded in the local-only folder, not here. The two that shape the product: **Altura has two shareholders and two directors**, one of whom is the Managing Director and also company secretary, which bounds the Director role at a single person besides the Managing Director; and **three registered business activities**, covering construction of residential buildings, real estate, and network and cable installation, which is the set an industry profile should be built against. Registry data is as at September 2024 and refetchable with the verification code on the source document. The folder's README records the entity facts these confirm; `bml-csv-import.md` is the column mapper derived from the real export; `extraction-cases.md` is the acceptance list for the receipt reader. **The raw files carry live account numbers, tax identification numbers and personal names.** They are git-ignored and must not reach a published artifact, a screenshot, a demo build, or a third-party service. Use the masked `fixtures.json` for anything seen outside the owner's machine.
- No screenshots of current tools or testimonials are on hand. Numbers in mockups are illustrative and must be labelled as such. Do not fabricate customers, benchmarks, or MIRA template details.

## Product Principles

1. **Three taps or fewer.** Every capture path ends in snap, review, confirm. Anything that adds a step must earn it.
2. **Correct underneath, plain on top.** The ledger is always balanced double-entry. The interface never asks the user to know that.
3. **Trust is shown, not claimed.** Confidence per field, a mandatory review, duplicate checks, an audit hash, and a visible OneDrive archive are how the app proves the books are right.
4. **The phone captures, the server keeps.** Offline capture queues; nothing on the device is the record of truth.
5. **Maldives first, configurable always.** Tax rates, periods, forms, and industry profiles are data keyed by effective date, so MIRA changes and new industries are configuration, not rewrites.
6. **Humans sign off on money and tax.** A licensed Maldivian accountant confirms the chart of accounts, the funding treatment, and the first filings. A security reviewer signs off before real money flows.

## Accessibility & Inclusion

Accessibility-first by commitment in the plan: sufficient contrast, large touch targets in the thumb zone, screen-reader labels. Site staff may be untrained and working in bright sunlight with one hand; capture must work in that scene. English first with Dhivehi (Thaana script) planned, so text layout must not assume Latin script forever.
