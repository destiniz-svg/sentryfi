# Build plan

Revised 19 September 2026, after comparing what is built against the 2026 market research on automated accounting. Written so anyone can follow it, not just whoever wrote the code.

## The goal

**A complete accounting core that any business can keep its books in, with the modules and the tax rules it actually needs switched on. Altura's books are kept in it first, and prove it.**

Altura is the proving ground, not the specification: every bill recorded within minutes of arriving, every return filed from the app on time. If it cannot do that for one construction company in the Maldives, the rest is a claim rather than a fact.

## Three rules about what gets built when

**The core is finished to 100% before anything sits on it.** A double-entry system that is four-fifths done is not four-fifths useful — it is a system whose figures cannot be trusted, because the missing fifth is where the money went. Everything in the core list below is required. Nothing in it is optional.

**Every other capability exists, and each is switched on per company.** A contractor turns on projects and retention; a rental business turns on machines and utilisation; a hotel turns on rooms and occupancy. Nobody is shown a module they do not use, and nobody is told a capability does not exist because their industry was not the one it was built for.

**Tax rules are configuration, not code.** The Maldives gets GST at 8%, the inclusive-or-exclusive question, unregistered suppliers, and MIRA's forms. Anywhere else gets its own rates and periods. Adding a country means writing a pack; it must never mean touching the ledger.

## Two halves, two standards

**The front is for people who are not accountants.** The person using it is on a jetty, in a truck, or between meetings. They are building things, finding work and closing deals. The books are not their job; they are a thing that must stay right while they do their job. So the app never asks them to understand accounting, never uses a word they would have to look up, and never waits to be asked what needs doing.

**The back is held to the standard a real accounting system is held to.** Correct double-entry, money that cannot drift by a laari, an audit trail nobody can quietly edit, and each company's books sealed off from the others. An accountant should be able to open it, recognise everything, and sign off on it.

Both at once. Simple on top is only honest if it is correct underneath.

## How the app carries the weight

The point is not that the app has an accounting engine. It is that the engine does the remembering, so the person does not have to.

**It tells you what needs you.** One place that answers "what am I holding up?" Bills nobody has read. A supplier billed twice. A cash box nobody has counted in three weeks. Eleven days to the filing deadline and two things still wrong with the return. The owner should never have to go looking for the thing that is about to bite.

**It only asks when it is genuinely unsure.** A clear bill from a known supplier goes in without a question. A bill that might be a duplicate, an amount it could not read, a supplier it has never seen: those it puts in front of a person. Everything else it handles. The market research calls this exception-first accounting and lists it among the 2026 differentiators; it has been the rule here from the start and shipped on 19 September 2026.

**It keeps working when nobody is watching.** Bills queue with no signal. The return assembles itself through the month. Nothing waits for a Sunday evening to catch up.

## Who uses it

Ordinary business-software roles, the ones an accountant already recognises, plus two we add because a construction company works on site.

**On the desk**

| Role | What they can do |
|---|---|
| **Administrator** | Everything, plus adding people and changing settings. The owner. |
| **Accountant** | The books: adjustments, closing a month, the tax return. Can correct anything with a reason; can delete nothing. |
| **Manager** | The daily work: record bills, raise invoices, take payments. Cannot change settings or the chart of accounts. |
| **Approver** | Says yes or no to spending over a limit. Nothing else. |
| **Viewer** | Reads, never posts. Directors sit here, watching what they put in and what the project has spent. |
| **Auditor** | Reads everything including the full trail, from outside, changes nothing. |

**On the phone**

| Role | What they can do |
|---|---|
| **Site staff** | Photograph a bill, tag the project. They see no money at all. |
| **Cash holder** | Holds a cash box. Spends from it with a bill or without, counts it, asks for a top-up. Sees one number: what is left in their own box. |
| **Procurement officer** | Buys for the site. Records what was ordered, what arrived, and what it cost. Sees their own orders and their own spending limit, and nothing else. |

A person can hold more than one of these, and the roles are per company, so the same person can be an administrator in one and a viewer in another.

## The order of work

Rebuilt 19 September 2026 into four milestones. The previous version was fifteen core steps in dependency order: correct, and it would have produced nothing usable for weeks. The owner is also the user, and a product nobody has used is a product nobody has corrected.

So the work is grouped by **what becomes true at the end of each milestone**, not by what the architecture would prefer. Each one ends with something real, and the order inside it is still dependency-first.

One thing changed on review. The tax engine was moved early because bills hard-code 8% and reconciling later seemed worse. That was over-cautious: `bills.gst_rate_bp` already stores the rate against each bill, so a bill keeps the rate it was quoted at forever and the engine only decides the default. It moves back to milestone three, which frees the fastest path to something you actually hold.

## How the work is done, from here

**Nothing goes straight to production once milestone one lands.** Every commit today deployed live, which was fine while nothing was real. Once bills are in there a bad deploy stops being an inconvenience.

**Build, look, fix.** The most productive stretch today was the browser loop: `node tools/shoot.js` drives a real Chrome, signed in or out, desk and phone, and measures what a screenshot cannot. Everything before that was built blind, and three bugs got through that a single look would have caught.

**One thing at a time, finished.** Each step ends with what it replaced removed, so two record stores never coexist longer than one step.

---

# Milestone one — Altura's bills live here

The first half of the goal: every bill recorded within minutes of arriving, by whoever is holding it. Smallest of the four, and the one that puts the product in a hand.

At the end of it, bills get photographed and recorded on site instead of accumulating. Run alongside whatever happens now; nothing here is authoritative until an accountant has said so.

---

### 1. Get the money right — done 19 September 2026

Today the app stores amounts the way a calculator does, which drifts by fractions of a laari and cannot be trusted to add up. Everything else is built on this, so it goes first.

**You will be able to:** nothing new yet. This is the floor.

**Under the bonnet:** amounts stored as whole laari, never as decimals. Every change to the books written as a balanced two-sided entry. Each entry sealed against the one before it, so an altered record shows. Each company's books walled off in the database rather than by the app remembering to filter. Nothing half-written: a change either lands completely or not at all.

**Done when:** a bill produces a balanced entry, the seal verifies from the first record to the last, and a query for another company's books comes back empty.

**What happened.** All three hold, checked against the real database rather than a stand-in. `npm run ledger:selftest` now runs 88 checks inside a transaction it rolls back, and passes.

Worth knowing:

- **Nothing had to be migrated.** The database held one user account and nothing else, so there was no decision to make.
- **Railway hands out a Postgres superuser, and a superuser ignores the walls between companies completely.** Written the obvious way the isolation rules would have been present, correct, and protecting nobody. The app now steps into a restricted role for the length of each transaction, and as a side effect has no permission to alter or delete a posted record.
- **The seal earns its place.** The test doctors a bill from MVR 4,250.50 to MVR 42,500.50 on both sides at once with the safety triggers off. The entry still balances and the books still add up, so nothing else notices. The seal catches it and names the altered entry.
- **A correction never hides anything.** Reversing writes a new opposite entry with a reason. The original stays.

---

### 2. Get bills in, from wherever they arrive — mostly done 19 September 2026

The owner's hardest job, and the reason this exists.

**You will be able to:** photograph a bill and have it in the books in three taps. Catch a supplier billed twice before it is paid twice. Correct anything afterwards, with a reason, without deleting it.

**Where it got to.** Bills, suppliers, projects and cost codes exist; a bill becomes a balanced entry; the photograph is read and only what it is genuinely unsure of is put in front of a person.

- **The tax decision is recorded, never guessed.** The same printed MVR 4,250.50 is 3,935.65 plus 314.85 when the price includes tax, and 4,590.54 when the tax goes on top — MVR 340.04 of difference on one bill, and an 8% overstatement if read the wrong way. "I am not sure" is a real answer that keeps the bill out of the books until somebody decides.
- **An unregistered supplier's bill claims nothing**, and the database refuses to record tax against one.
- **A supplier billed twice is stopped.** Same supplier and bill number refuses to post and the database refuses the pair. Same amount within a fortnight is raised as worth a look but still posts, because a monthly charge looks exactly like that.
- **A supplier's name is not a key.** Each carries the other spellings it is known by, because one real invoice spells its own issuer two ways on one page.

**Still owed here:** the photograph kept against the bill as supporting paper, the ten-second undo, and the phone version — this is the desk only, so "three taps on site" is not yet true. Reading needs `GEMINI_API_KEY` on the deployment, which is not set.

**New, from the market research:** **a supplier's bank details changing between bills is flagged before payment.** Invoice-redirection fraud works by sending a real supplier's next bill with a new account number, and a contractor paying suppliers by transfer is exactly the target. The supplier record already holds its accounts; comparing them costs nothing.

---

### 3. What needs you

The product's central idea, and it had no step at all until this revision. One place that answers "what am I holding up?", assembled from the books rather than typed by anyone.

It comes third because most of it can be built from what already exists — bills waiting on a decision, a tax treatment nobody has established, a possible duplicate — and because every step after this one adds something that belongs on it. Built last, it would be retrofitted; built now, each later step contributes a line to it.

**You will be able to:** open the app and see what needs a person, in order of what it costs to ignore. Nothing else notifies you.

**Done when:** every step that follows adds its own kind of attention here rather than inventing a second place to look.

---

### 4. The phone — no signal handled 19 September 2026

**The goal says every bill is recorded within minutes of arriving, by whoever is holding it.** That is a person on a site with a phone. The previous plan never built it, which made the goal unreachable by its own steps.

The phone board from `DESIGN.md`: square, loud, high contrast, one-handed, readable in equatorial sun. Snap, review, confirm. The expense dashboard. Site cash spending, counting and asking for a top-up. The waiting queue that survives a day without signal. The ten-second undo. Plain words only — no accounting terms reach the phone at all.

**The no-signal half is built and checked on the live app.** A bill taken with no connection is held in IndexedDB with its photograph, and sends itself when the signal returns, when the app is opened, and when the tab is looked at again. Nothing leaves the queue until the server confirms it. The phone decides the bill's key before it sends — on the first attempt as well as on every retry — so a send that times out cannot become two bills; the server answers a repeat with the bill it already has.

The check that proves it is `tools/offline.js`: it cuts the connection, records a bill, reads the phone's own disk rather than trusting the screen, then reconnects and confirms one bill on the server with the right figure.

That check found the other half. The queue was durable but the way back into the app was not: close the tab on a site with no bars and the next attempt was the browser's error page. The shell is now precached and every navigation falls back to it, so the app opens on a dead connection; `/api` stays NetworkOnly, because a figure that is quietly three days old is worse than no figure. `tools/shell.js` checks it.

**The phone board is built and checked on the live app.** Home and Bills are the board from `DESIGN.md`, not the desk register made narrow: square corners, ink on board white, the one yellow band, hairline rows, and every amount hanging on a single 2px ink rule. An amount is red and signed once the money is in the books; a bill still waiting is a document, not a movement, so it stays ink.

The band is meant to carry cash and bank. No statement has been imported, so there is no cash figure that is true, and it carries what is owed instead with a line saying why.

**The ten-second undo is real.** Posting is irreversible by design, so undo writes a second, opposite entry with a reason on it and both stay in the journal. It lives in the strip slot, which never changes height and is never drawn over the shutter. `tools/undo.js` records its own bill, posts it, takes it back and then reads the journal rather than the screen: both entries present, the reversal pointing at the original, what is owed back where it started.

The capture sheet is in the board's register too — square, full width, rising from the bottom with a grabber — and the button that commits now names the money ("Record MVR 4,250.00"), falling back to the blocker when one exists. That rule was in `DESIGN.md` and had never been followed in either register.

**Still to build:** site cash — spending it, counting it, asking for a top-up — and the board's own Snap and Review screens, which today are one sheet rather than the artboard's two.

**Done when:** a bill photographed on a site with no signal is in the books three taps later, once there is signal.

---

### 5. The photograph, kept

A bill without its paper is not a record. The image is stored and addressed by its own content hash, so the same photograph filed twice is stored once and an altered file is a different file, and it is retrievable against the entry for the five years the law requires.

This is the first half of what was one step; the backup half belongs with real money and is in milestone four.

**Done when:** every recorded bill has its photograph behind it, and opening an entry finds it without asking anyone.

---

### 6. Hide what is not ready

Invoices, Clients, Items, Payments and Expenses run on the purchased tool's own tables. They show figures that are wrong, empty, or unrelated to the ledger, and they are reachable from the navigation today. A screen that misleads is worse than one that is missing.

Each goes behind a flag until the step that rebuilds it arrives. Not deleted — the code is the reference for what replaces it.

**Done when:** every screen still reachable reads from the ledger, and nothing on screen is a figure nobody should trust.

---

### Milestone one is done when

A bill photographed on a site with no signal is in the books three taps later, once there is signal — and the person who photographed it never saw an accounting word.

---

# Milestone two — the books are complete

The largest of the four, and the one that matters most: it ends at the first point an accountant can look at this and tell you whether it is right.

---

### 7. Money owed to you

Sales invoices, customers, receipts and credit notes on the ledger rather than on the purchased tool's tables.

**Done when:** an invoice raised here posts a balanced entry, a receipt settles the right amount, the aged list is a ledger query, and **the purchased product's invoice and payment tables are gone.** Two places holding the same figure is how they come to disagree.

---

### 8. Cash and bank

Bank accounts and cash boxes as real accounts, with balances derived from the ledger and stored nowhere. Transfers between them. Boxes held by named people, spending with or without a bill, counts, top-ups.

**Done when:** no balance is stored anywhere, a cash count that does not balance is recorded with its reason rather than hidden, and **the purchased expenses table is gone.**

---

### 9. The bank agrees with the books

**You will be able to:** export a statement from internet banking, drop it in, and have most of it match itself. The app answers what it can and asks about the rest. Leaving one for later counts as an answer, so the list always clears.

**Under the bonnet:** the bank prints the same reference on the statement and on the transfer receipt your staff photograph, which is why most rows need no guessing. Card purchases carry no reference, which is why those are the ones it asks about. The column layout is read, not assumed, so another bank is configuration.

**Done when:** a real nine-month export imports cleanly, most rows match without help, nothing posts without a person saying so, and what is left unmatched appears in step 3.

---

### 10. Periods, and closing one

A period that can be closed, and a closed period that refuses new entries without a deliberate adjustment. Without this there is no such thing as a final figure and every report is provisional forever.

**Done when:** a closed month refuses an entry, an adjustment into it is possible, deliberate and recorded, and reopening is an act with a name on it.

---

### 11. The statements

Trial balance, profit and loss, balance sheet, from journal lines and nothing else. This is how an accountant checks the work; until they exist nobody outside can verify anything.

**Done when:** the trial balance is zero, the balance sheet balances, and both agree with the ledger at any date asked for.

---

### Milestone two is done when

Not a checklist. One sitting, on one company, with real records:

**Open a month. Record bills and invoices through it. Take payments. Import the bank statement and clear the exceptions. Close the period. Produce a trial balance that is zero, a profit and loss, and a balance sheet that balances — and have the accountant agree they are right.**

Until that has happened the books are not complete, whatever the individual steps say.

---

# Milestone three — the return files from here

The second half of the goal, and the thing nobody else does.

---

### 12. The tax engine

**Moved earlier in this revision, and the reason matters.** Bills currently hard-code 8%. Every bill recorded before this exists carries a rate the engine never set, and reconciling those afterwards is worse than ordering it correctly now, before the volume arrives.

Rates, periods, treatments and forms as versioned configuration with effective dates. A rate change must not rewrite history: a bill keeps the rate it was quoted at.

**Done when:** the Maldives pack drives everything the app hard-codes today, a second generic pack exists, and changing a rate from a date leaves every earlier bill untouched.

---

### 13. The return, ready before the deadline

**You will be able to:** open the tax centre any day and see what you owe so far, what still needs looking at, and how long is left. Before filing, see what is already correct and what would make the return wrong. Produce the figures and both spreadsheets in the format the portal expects, with every receipt behind them.

**Under the bonnet:** the other charges the authority collects, not tax alone — MIRA administers 24 revenue types and three of them apply to Altura and are not modelled.

**Done when:** one month produces a pack that is keyed into the portal without opening a spreadsheet, and the countdown appears in step 3.

---

### 14. Bringing history in

**Moved into the core in this revision.** Real money needs agreed opening balances, and an accountant cannot agree an opening balance without the prior records. It cannot sit after the modules.

Zoho Books, QuickBooks Online and Xero over OAuth; anything else with an API through the same connector interface; CSV as the floor.

**The rule that does not bend:** a connector posts through the same door as a person and never into the tables. Every imported record becomes a balanced entry through the same function, with the same constraints, numbering, seal and trail. Writing rows directly is how integrations are usually built and it would put a hole through every guarantee the ledger makes — the hash chain is worth nothing if anything can append beside it.

Every imported record carries which system it came from and that system's own id, so importing a month twice recognises itself. An import that cannot balance waits for a person. A connector proposes; a person accepts.

**Done when:** a year of Zoho history imports, the trial balance afterwards matches what Zoho said it was, and importing the same year again changes nothing.

---

### Milestone three is done when

One month produces a pack that is keyed into the portal without opening a spreadsheet, and last year's figures came across from Zoho and agree with what Zoho said they were.

---

# Milestone four — real money

Everything that has to be true before a real figure is entered.

---

### 15. More than one currency

Held in the currency it happened in, reported in the company's own, with the rate used stored rather than recomputed. Altura already banks in MVR and USD.

**Done when:** a USD bill and an MVR bill sit in the same books, the reported total is right, and last year's figures do not move when today's rate does.

---

### 16. The right people, and only their own job

**You will be able to:** add people and trust the boundaries. Site staff reach the camera and nothing else. A cash holder sees one number. A procurement officer sees their own orders. Directors read and never post.

**Done:** a request resolves to a company, checks membership, and carries capabilities.

**Still owed:** the screens for adding people, spending limits, passkeys, and ending every other session when a password changes.

---

### 17. Backup, and proving it restores

Nightly encrypted dumps and a monthly filing pack, somewhere that is not this server. For software holding the only copy of a company's books, the absence of this is not an omission but a liability — and the previous plan did not build it at all.

A backup nobody has restored is a hope, not a backup.

**Done when:** the whole thing restores onto an empty database, the seal verifies from the first record to the last, and the statements match what they said before.

---

### 18. Real money

Before a single real figure is entered: the accountant signs off the accounts structure, how director money is treated, and the first return. Opening balances agreed, which step 12 makes possible.

**A security review, and one thing named specifically.** Prove that one company cannot reach another's data through any route — not only at the database, where it is already proven, but through every endpoint, every export, every connector and every cached query. Multi-tenant isolation is the highest-risk property this system has, and "a security review" as a line item is not a plan for testing it. Then the line on the website saying nothing here is real comes off.

---

# Part two — the modules

Each switched on per company, invisible when off, and none may change how the core records money. Ordered by what the business actually does: equipment rental earns money today, from an excavator rented to RDC.

---

### 19. Projects and job costing

Budgets, cost codes, budget against actual, cost to complete, project profitability. Costs already hang off journal lines rather than documents, so a project report is a ledger query. First, because every bill Altura records wants a project on it.

---

### 20. Equipment and rental

Machine register, utilisation, hours, fuel and maintenance, machine-level profitability, rate cards. Second, because it is live revenue now.

---

### 21. Buying, and what actually arrived

A procurement officer buys twenty tonnes of cement on Tuesday and photographs the delivery note; the supplier invoices the office a fortnight later. Today those are two unrelated records, so the cost is counted twice or the invoice is paid with nobody checking it against what turned up. Ordered, received and invoiced quantities held separately and matched, partial deliveries included. Spending limits per person, and an approver above them.

**Done when:** an order, a delivery and an invoice for the same cement become one cost, not three, and a short delivery is caught before payment.

---

### 22. Construction

Bills of quantity, variations, progress claims, retention, certified work, work in progress. Needs the contract terms first.

---

### 23. Inventory and fuel

Quantity-based stock, landed cost, margin per unit.

---

### 24. Hospitality

Rooms, occupancy, ADR and RevPAR, food and beverage, guest deposits, agent commissions. When the hotel opens.

---

### 25. Payroll

Last. It touches tax differently in every jurisdiction, so it waits for the engine to be real.

---

# Part three — on top

---

### 26. The layer that watches

**Half of it already shipped.** Reading a photographed bill, deciding what is doubtful and asking only about that, landed in step 2. The previous plan described an assistant arriving at the end as though nothing existed. What is left is the part that needs a full set of books.

Only once the records beneath it are trustworthy, because an assistant reasoning over bad books is worse than none.

Continuous reconciliation. Anomalies raised as they happen rather than at month end. Cash now, expected in, committed out, and a forecast — four different things the market research is right to separate. Questions answered from the ledger with the underlying entries shown, never a figure without its workings.

**The rule that does not bend:** it may read, suggest and draft. It may not post. Accounting mathematics is not a thing an assistant gets an opinion about.

---

## What was wrong with the previous plan

Written 19 September 2026, reviewing the plan drafted earlier the same day. Recorded rather than quietly corrected, because a plan that is revised without saying why teaches nobody anything.

**It never built the thing the product is about.** "What needs you" is named in the product record as the central idea and the app's only notification surface. Twenty-two steps and it had no owner in any of them. It is now step 3, early, because it can be assembled from what already exists — bills waiting on a decision, a tax treatment nobody has established, a possible duplicate — and because a product whose headline capability is unscheduled is a product that will ship without it.

**The phone was missing.** The goal says every bill is recorded within minutes of arriving *by whoever is holding it*. That is a person on a site with a phone. No step built the phone board; step 2 mentioned it was owed, buried in a paragraph. If the goal needs it, it is core. It is now step 13.

**Bills were hard-coding 8% until step 9 built the tax engine.** Every bill recorded in between would carry a rate the engine never set, and reconciling them afterwards is worse than ordering it correctly. The tax engine moves to step 7, before the volume arrives.

**Opening balances needed history that arrived four steps later.** Real money was the last step and required agreed opening balances; importing from Zoho was step 19. An accountant cannot agree an opening balance without the prior records. Bringing history in moves into the core, as step 12.

**It created two sources of truth and never closed them.** Invoices, payments and expenses were to move onto the ledger while the purchased tables still held the same concepts, and no step retired the old ones. The product record forbids two places holding the same figure; the plan produced exactly that and left it. Every step that moves a concept onto the ledger now ends by removing what it replaced.

**There was no test for the core being finished.** Each step had its own "done when" but the core as a whole had none, so "100%" meant whatever anyone wanted it to. It has one now, at the end of part one, and it is a single sitting on real data rather than a checklist.

**Nothing backed anything up.** The product record promises nightly encrypted dumps and a monthly filing pack, and a five-year retention obligation. Twenty-two steps and not one of them built it. For software holding the only copy of a company's books that is not an omission, it is a liability.

**The assistant was placed last, but half of it already shipped.** Reading a photographed bill landed in step 2. The plan described an AI layer arriving at the end as though nothing existed. It now says what is already there and what the last step actually adds.

Two smaller things, fixed in place: the modules were in arbitrary order, so equipment rental — which earns money today, from an excavator rented to RDC — sat below a hotel that has not opened; and the security review was a generic line, when the specific thing worth proving is that one company cannot reach another's data through any route rather than only at the database.

## Carried from the design review

| What was wrong | Where it is handled |
|---|---|
| ~~The main button's label was invisible: white on yellow~~ | Fixed 19 Sep |
| ~~Marking an invoice paid took one click, with no confirmation and no undo~~ | Fixed 19 Sep, properly in step 2 |
| ~~The invoice list blanked on every keystroke~~ | Fixed 19 Sep |
| ~~Everything priced in US dollars; no tax number field~~ | Fixed 19 Sep. MVR throughout; tax number asked for when books are opened |
| ~~Sign-in screen still carries the purchased product's branding~~ | Fixed 19 Sep. Rebuilt as Site Board; the marquee file is deleted |
| ~~Four pop-ups a keyboard user cannot escape~~ | Fixed 19 Sep. One shared dialog, copied from the one that worked |
| No way to clear a backlog in bulk | Step 13, on the phone. Batch capture, not tick-boxes |
| No help anywhere | Step 11. The pre-filing checklist is the help |
| ~~The whole app loads in one 2.3 MB download~~ | Fixed 19 Sep. 2.35 MB to about 160 KB over the wire |

## Not doing

Recorded so these stop being reconsidered.

Revised 19 September 2026. Widening the product to serve companies beyond Altura, with modules and jurisdiction packs, moved several of these from "not doing" into the plan — they are now steps 13 to 19. What is still deliberately out:

**Public sign-up, self-serve onboarding and billing.** The product is built to serve any company; getting a company into it is still done by hand. That is a business decision, not an architectural one, and nothing in the build prevents it later.

**Filing on anyone's behalf.** There is no public MIRA filing API and there is no equivalent elsewhere. The app produces a pack a person keys in. Any claim of one-click filing would be false.

**Payroll before the tax engine.** It touches tax differently in every jurisdiction, so building it against hard-coded rules would mean building it twice.

**An assistant that posts.** It may read, suggest and draft. Accounting mathematics is not something it gets an opinion about, and the market research names this as the principle its own Layer 1 rests on.

**Dhivehi**, for now — though nothing may be built that assumes English forever.

**Replacing the current tool for sales invoices** until step 3 lands. Zoho keeps issuing them in the meantime, and step 19 is what brings that history across.

**Permanent two-way sync with another accounting product.** Running alongside is a migration state with an end, not a feature. Two systems holding the same figure is how they come to disagree, and deciding which one is right afterwards is a job nobody wants.
