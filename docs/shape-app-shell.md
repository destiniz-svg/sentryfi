# Sentryfi app shell and screens: shape brief

Status: confirmed by the owner on 19 September 2026 with three answers: roles are Owner, Director, Accountant / CFO, Office admin (plus Site staff from the earlier round; External auditor retained pending confirmation); Directors view only; the night board follows the device appearance automatically with an override. Written from the shape interview and the direction round (seed key 49afc33d, assigned direction "Site Board", chosen by the owner). The direction contract lives in the surface brief for `design/project/App.dc.html`.

## 1. Job and audience

- **Surface:** the whole Sentryfi app: navigation shell, the eleven screens from the plan, role-specific views, and the desktop layout for office roles. Mode: **Operate**. Login and first-run are in scope as states, not as a marketing surface.
- **Who arrives:** the Owner on a phone, on site or in the car, one-handed, in bright sun, with a bill in the other hand and thirty seconds. Site staff with the same phone conditions and no bookkeeping knowledge. Directors on a phone in the evening asking "what have I put in and where does it stand." The Accountant and Auditor at a desk on a laptop, on a closed period, with a checklist.
- **State of mind:** the Owner wants it recorded and gone. Staff want to not get it wrong. Directors want reassurance. The Accountant wants to find the one wrong entry fast.

## 2. Outcome and proof

- **Primary task:** record a bill in three taps and trust that the books are right. Everything else on the shell exists to show the consequence of that: balances, what is owed, project spend, and the next tax deadline.
- **Success:** zero backlog; every receipt has an image, a journal, and a OneDrive filename within minutes; cash and bank match the real world; the GST pack is complete on the 20th, filed by the 28th.
- **Product truth to prove on screen:** per-field confidence, the mandatory review, duplicate detection, a balanced journal behind every entry, an audit hash, the archive filename, and a filing pack in MIRA's exact format. These are the trust cues; they are shown, never claimed.
- **Sample data:** all figures in mockups are illustrative and labelled as such. No real balances exist yet.

## 3. Selected direction: Site Board

- **World:** construction site signage and survey instruments. Safety yellow and ink black on a white board; stencil-cut condensed labels; the hazard chevron reserved for deadlines; the graduated levelling staff as the single rule every amount hangs on. Palette: Signal yellow #F2C300, Ink #141414, Board white #FFFFFF, Concrete #6B7078, Money in #167A41, Money out #C62B20. Type: Barlow Condensed for display and labels, Barlow for body and numerals with tabular figures.
- **Thesis:** the books as a site notice board, readable at arm's length in equatorial sun. The category default it refuses: a dark bento dashboard of rounded cards with a glowing accent.
- **Structural rules (raised by the hand it beat):** one ruling axis per screen, every amount right-aligned to it; every action recoverable, void instead of delete, undo named as such; numerals on a fixed 8px graticule; fixed regions that never move, navigation swaps content not layout; logo and components drawn from one geometric system (disc and rule).
- **First viewport (Home, phone):** a full-width yellow band with today's cash and bank total in huge condensed numerals and the company name; a black chevron strip beneath it counting down to the GST deadline; then a ruled list of the latest money in and out, amounts aligned to one vertical rule; a project budget rule; the Snap shutter as a black disc on yellow, bottom centre, in thumb reach. No cards.
- **Signature interaction:** the Snap shutter. Press and hold shows the project tag; release snaps. After confirm, the new entry slides onto the Home rule from the right and the yellow band's total re-counts, so the consequence of recording is visible within one second.
- **Cross-surface reach:** the same rule and band grammar on desktop: the rule becomes the table's amount column, the band becomes the page header. Night and desktop invert to the ink board with yellow text where the user chooses.
- **Honest risk:** yellow and black read as warning if overused. Discipline: one yellow field per screen.
- **Brand:** name Sentryfi, one capital. The mark is a yellow disc with an ink ring, one level line, and a post standing on the line: a lens, a level, and a sentry keeping watch, drawn from the same disc-and-rule system as the UI. Files in `brand/`. Logo wordmark is live Barlow text in the SVGs and must be outlined before print.
- **2026 interface research applied:** one next action surfaced on Home (the band and the chevron strip); Review as a bottom sheet over the capture for one-hand use; tinted glass only on the floating navigation layer, never on content (Apple reduced glass transparency for iOS 27); passkey and Face ID as the default login; one orchestrated confirmation moment (entry slides onto the rule, total re-counts) instead of scattered micro-interactions; CSS view transitions and scroll-driven animation in the Next.js build rather than JS animation libraries where possible; haptics only where the installed PWA allows, never faked.

## 4. Scope and boundaries

- **Fidelity:** production-ready screens, phone first at 390 wide, desktop layout at 1280 to 1440 for office roles.
- **Breadth:** the shell plus every screen listed in section 6. Hotel operations (TGST, Green Tax, occupancy) are out until the hotel operates. Public sign-up, billing, and self-serve onboarding are out. Payroll, MPAO, and withholding are out (later phase in the plan). Sales invoicing stays in Zoho for now; Sentryfi shows a link out, not an invoicing screen.
- **Untouched:** product terminology ("Money In", "Money Out", "Paid from", "Owed to"); the three-tap capture; the mandatory review step; role boundaries (site staff never see balances).
- **Anti-goals:** no gamification, no confetti, no fake status bars, no dark-by-default, no accounting words outside the Accountant view, no metric-card grids.

## 5. Flow map and role matrix

**Phone shell (Owner, Director, Office admin):** five-slot bottom bar. Home · Bills · Snap (raised shutter) · Cash · More. More opens a full-screen board: Projects, Money In, Directors, Reports, Tax centre, Settings, Switch company.

**Site staff shell:** one screen. The camera opens on launch with the project tag and a queue count. A second screen lists their own uploads with sync status. Nothing else is reachable.

**Desktop shell (Accountant, Auditor, Director on a laptop):** a left rail with the same eight destinations plus Journals and Archive; the content area is a ruled table with a fixed header band; a right-hand inspector shows the receipt image and the journal for the selected row.

**Company switcher:** a pull-down on the Home band. Switching swaps content in place; the layout never moves.

| Screen | Owner | Director | Accountant | Auditor | Site staff | Office admin (proposed) |
|---|---|---|---|---|---|---|
| Home | full | balances, projects | full | read | no | full |
| Snap, Review, Recorded | full | no | no | no | capture only, no review | full |
| Bills and payables | full | read | full | read | no | full |
| Cash and bank | full | read totals | full | read | no | full, import, reconcile |
| Projects | full | read | read | read | tag only | read |
| Money In | full | own entries, read all | read | read | no | full |
| Directors' ledger | full | own rows plus totals | read | read | no | read |
| Reports | full | contribution statement | full | full | no | read |
| Tax centre | full | no | full, sign-off | read | no | read |
| Settings | full | profile only | profile, CoA proposals | profile | profile | profile |
| Journals and Accountant view | toggle | no | full | read | no | no |
| Archive (OneDrive index) | full | no | full | full | no | read |

Flow: Login (passkey) → role shell. Owner: Home → Snap → Review → Recorded → Home. Backlog: Snap → Batch → queue → Review each → Recorded. Money In: More → Money In → form → Recorded. Tax: Tax centre → period → checklist → filing pack → mark filed. Accountant: desktop → Journals → open entry → adjust or void with reason → sign-off period.

## 6. Screen briefs

Each brief: purpose, hierarchy, key states, data ranges. Layout intent only.

**Login and first run.** Passkey button as the single action on a white board with the mark; fallback to email code. First run for the Owner: create company, pick industry template (Contractor pre-selected), name bank accounts and cash boxes, invite roles. Three boards, each with one yellow action. Site staff first run: one screen, "Your job: snap every bill," then the camera.

**Home (phone).** As the first viewport above. Band: total across bank and cash, then two smaller lines: bank total, cash total. Chevron strip: "GST due in 9 days · MVR 21,480" (only when a period is open; otherwise a plain rule reading "No filing due"). Ruled list: last 8 movements, each with date, who, what, project tag, amount in or out coloured. Project rule: spend versus budget as a graduated bar with the percentage. States: empty (first day: the band reads MVR 0 and the list says "Snap your first bill"), offline (band shows last synced time, list shows queued items with a clock mark), loading (band skeleton in yellow tint, no spinners). Ranges: totals from 0 to nine digits with thousands separators; MVR and USD accounts shown in their own currency, never converted on Home.

**Snap.** Camera full-bleed with yellow corner brackets and the project tag chip at the top. Modes as a segmented rule: Snap · Batch · Quick entry · Voice. Shutter bottom centre. Gallery left, Batch count right. States: permission denied (explain and offer gallery), offline (shutter works, a queue count appears on the chip), low light (flash toggle). Batch: multi-select from gallery, shows a count and "Read all" which queues extraction and returns to Home. Ranges: 1 to 200 images per batch.

**Quick entry and Voice.** Three fields on a yellow-free board: Amount (numeric pad, currency toggle MVR/USD), What for (recent categories as chips, then search), Paid from (accounts as chips). Voice: press and hold the shutter to dictate; the transcript fills the three fields and drops into Review.

**Review.** Amount in huge numerals, vendor, date, then four rows: Paid from, What for (category and project), GST included, Bill number. Any field under the confidence threshold gets a yellow field and "please check"; nothing else on the screen is yellow. Below: duplicate check result and where the GST will land. Primary action: Confirm · Record it. Secondary: Edit more (opens the full field list: supplier TIN, currency, payment method, line items). States: extraction running (fields fill in one by one, no spinner), extraction failed (fields empty with "Type it in" and a retry), duplicate suspected (a black strip naming the earlier entry with Open and Not a duplicate), non-resident supplier (WHT flag row appears), foreign currency (rate row appears).

**Recorded.** The confirmation: "Recorded." in display type, the summary line, the Accountant view card with the balanced journal, the archive filename, and two actions: Snap another, Home. This screen is where Undo lives: a 10-second "Undo" on the black strip; after that, void from the entry.

**Bills and payables.** A ruled table of unpaid bills, sorted by due date, amount on the rule. Header band: total owed, due this week, overdue. Filters as a segmented rule: All · Due · Overdue · Retention. Row tap opens Bill detail. States: empty ("Nothing owed"), overdue (row amount in Money out red with the due date first). Ranges: 0 to a few hundred open bills.

**Bill detail.** Receipt image at the top, the fields as on Review but read-only with Edit, payment history, retention held, and the journal in the Accountant view. Actions: Record payment (opens Paid from and amount), Void with reason. Void never deletes; the row stays, struck through, with the reason.

**Cash and bank.** Accounts as rows on the rule: name, bank, currency, balance; cash boxes below. Header band: total per currency. Actions: Transfer between accounts, Import statement, Reconcile. Account detail: statement-like ruled list, running balance column, unreconciled rows marked. Import: column-mapping importer that previews the first ten rows and remembers the mapping per bank. Reconcile: two-column match view on desktop, one-column swipe-to-match on phone. States: unreconciled count on the band, import errors per row.

**Projects.** Rows per project with the graduated budget bar. Project detail: cost codes as rows on the rule with budget, actual, variance; tabs for Bills, Progress billing (IPC), Retention, WIP. States: over budget (bar runs past the rule end into red), no budget set (bar shows "Set a budget").

**Money In.** A form: Source (Director by name, Steva Enterprises, Steva Hotels, RDC rental, Other), Method (Cash box or Bank account), Amount, Date, Project, Note, Reference. Confirm posts to the right accounts silently. The list below shows recent receipts of money. States: intercompany source (a note that the mirror entry will appear in the other company), advance against contract (a small line saying GST may apply on the date received; the accountant's call is linked).

**Directors' contribution ledger.** One rule per director: cash, transfer, total, and a running balance over time. Director view shows only their own rows and the group total. Export as a statement.

**Reports.** A list of plain-English reports: Profit and loss, Cash flow, Project cost, Director contribution statement, Trial balance (Accountant view only). Each opens as a ruled table with a period selector on the band and Export (PDF, Excel). Reports are read on desktop mostly; on phone they scroll horizontally under a fixed first column.

**Tax centre.** Band: current period, days to deadline with the chevron strip, estimated GST. Rows: open periods and their status (Collecting · Ready to check · Filed). Period detail: the MIRA 205 box figures laid out in MIRA's order with box numbers, a pre-filing checklist, the Input and Output Tax Statement previews, "Generate filing pack" which writes the Excel files and the pack to OneDrive, and "Mark as filed" with the MIRAconnect reference. States: missing supplier TINs (a list to fix before generating), period closed, rates changed mid-period.

**Settings.** Companies (add, switch, industry template), People and roles, Bank accounts and cash boxes, Chart of accounts (Accountant view), Vendor rules learned from corrections, Backup status (last OneDrive run, checksum, restore test date), Tax profile, Language.

**Journals and Accountant view (desktop).** The append-only journal as a ruled table with debit and credit columns, hash chain status, filter by account and period, open any entry to see the receipt and the source screen. Adjusting entries with a reason. Period sign-off.

**Archive.** The OneDrive folder tree mirrored read-only: Bills, Ledgers, Tax, Reports, db, by month, with filenames and checksums. The auditor's home page.

**Offline queue.** A board reachable from the Snap chip and Home: queued photos with retry, failed uploads with the reason, and a "Retry all" action.

## 7. States and ranges

- Empty, loading, offline, error, permission denied, and success are designed for every screen above; loading never uses spinners, it uses the board's own skeleton in a yellow tint.
- Amounts: 0 to 999,999,999.99 in MVR and USD; negative balances possible on cash boxes and must be visible in red.
- Text: vendor names up to 80 characters, Dhivehi later, so labels never assume Latin script metrics.
- Volumes: 300 to 1,000 receipts a month, a backlog of several hundred at first import, up to 200 images in a batch.

## 8. Interaction and layout

- Phone: one band, one rule, one yellow field per screen. Primary action bottom centre or full-width at the bottom. Touch targets 44px minimum, 56px for anything used one-handed on site.
- Desktop: rail, ruled table, inspector. Keyboard: arrow keys move down the rule, Enter opens, Escape closes, letters filter.
- Motion: one authored moment, the entry sliding onto the rule and the band re-counting. Everything else is instant.
- Feedback: the black strip is the app's voice for confirmations, undo, and warnings; it never stacks.

## 9. Constraints and open decisions

- Platform: installable PWA, Next.js 15, Tailwind v4, shadcn/ui rebuilt in the Site Board vocabulary, Motion for the one authored moment.
- Accessibility: contrast checked for yellow fields (ink on yellow only, never white on yellow), focus rings in ink, screen-reader labels on every icon, reduced-motion respected.
- Localization: English now, Dhivehi later, so labels are strings, numerals tabular, and direction-agnostic layouts.
- Open for the owner: whether the Office admin role exists; whether Directors may post Money In themselves or only view; whether the night board (ink ground) is a user setting or automatic.
- Open for the accountant: funding treatment, excavator ownership, MIRA template wording. The Tax centre copy must not assert these.
