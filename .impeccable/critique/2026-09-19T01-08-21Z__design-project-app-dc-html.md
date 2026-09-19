---
target: the Sentryfi phone flow artboard
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:971b0ebf2d748893e73a1ce34f1656c84124b3dd05484805f1d992487c857259"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-19T01-08-21Z
slug: design-project-app-dc-html
---
Method: dual-agent (A: a60767c2877e54791 · B: a1a4ce447984a706a). No browser; both assessments from source. Target: design/project/App.dc.html (~1180 lines).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Pill reads "Read · 1 thing to check" above the "could not read" headline. |
| 2 | Match System / Real World | 3 | GST explainer says eight per hundred; the app computes 7.41 (inclusive tax). |
| 3 | User Control and Freedom | 3 | No Escape anywhere; opening a chooser removes Confirm entirely. |
| 4 | Consistency and Standards | 3 | Queue badge inverts between Home and Snap; two screens treat their primary oppositely. |
| 5 | Error Prevention | 3 | Duplicate detail puts a live "Record it anyway" under another bill's larger figure. |
| 6 | Recognition Rather Than Recall | 3 | Category chooser is seven unranked codes, no recency, no search. |
| 7 | Flexibility and Efficiency | 2 | No batch, no queue triage, no voice; every queued row opens the same default bill. |
| 8 | Aesthetic and Minimalist Design | 3 | Twelve controls on Review; the chooser carries none of the visual language. |
| 9 | Error Recovery | 3 | Blocked Confirm names its reason but is out of the tab order. |
| 10 | Help and Documentation | 3 | The one explainer has the wrong number; "Keep for later" is unexplained. |
| Total | | 29/40 | Good |

## Design Specificity Verdict

Strongly authored. Risk cascade ranked by this owner's costs, yellow walks to the winner, quiet ink fallback for second place, no cards, no debit/credit anywhere. One unauthored zone: the chooser, seven identical white rows with no yellow, no rule, no hierarchy.

Deterministic scan clean (exit 0). Raw scan 7 cramped-padding + 1 stripes advisory, all covered by two recorded ignores, all false positives, neither stale. Both assessments independently found the retake-panel yellow leak and the chooser focus drop.

## Priority Issues

- [P0] Seven yellow buttons omit class="on-yellow", including Confirm, so the focus ring is yellow on yellow and invisible; `disabled` also removes Confirm from the tab order with its reason unannounceable. Fix: emit the class from renderVals; use aria-disabled plus role="alert" on the reason. /impeccable audit
- [P1] GST explainer contradicts the computed figure two rows above it (8 vs 7.41 per hundred). Fix: bind the sentence to gstShown. /impeccable clarify
- [P1] The chooser sets no risk so the screen has zero yellow fields, hides Confirm, offers 7 unranked options, one low-contrast exit, no Escape, no arrow keys. Fix: risk='chooser', rank by recency, full-width ink Cancel pinned where Confirm was, Escape and roving tabindex. /impeccable harden
- [P1] Duplicate detail shows the other bill's MVR 28,400 as the largest figure with a live "Record it anyway" below; seeded duplicate shares neither vendor nor amount with the bill on screen. Fix: two-column compare, block Confirm while open, seed a near-match. /impeccable harden
- [P2] Three status strings assert false states: payerNote on an empty account, the pill on the read-failure screen, the staff uploads title over "Sent" rows. Also savedLine hardcodes a filename that contradicts an edited amount. /impeccable clarify

State defects from the evidence pass: stale displayTotal after keepForLater; undo timer survives navigation and suppresses the notice; focus dropped on chooser dismissal (payer, category); settleAmount dead when the amount is empty; on First day a confirmed bill posts into a list that cannot render it.

## Persona Red Flags

Casey: both abandon paths at the top of the screen; edit target and confirm tick adjacent with no gap.
Sam: amount error never announced; two controls advertise a menu that does not exist; heading focus lands on a label that does not contain its number.
Jordan: the project tag (his entire job) is a dead control; badge and list disagree online; no feedback on a blurred photo.
Backlog Abdulla: no batch path; every queued row opens the same bill; list sorts by bill date under "Latest recorded".

## Minor Observations

Role enum lacks Director and Office admin. Strip slot collapses on First day against its own rule. Amount error uses a red border against the Money Colours Are Text rule. Retake renders in typed entry where no photo exists. Archive filename hardcoded.

## Questions to Consider

Should the cascade rank by expected cost rather than consequence alone? Is snap-only a role or an unowned failure queue? If the band is the field that matters now, why is it a number that was also true yesterday?
