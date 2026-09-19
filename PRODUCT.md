# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router) with React 19 and TypeScript, Tailwind CSS v4, shadcn/ui, Motion (Framer Motion), shipped as an installable Progressive Web App. Backend is Next.js server actions and route handlers in one monolith, Drizzle ORM on Railway managed PostgreSQL, Cloudflare R2 for receipt images, Better Auth (self-hosted) for passkeys and roles, Anthropic Claude vision (Haiku 4.5 primary, Sonnet fallback) for receipt extraction, Microsoft Graph for OneDrive backups. Hosted on Railway, Singapore region, with staging and production environments. Tests: Vitest and Playwright. Confirmed by the owner on 19 September 2026 as the stack in the build plan.

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

**The goal: Altura's books are kept in Sentryfi. Every bill is recorded within minutes of arriving, by whoever is holding it, and every GST return is filed from the app by the 28th.**

That sentence is the whole of it, it is final, and every decision is judged against it. Does this get a bill into the books faster, or a return filed more safely? If neither, it waits. The ordered plan to reach it is `TODO.md`.

Sentryfi's promise to the user is "Snap it. Record it. Done." Photograph a bill, check what was read, confirm. Behind the plain-language interface a correct double-entry ledger keeps the books right without anyone reading the word debit.

It exists because the owner runs a construction company, three related entities and a hotel build without an accountant on staff and without accounting vocabulary, and because no product built elsewhere files a Maldivian return.

## Current state, honestly

Recorded 19 September 2026 after a design critique of the running web app scored it **14 out of 40**. This section exists so nobody, including a future session, mistakes what is deployed for what is designed.

**What is deployed** at `sentryfi.app` is the purchased PERN invoice manager with Sentryfi's brand applied. It is a competent single-user freelancer invoicing tool. It is not this product. It has no ledger, no double entry, no payables, no projects or cost codes, no petty cash, no multi-company, no roles at all, and it stores money as floating point. Its tax model is one flat percentage, which cannot express what the real documents in `docs/real-world-samples/` prove: GST quoted inclusive by some suppliers, added on top by others, and absent entirely from suppliers who are not registered.

**What is designed** is the product: the phone flow in 45 rendered panels, the web suite in 7, the tax centre, bank reconciliation, and the data model in `docs/data-model.md`.

**The direction is to grow the first into the second, foundation upward**, replacing the purchased domain model rather than decorating it. Not a parallel rewrite, and not more features on the current chassis.

Two findings from that critique are worth carrying as standing warnings rather than tasks. The first: the design system's own rules were being broken in code while being correctly recorded in `DESIGN.md`, including a colour the document explicitly records as tested and rejected. The document is the authority; when they disagree, the code is wrong. The second: the landing page was the only file authored from this product record, and it held more domain truth than the five thousand lines behind the login. Treat the product record as the specification, not as marketing.

## Positioning

A Maldives-native finance app. It produces MIRA-format GST return figures and the exact Excel Input and Output Tax Statements for MIRAconnect, reads Dhivehi and mixed MVR/USD receipts, and models the Altura, Steva Hotels, and Steva Enterprises group with intercompany mirroring. Zoho Books, QuickBooks, and Xero produce none of these. Local competitors are Zoho resellers and manual bookkeeping firms. The plain-language double-entry ledger with an Accountant view toggle is the second differentiator: correct books for people who will never learn accounting.

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

The ordered plan for building these, and the rule that no phase starts before the one above it, is `TODO.md`. This section is what the product does when finished; it is not a sequence.


- **What needs you (added 19 September 2026).** The people using this are building things, finding work and closing deals. The books are not their job; they are a thing that has to stay right while they do their job. So the app does not wait to be asked. One place answers "what am I holding up?", assembled from the books rather than typed by anyone: bills nobody has read, a supplier billed twice, a cash box nobody has counted in three weeks, an invoice a fortnight overdue, eleven days to the deadline with two things still wrong with the return. This replaces a dashboard of figures with a short list of things that need a person. A figure tells you how you did; this tells you what to do. It is also the app's only notification surface, so nothing else nags.
- **Only ask when genuinely unsure.** A clear bill from a known supplier posts without a question. A possible duplicate, an amount that could not be read, a supplier never seen before: those go in front of a person. Everything else the app handles. This is a rule about when to interrupt, and it applies on every surface.
- **Buying, receiving and being invoiced (added 19 September 2026).** A procurement officer buys twenty tonnes of cement on site and photographs the delivery note. The supplier invoices the office a fortnight later. Without this, those are two unrelated records: the cost is counted twice, or the invoice is paid with nobody checking it against what actually turned up. On a construction job that happens weekly. So the ordered, received and invoiced quantities are held separately and matched against each other, partial deliveries included, because they are normal. A short delivery is caught before payment, not after. Each procurement officer carries a spending limit; purchases under it happen, purchases over it wait for an approver.

- Snap flow: capture (camera, gallery, batch multi-select), client-side compress and strip EXIF, upload to R2 by signed URL, Claude vision extraction to typed JSON with a confidence score per field, auto-categorisation by vendor memory rules, duplicate detection, one-tap confirm that posts a balanced journal, and learning from every manual correction.
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
- Hotel operations (TGST, Green Tax, occupancy) are deferred until the hotel operates. The tax engine stays configurable for them.
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
