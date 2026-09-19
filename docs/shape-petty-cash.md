# Shape: site cash and paying people back

Status: drafted 19 September 2026 from the owner's brief — site staff hold petty cash, spend it, come back with bills for some of it and nothing for the rest; keep the account management easy; cover reimbursements. Gaps filled by decision rather than by question, and every decision is listed so it can be overturned.

## What the shell assumes today, and why it breaks

Cash in the build is a single number and two labels. `state.cash` holds one aggregate figure; `Site cash box · Hotel` and `Office cash box` exist only as strings in the account chooser, alongside the banks. Cash is modelled as **an account you pay from**.

Real petty cash is **money in a named person's pocket**, and three things follow that the shell has nowhere to put.

**Custody.** MVR 5,000 in the site box is not company cash the way bank money is. It is one person's responsibility until it is spent or returned. Nothing in the product can answer "who is holding how much, right now".

**Spending with nothing to snap.** The promise is snap it, record it, done. A boat fare, a porter, a bag of sand from a market stall produce no paper at all. Today that spend simply does not exist in the books until someone notices the box is light.

**The box never balances exactly.** What the record says and what is physically in the box differ, routinely and innocently. There is no way to say so.

And two different things are both called reimbursement: **topping the box back up**, and **paying back someone who spent their own money**. They are different movements with different counterparties and the product needs both.

## Decisions

Seven, made rather than asked. Each is reversible.

**1. A person holding cash sees one number: what is left in their own box.**
This is a deliberate exception to "site staff never see balances" in `PRODUCT.md`. Someone carrying MVR 5,000 cannot do the job blind. The exception is as narrow as it can be: their own box only, never company cash, never the bank, never another person's box, never the ledger. Everything else about the role is unchanged.

**2. Spending without a bill is a first-class path, not a degraded one.**
Same prominence as the shutter, same three taps: how much, what for, done. Making it feel like a failure state is what drives people to skip recording it, which is the outcome that actually costs money.

**3. No bill means no tax back, said plainly at the moment of recording.**
Not a warning, not a penalty, a fact. The real documents in `docs/real-world-samples/` already teach this: Island Zone and the Maalhos Council issue no tax line, and claiming input tax on them would be a false claim. Spending with no paper at all is the same situation. One quiet line: "No bill, so no tax back on this one."

**4. Site staff never choose a cost code.**
`PRODUCT.md` gives them tagging and nothing else, and describes them as untrained in bookkeeping. "What for" is five plain things they actually buy: fuel, boat or transport, food for the crew, small materials, something else. The office maps those to cost codes. Asking an untrained person to pick between "Site overheads" and "Equipment" produces confident wrong answers, which are worse than blanks.

**5. Staff can ask for a top-up. Only the Owner or Office admin can move the money.**
A request is a message, not a transaction. Authority to move money stays where the role matrix already puts it.

**6. A count that does not balance is recorded, not hidden, and "not sure" is an allowed reason.**
Reasons offered: spent but no bill yet, lost, miscounted, not sure. Forcing someone to pick a reason they do not believe corrupts the record and teaches them the app punishes honesty. The difference posts to its own line either way.

**7. "I paid it myself" is a toggle on any capture, with a bill or without.**
It changes where the money came from, from the box to the person, and creates an amount owed back to them. The owner sees one total for what the company owes its people and settles it from the bank or the box.

## Flow

```
Owner ─── Top up ──────────────▶ Site cash box (held by a named person)
                                        │
        ┌───────────────────────────────┤
        │                               │
   Spend with a bill              Spend, no bill
   (existing snap flow,           (how much, what for, done)
    charged to the box)                 │
        │                               │
        └───────────────┬───────────────┘
                        ▼
                  What is left
                        │
                 Count the box ──▶ matches ──▶ done
                        │
                        └────────▶ differs ──▶ reason ──▶ recorded as its own line

Any capture ── "I paid it myself" ──▶ We owe you MVR X ──▶ Owner settles
```

## Screens

**Site cash** (the person holding the box). One number, big: what is left. Under it, what they have spent today. Two equal actions: spend with a bill, spend with no bill. A quieter third: count the box. No ledger, no bank, no other boxes.

**Spend, no bill.** Amount first, because it is the only thing they certainly know. Then what for, as five chips. An optional note, because "Maalhos-Male 1 Pax" in a real transfer remark is exactly how this business describes a boat fare. The "I paid it myself" toggle. The commit names the money and where it comes from, as everywhere else in the product.

**Count the box.** What is physically there. The difference appears as they type. If it is zero the screen goes quiet and confirms. If not, the reason chips appear.

**Cash boxes** (Owner). Who holds what, when each was last counted, how much is unaccounted for since. Top up from here.

## Terminology

One name per thing, per the Consistency rule.

| Concept | On the phone | Never |
|---|---|---|
| The money a person carries | Site cash, the cash box | Petty cash, float, imprest |
| Adding money to it | Top up | Replenish, reimburse the float |
| Checking what is physically there | Count the cash box | Reconcile, verify, audit |
| The gap between record and reality | Difference | Variance, discrepancy, shortage |
| Money owed to a person who paid | We owe you | Reimbursement payable, expense claim |
| Settling that | Pay back | Disburse, settle claim |

## Underneath, on the desktop only

The phone shows none of this. The Accountant view does.

| Event | Debit | Credit |
|---|---|---|
| Top up the box | Petty cash, per box | Bank |
| Spend with a bill | Expense, by cost code, plus input GST | Petty cash |
| Spend, no bill | Expense, by cost code, **no input tax** | Petty cash |
| Paid it themselves | Expense, by cost code | Owed to that person |
| Pay them back | Owed to that person | Bank or petty cash |
| Count comes up short | Cash short and over | Petty cash |
| Count comes up long | Petty cash | Cash short and over |

Each box is its own account, so custody is a ledger fact rather than a note. The hash-chained, void-never-delete rules apply here as everywhere.

## What this does not cover

Deliberately out of scope for this round, listed so the gaps are known rather than forgotten.

- **Cash advances against wages.** Money handed to a worker that is not an expense at all. Different animal, needs the payroll treatment first.
- **Multiple boxes held by one person**, or a box handed from one person to another mid-project. Handover is a real event on a construction site and will need its own flow.
- **Currency.** Boxes are rufiyaa only for now. The bank accounts already model USD; boxes do not.
- **A spending limit per person or per entry.** Worth having, needs the owner to set the numbers.
