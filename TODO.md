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

One line. Each step finishes before the next starts, because building on a foundation that is about to be replaced means building twice.

Steps 1 to 12 are **the core**, and it is not finished until all twelve are. Steps 13 onward are the modules, each switched on per company. The AI layer sits on top of all of it and is built last, because it can only be as good as the records underneath it.

---

# Part one — the core

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

### 3. Money owed to you

Sales invoices on the ledger rather than on the purchased tool's tables. Customers, what they owe, what is overdue, receipts against invoices, credit notes.

**Done when:** an invoice raised here posts a balanced entry, a receipt against it settles the right amount, and the aged list is a ledger query rather than a document query.

---

### 4. Cash and bank

Bank accounts and cash boxes as real accounts in the books, with balances that come from the ledger. Transfers between them. Cash boxes held by named people, spending with or without a bill, counts, and top-ups.

**Done when:** every account's balance is derived from journal lines and nothing stores a balance of its own, and a cash count that does not balance is recorded with its reason rather than quietly hidden.

---

### 5. The bank agrees with the books

**You will be able to:** export a statement from internet banking, drop it in, and have most of it match itself. The app answers the ones it can and asks about the rest. Leaving one for later counts as an answer, so the list always clears.

**Under the bonnet:** the bank prints the same reference on the statement and on the transfer receipt your staff photograph, which is why most rows need no guessing. Card purchases carry no reference, which is why those are the ones it asks about. The file's column layout is read, not assumed, so a change at the bank does not break the import and another bank's format is configuration rather than code.

**Done when:** a real nine-month export imports cleanly, most rows match without help, and nothing posts without a person saying so.

---

### 6. Periods, and closing one

A period that can be closed, and a closed period that refuses new entries without a deliberate adjustment. Without this there is no such thing as a final figure, and every report is provisional forever.

**Done when:** a closed month refuses a new entry, an adjustment into it is possible, deliberate and recorded, and reopening is an act with a name on it.

---

### 7. The statements

Trial balance, profit and loss, and balance sheet, produced from journal lines and from nothing else. These are how an accountant checks the work, and until they exist nobody outside can verify anything.

**Done when:** the trial balance is zero, the balance sheet balances, and both agree with the ledger at any date asked for.

---

### 8. More than one currency

Amounts held in the currency they happened in, reported in the company's own, with the rate used stored rather than recomputed on read. Altura already banks in MVR and USD.

**Done when:** a USD bill and an MVR bill sit in the same books, the reported total is right, and last year's figures do not move when today's rate does.

---

### 9. The tax engine

Rates, periods, treatments and forms as versioned configuration with effective dates. A rate change must not rewrite history: a bill keeps the rate it was quoted at. A new country must be a pack, not a release.

**Done when:** the Maldives pack drives everything the app currently hard-codes, a second generic pack exists, and changing a rate from a date leaves every earlier bill untouched.

---

### 10. The return, ready before the deadline

The thing nobody else does.

**You will be able to:** open the tax centre any day of the month and see what you owe so far, what still needs looking at, and how long is left. Before filing, see plainly what is already correct and what would make the return wrong. Produce the figures and both spreadsheets in the exact format the portal expects, with every receipt behind them.

**Under the bonnet:** the other charges the authority collects, not tax alone — MIRA administers 24 revenue types and three of them apply to Altura and are not modelled yet.

**Done when:** one month produces a pack that is keyed into the portal without opening a spreadsheet.

---

### 11. The right people, and only their own job — foundation done 19 September 2026

**You will be able to:** add people and trust the boundaries. Site staff reach the camera and nothing else. A cash holder sees one number. A procurement officer sees their own orders. Directors read and never post.

**What is done:** a request resolves to a company, checks the person is a member, and carries what they may do. Roles are per company, because the owner is a director of several and is not the same thing in each. Permissions are one table of capabilities, so "who may post an adjustment?" is answered by reading one place. Screens ask by capability, never by role name.

**Still owed:** the screens for adding people, spending limits, passkeys, and ending every other session when a password changes.

---

### 12. The paper, kept

Every record's supporting document attached and addressed by its own content hash, so the same photograph filed twice is stored once and an altered file is a different file. Retrievable by name for the five years the law requires.

**Done when:** an auditor can open a folder and find the document behind any entry without asking anyone.

---

# Part two — the modules

Each switched on per company, invisible when off, and none of them may change how the core records money.

---

### 13. Projects and job costing

Budgets, cost codes, budget against actual, cost to complete, project profitability. Costs already hang off journal lines rather than documents, so a project report is a ledger query.

### 14. Buying, and what actually arrived

A procurement officer buys twenty tonnes of cement on Tuesday and photographs the delivery note; the supplier invoices the office a fortnight later. Right now those are two unrelated records, so the cost is counted twice or the invoice is paid without anyone checking it against what turned up. Ordered, received and invoiced quantities held separately and matched, partial deliveries included. Spending limits per person, and an approver above them.

**Done when:** an order, a delivery and an invoice for the same cement become one cost, not three, and a short delivery is caught before payment.

### 15. Construction

Bills of quantity, variations, progress claims, retention, certified work, work in progress. Needs the contract terms first.

### 16. Equipment and rental

Machine register, utilisation, hours, fuel and maintenance, machine-level profitability, rate cards. Altura already rents an excavator to RDC.

### 17. Inventory and fuel

Quantity-based stock, landed cost, margin per unit.

### 18. Hospitality

Rooms, occupancy, ADR and RevPAR, food and beverage, guest deposits, agent commissions. Waits for the hotel to open.

### 19. Payroll

Last of the modules. It touches tax differently in every jurisdiction, so it waits for the tax engine to be real.

---

# Part three — on top

---

### 20. The layer that watches

Only once the records beneath it are trustworthy, because an assistant reasoning over bad books is worse than none.

Continuous reconciliation. Anomalies raised as they happen rather than at month end. Cash now, expected in, committed out, and a forecast — four different things the market research is right to separate. Questions answered from the ledger with the underlying entries shown, never a figure without its workings.

**The rule that does not bend:** it may read, suggest and draft. It may not post. Accounting mathematics is not a thing an assistant gets an opinion about.

---

### 21. Real money

Before a single real figure is entered: the accountant signs off the accounts structure, how director money is treated, and the first return. A security review. Opening balances agreed. Then the line on the website saying nothing here is real comes off.

## Carried from the design review

| What was wrong | Where it is handled |
|---|---|
| ~~The main button's label was invisible: white on yellow~~ | Fixed 19 Sep |
| ~~Marking an invoice paid took one click, with no confirmation and no undo~~ | Fixed 19 Sep, properly in step 2 |
| ~~The invoice list blanked on every keystroke~~ | Fixed 19 Sep |
| Everything priced in US dollars; no tax number field | Currency and the tax numbers landed with step 1. What the screens show follows in step 2 |
| Sign-in screen still carries the purchased product's branding | Still open. Before step 2. Half a day |
| ~~Four pop-ups a keyboard user cannot escape~~ | Fixed 19 Sep. One shared dialog, copied from the one that worked |
| No way to clear a backlog in bulk | Step 2. Batch capture, not tick-boxes |
| No help anywhere | Step 6. The pre-filing checklist is the help |
| ~~The whole app loads in one 2.3 MB download~~ | Fixed 19 Sep. 2.35 MB to about 160 KB over the wire |

## Not doing

Recorded so these stop being reconsidered.

Revised 19 September 2026. Widening the product to serve companies beyond Altura, with modules and jurisdiction packs, moved several of these from "not doing" into the plan — they are now steps 13 to 19. What is still deliberately out:

**Public sign-up, self-serve onboarding and billing.** The product is built to serve any company; getting a company into it is still done by hand. That is a business decision, not an architectural one, and nothing in the build prevents it later.

**Filing on anyone's behalf.** There is no public MIRA filing API and there is no equivalent elsewhere. The app produces a pack a person keys in. Any claim of one-click filing would be false.

**Payroll before the tax engine.** It touches tax differently in every jurisdiction, so building it against hard-coded rules would mean building it twice.

**An assistant that posts.** It may read, suggest and draft. Accounting mathematics is not something it gets an opinion about, and the market research names this as the principle its own Layer 1 rests on.

**Dhivehi**, for now — though nothing may be built that assumes English forever.

**Replacing the current tool for sales invoices** until step 3 lands. Zoho keeps issuing them in the meantime.
