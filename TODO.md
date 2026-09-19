# Build plan

Revised 19 September 2026, after the web app critique scored 14 out of 40 and the owner chose to rebuild the app against the designs.

## The goal

**Altura's books are kept in Sentryfi. Every bill is recorded within minutes of arriving, by whoever is holding it, and every GST return is filed from the app by the 28th.**

That is the whole of it. It is not a feature list and it does not change. Every decision below is judged against it: does this get a bill into the books faster, or a return filed more safely? If neither, it waits.

## The direction

One line, not parallel tracks. The running app is a purchased single-user invoicing tool with the brand applied; the designs and `docs/data-model.md` are the product. The direction is to grow the first into the second, foundation upward, replacing the domain model rather than decorating it.

Two rules hold throughout:

- **No phase starts before the one above it is done.** The ledger is underneath everything, so building capture on a float-based record store means building it twice.
- **Nothing ships that records real money until Phase 6.** The app stays honest about being in build. `docs/real-world-samples/fixtures.json` is the seed.

## Where it stands

| | |
|---|---|
| Live | `sentryfi.app`, Railway, Singapore, one service, Postgres attached |
| Running | The purchased app, rebranded: clients, invoices, expenses, payments, items, reports, settings |
| Designed | The phone flow in 45 panels, the web suite in 7, tax centre, bank reconciliation, brand |
| Specified | `docs/data-model.md`, `docs/shape-app-shell.md`, `docs/shape-petty-cash.md` |
| Critique | 14/40. Two P0s fixed. The domain model is still the purchased product's |

---

## Phase 1 · The ledger

Nothing above this is trustworthy until it exists. The running app stores money as floating point, has no journal, no companies and no transactions.

- [ ] Money becomes an integer count of laari everywhere, column names carrying the `_laari` suffix. No float touches an amount again.
- [ ] `companies`, `users`, `memberships` with a role per membership. Row-level security by `company_id`, enforced in Postgres, not in route handlers.
- [ ] `accounts`, `journal_entries`, `journal_lines`, with the deferred constraint that every entry balances at commit and the check that a line is a debit or a credit, never both.
- [ ] Gapless `entry_no` per company, allocated inside the transaction.
- [ ] Hash chain: each entry stores the previous entry's hash and its own.
- [ ] Every multi-statement write runs in a transaction. There are none today.
- [ ] Migration that carries the existing invoices, expenses and payments across as opening entries, or discards them deliberately and says so.

**Done when:** a bill posts a balanced two-sided entry, the chain verifies end to end, and a query for a second company returns nothing.

## Phase 2 · Capture

The owner's hardest job, and the reason the product exists.

- [ ] `bills` and `bill_lines` as payables, with `gst_treatment` recorded per document: inclusive, exclusive, none because unregistered, exempt, zero-rated, unknown. Unknown blocks posting.
- [ ] `counterparties` with `also_known_as`, because one real invoice spells its issuer two ways and the bank truncates it to 35 characters.
- [ ] The snap, review and confirm flow from `design/project/App.dc.html`, including the rule that review only asks about what it doubts.
- [ ] Duplicate detection on the attachment hash first, then supplier, amount and date. PRODUCT.md names paying twice as the most expensive error the system can make.
- [ ] A ten-second undo after posting, and reversal with a reason after that. Never delete.
- [ ] Site cash boxes per `docs/shape-petty-cash.md`: a box is a ledger account with a named custodian, spending with and without a bill, counting, and "I paid it myself".
- [ ] Attachments to R2, with the OneDrive archive filename recorded.

**Done when:** a bill photographed on site is in the books in three taps, a duplicate is caught before it posts, and a cash count that does not balance is recorded with its reason.

## Phase 3 · Money in

- [ ] Sales invoices rebuilt on the ledger, replacing the purchased model. The live document preview survives; the float totals do not.
- [ ] Money In with a source: director by name, Steva Enterprises, Steva Hotels, RDC rental, other.
- [ ] Directors' contributions as a view of Money In grouped by person, not a section of the app.
- [ ] Intercompany: when the company billed is not the company that paid, ask, then mirror both sides.

**Done when:** a director's cash contribution and an RDC rental invoice both post correctly, and the Maalhos Council case (billed to Steva, paid by Altura) is caught and mirrored.

## Phase 4 · Reconcile

- [ ] Bank statement import per `docs/real-world-samples/bml-csv-import.md`: no header row, Excel formula escaping, two date orders, mixed decimal places, eight transaction types, and the malformed last rows that must not reject the file.
- [ ] Auto-match on the BLAZ reference, which prints on both the statement and the transfer receipt.
- [ ] The screen from `design/project/Bank.dc.html`: answer only the rows the matcher would not place, and let "leave for later" count as an answer.

**Done when:** the real 1,094-row export imports, most rows match themselves, and nothing posts without a person saying so.

## Phase 5 · File

The differentiator. Nobody else does this.

- [ ] Projects and cost codes on journal lines, so project cost is a ledger query.
- [ ] GST period assembled as you go: output tax, input tax, net.
- [ ] The pre-filing checklist from `design/project/Tax.dc.html`, separating what is already correct from what would make the return wrong.
- [ ] MIRA 205 figures, and both Excel statements in the fixed template with the exact tab name.
- [ ] The other revenue types that apply, from `docs/real-world-samples/mira-revenue-types.md`: Company Annual Fee, Withholding Tax, Remittance Tax.

**Done when:** one period produces a pack the owner keys into MIRAconnect without opening a spreadsheet.

## Phase 6 · The people

- [ ] The six roles enforced in the database: owner, director, accountant, office admin, site staff, auditor.
- [ ] Site staff reach the camera and nothing else. A cash holder sees one number, their own box.
- [ ] Directors see Money In and project progress, and never post.
- [ ] Passkeys, with a fallback. Password change invalidates sessions, which it does not today.
- [ ] Nightly encrypted dumps and the monthly pack to OneDrive.

**Done when:** each of the six signs in and can reach exactly their own job, verified by trying to reach someone else's.

## Phase 7 · Real money

- [ ] The accountant signs off the chart of accounts, the funding treatment and the first return.
- [ ] A security review before real money moves.
- [ ] Opening balances entered and agreed.
- [ ] The honest line comes off the landing page.

---

## Carried from the critique, folded into the phases above

| Finding | Where it is handled |
|---|---|
| ~~White on signal yellow, 1.67:1~~ | Done 19 Sep |
| ~~Money changing with no confirmation, undo or announcement~~ | Done 19 Sep, and properly in Phase 2 |
| Wrong currency, wrong domain, no TIN field | Phases 1 and 5 |
| The front door still belongs to the purchased product | Before Phase 2, it is half a day |
| Four inaccessible money modals, tabs that are not tabs | Before Phase 2. One dialog primitive, taken from `MobileNav.jsx` |
| No bulk actions, for a backlog | Phase 2. Batch capture is the answer, not multi-select |
| No help anywhere | Phase 5. The checklist is the help |
| 2.3 MiB single bundle, no route splitting | Before Phase 6 |
| `keepPreviousData`, a v4 option on a v5 project | Immediate, one line |

## Not doing

Recorded so they stop being reconsidered.

- Multi-tenant sign-up, billing, public onboarding. Altura first, built so it can be added later.
- Sales invoicing replacing Zoho. Undecided, and not on this line.
- Hotel operations: TGST, Green Tax, occupancy. Deferred until the hotel operates; the tax engine stays configurable for them.
- Retention, progress billing and work in progress. They need the contract terms first.
- Dhivehi. English first. Layout must not assume Latin forever.
