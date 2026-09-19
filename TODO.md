# Build plan

Revised 19 September 2026. Written so anyone can follow it, not just whoever wrote the code.

## The goal

**Altura's books are kept in Sentryfi. Every bill is recorded within minutes of arriving, by whoever is holding it, and every tax return is filed from the app on time.**

That does not change. Every decision is judged against one question: does this get a bill into the books faster, or a return filed more safely? If neither, it waits.

## Two halves, two standards

**The front is for people who are not accountants.** The person using it is on a jetty, in a truck, or between meetings. They are building things, finding work and closing deals. The books are not their job; they are a thing that must stay right while they do their job. So the app never asks them to understand accounting, never uses a word they would have to look up, and never waits to be asked what needs doing.

**The back is held to the standard a real accounting system is held to.** Correct double-entry, money that cannot drift by a laari, an audit trail nobody can quietly edit, and each company's books sealed off from the others. An accountant should be able to open it, recognise everything, and sign off on it.

Both at once. Simple on top is only honest if it is correct underneath.

## How the app carries the weight

The point is not that the app has an accounting engine. It is that the engine does the remembering, so the person does not have to.

Three things follow, and they shape every screen:

**It tells you what needs you.** One place that answers "what am I holding up?" Bills nobody has read. A supplier billed twice. A cash box nobody has counted in three weeks. Eleven days to the filing deadline and two things still wrong with the return. The owner should never have to go looking for the thing that is about to bite.

**It only asks when it is genuinely unsure.** A clear bill from a known supplier goes in without a question. A bill that might be a duplicate, an amount it could not read, a supplier it has never seen: those it puts in front of a person. Everything else it handles.

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

---

### 1. Get the money right — done 19 September 2026

Today the app stores amounts the way a calculator does, which drifts by fractions of a laari and cannot be trusted to add up. Everything else is built on this, so it goes first.

**You will be able to:** nothing new yet. This is the floor.

**Under the bonnet:** amounts stored as whole laari, never as decimals. Every change to the books written as a balanced two-sided entry. Each entry sealed against the one before it, so an altered record shows. Each company's books walled off in the database rather than by the app remembering to filter. Nothing half-written: a change either lands completely or not at all.

**Done when:** a bill produces a balanced entry, the seal verifies from the first record to the last, and a query for another company's books comes back empty.

**What happened.** All three hold, checked against the real database rather than a stand-in, because the parts that matter here are exactly the parts a stand-in gets wrong. `npm run ledger:selftest` runs 40 checks inside a transaction it rolls back, so it is safe to run against live data and leaves nothing behind. It passes.

Worth knowing:

- **Nothing had to be migrated.** The question was whether to carry the existing records over or start clean. The database turned out to hold one user account and nothing else — no invoices, no expenses, no customers. So there was no decision to make. The ledger sits alongside the old tables, which are still what the screens use until step 2 moves them.
- **One real problem was found and fixed.** Railway hands out a Postgres superuser, and a superuser ignores the walls between companies completely. Written the obvious way, the isolation rules would have been present, correct, and protecting nobody — and would have looked right in the code. The app now steps into a restricted role for the length of each transaction. A useful side effect: the app has no permission to alter or delete a posted record, so a bug cannot do it either.
- **The seal earns its place.** The test doctors a bill from MVR 4,250.50 to MVR 42,500.50 on both sides at once, with the safety triggers switched off, which is what someone with direct database access would do. The entry still balances and the books still add up, so nothing else notices. The seal catches it and names the altered entry.
- **A correction never hides anything.** Reversing an entry writes a new opposite entry with a reason. The original stays. Reversing the same thing twice is refused.

---

### 2. Get bills in, from wherever they arrive

The owner's hardest job, and the reason this exists.

**You will be able to:** photograph a bill and have it in the books in three taps. Hand a cash box to someone on site and see what they spend, with a bill or without. Catch a supplier billed twice before it is paid twice. Undo the last ten seconds. Correct anything afterwards, with a reason, without deleting it.

**Under the bonnet:** bills as money owed, each recording which way its tax was quoted, because some suppliers add it on top, some include it, and many are not registered and charge none. Suppliers matched loosely, because one real invoice spells its own issuer two different ways. Receipt images filed where an auditor can find them by name.

**Done when:** a bill photographed on site is in the books in three taps, a duplicate is stopped before it posts, and a cash count that does not balance is recorded with its reason rather than quietly hidden.

---

### 3. Buying, and what actually arrived

New, from the procurement scenario. Today a site purchase becomes one photograph and a hope.

**The problem it solves.** A procurement officer buys twenty tonnes of cement on Tuesday and photographs the delivery note. The supplier invoices the office a fortnight later. Right now those are two unrelated records, so the cost is counted twice or the invoice is paid without anyone checking it against what turned up. On a construction job that happens weekly.

**You will be able to:** record what was ordered, confirm what arrived, and have the supplier's invoice line up against both. If the invoice says twenty tonnes and eighteen arrived, the app says so before anyone pays. Give a procurement officer a spending limit, so purchases above it wait for an approver, and purchases below it just happen.

**Under the bonnet:** the ordered, received and invoiced quantities held separately and matched. Approval thresholds per person. Partial deliveries handled, because they are normal.

**Done when:** an order, a delivery and an invoice for the same cement become one cost, not three, and a short delivery is caught before payment.

---

### 4. Money coming in

**You will be able to:** raise an invoice and see it as the customer will. Record money in against where it came from: a director, another company in the group, the excavator rental. See each director's contributions and running total without maintaining a second list. When a bill is addressed to one company and paid by another, be asked, then have both sides recorded.

**Done when:** a director's cash and an equipment rental invoice both land correctly, and the real case of a council bill addressed to one company and paid by another is caught and mirrored.

---

### 5. The bank agrees with the books

**You will be able to:** export a statement from internet banking, drop it in, and have most of it match itself. The app answers the ones it can and asks about the rest. Leaving one for later counts as an answer, so the list always clears.

**Under the bonnet:** the bank prints the same reference on the statement and on the transfer receipt your staff photograph, which is why most rows need no guessing. Card purchases carry no reference, which is why those are the ones it asks about. The file's column layout is read, not assumed, so a change at the bank does not break the import.

**Done when:** a real nine-month export imports cleanly, most rows match without help, and nothing posts without a person saying so.

---

### 6. The return, ready before the deadline

The thing nobody else does.

**You will be able to:** open the tax centre any day of the month and see what you owe so far, what still needs looking at, and how long is left. Before filing, see plainly what is already correct and what would make the return wrong. Produce the figures and both spreadsheets in the exact format the portal expects, with every receipt behind them.

**Under the bonnet:** costs carried against projects and cost codes, so project spending is a question the books answer rather than a spreadsheet someone maintains. The other charges the authority collects, not tax alone.

**Done when:** one month produces a pack that is keyed into the portal without opening a spreadsheet.

---

### 7. The right people, and only their own job

**You will be able to:** add the people above and trust the boundaries. Site staff reach the camera and nothing else. A cash holder sees one number. A procurement officer sees their own orders. Directors read and never post.

**Under the bonnet:** enforced in the database, not in the screens, so no missing check anywhere can leak one person's data to another. Sign-in by passkey. Changing a password ends every other session, which it does not today.

**Done when:** each role signs in and can reach exactly their own job, proven by trying to reach someone else's and failing.

---

### 8. Real money

Before a single real figure is entered: the accountant signs off the accounts structure, how director money is treated, and the first return. A security review. Opening balances agreed. Then the line on the website saying nothing here is real comes off.

---

## Carried from the design review

| What was wrong | Where it is handled |
|---|---|
| ~~The main button's label was invisible: white on yellow~~ | Fixed 19 Sep |
| ~~Marking an invoice paid took one click, with no confirmation and no undo~~ | Fixed 19 Sep, properly in step 2 |
| ~~The invoice list blanked on every keystroke~~ | Fixed 19 Sep |
| Everything priced in US dollars; no tax number field | Currency and the tax numbers landed with step 1. What the screens show follows in step 2 |
| Sign-in screen still carries the purchased product's branding | Before step 2. Half a day |
| Four pop-ups a keyboard user cannot escape | Before step 2. One shared component, copied from the one that works |
| No way to clear a backlog in bulk | Step 2. Batch capture, not tick-boxes |
| No help anywhere | Step 6. The pre-filing checklist is the help |
| The whole app loads in one 2.3 MB download | Before step 7 |

## Not doing

Recorded so these stop being reconsidered.

Selling Sentryfi to other businesses, with sign-up and billing. Altura first, built so it can be opened up later without a rewrite. Replacing the current tool for sales invoices, which is undecided. Hotel taxes, until the hotel opens. Retention and progress claims, which need the contract terms first. Dhivehi, though nothing may be built that assumes English forever.
