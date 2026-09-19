---
target: the Sentryfi phone flow artboard
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:d32bb26d237f5ba11daaffbefc7eef249ae77b64ece4e757b7be2ff04840893b"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-19T00-36-42Z
slug: design-project-app-dc-html
---
Method: dual-agent (A: a154d27c82be6f313 · B: ae638f44f14da6f27). No browser; both assessments from source. Target: design/project/App.dc.html (876 lines).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | "Keep for later" increments the queue badge silently, bypassing the black strip. |
| 2 | Match System / Real World | 4 | Plain language throughout; "Many at once" and a dead "Say it" tab jar. |
| 3 | User Control and Freedom | 2 | Four dead exits; Retake discards every edit without warning. |
| 4 | Consistency and Standards | 3 | Confirmed category is not the recorded one; payer never renders yellow though the rule ranks it second. |
| 5 | Error Prevention | 2 | Duplicate neither blocks nor relabels Confirm; empty amount postable in the camera path. |
| 6 | Recognition Rather Than Recall | 3 | Accounts identified only by last four digits, no nickname. |
| 7 | Flexibility and Efficiency | 3 | Amount editor does not autofocus; four taps against a three-tap promise. |
| 8 | Aesthetic and Minimalist Design | 4 | Exceptional restraint; the leak is control count (eleven on the Review sheet). |
| 9 | Error Recovery | 2 | Failure copy is excellent, the recovery buttons behind it are inert. |
| 10 | Help and Documentation | 2 | No explain-this affordance, no first-run or empty state. |
| Total | | 28/40 | Good |

## Design Specificity Verdict

High and rising. The rule is the same object on four screens; GST computed inclusive at 8/108 and explained in words; hazard chevron used exactly twice; offline is a copy change, not a different app. Two areas stay generic: the five-slot bar with raised centre button, and the camera chrome.

Deterministic scan: configured run exits 0, clean. Raw scan 7 cramped-padding + 1 stripes advisory, all suppressed by two recorded ignores, all false positives, neither ignore stale.

Both assessments independently found the zero-amount posting and the category contradiction.

## Priority Issues

- [P0] A bill with no amount can be posted. amountRisky is gated on scenario rather than on whether a number exists, so clearing the amount and tapping Done leaves Confirm live and yellow; zero posts and Recorded reads "MVR —". Fix: missing amount disqualifies regardless of path; disabled Confirm gets a reachable reason. /impeccable harden
- [P0] The recorded row does not match what was confirmed. Sheet and Recorded say Materials; the ledger row says Steel reinforcement. Fix: one category in state rendered in all three places. /impeccable harden
- [P1] A suspected duplicate does not enter the risk order. Yellow sits on the bill number while a possible double payment sits in ink; Confirm keeps its label; "Open that bill" is dead. Fix: duplicate takes the top of the risk order, Confirm becomes "Record it anyway", wire the inspection link. /impeccable clarify
- [P1] "What for" is an inert control on the field that drives project costing, and in manual entry it asserts a category the user never chose. Fix: chooser with the six construction cost codes. /impeccable harden
- [P2] Undo is not a clean inverse and the queue drifts. Undo appends a hardcoded row instead of the evicted one; confirm decrements the queue unconditionally and undo never restores it. Fix: capture the evicted row and the queue delta at confirm and reverse both. /impeccable polish

## Persona Red Flags

Casey: three targets in the 56px bill row, one silently marking the field checked; Retake 10px from the pill and destructive; amount editor does not autofocus.
Sam: status pill is not a live region; chooser open/cancel destroys focus; disabled Confirm is out of the tab order with no reason.
Jordan: no first-run or empty state in any scenario; role hardcoded to Owner with the full cash position visible; vendor chooser has four fixed suppliers and no way to add one.
Shifa (office admin): queue is a number with no list; count drifts; company switcher promises a menu with no handler; no record of who entered a bill.

## Minor Observations

maskLabel runs its replacements in the wrong order, destroying the dots instead of masking (screen reader hears four commas). Two states of the amount control have different accessible names. Vendor button is 28px against a 44px floor. risk === 'payer' is computed and never rendered. Project bar hardcodes 62% three times. Band heading changed to "Cash & bank now" without updating DESIGN.md, which still says "today". Overdue GST at zero days has no wording. Capture modes and the chooser use two different ARIA conventions.

## Questions to Consider

Why does the button that commits the money not contain the money? Is the risk order a risk order or a typographic one, given the duplicate is absent from it and the payer rung is unbuilt? Is ten seconds an undo or a dare, when the copy afterwards points at a bill the screen does not link to?
