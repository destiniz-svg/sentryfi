---
target: the Sentryfi phone flow artboard
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:7429174686f4d6397e945696a1deca76782c10252746e773a74c349b99b1b2cf"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-19T00-16-02Z
slug: design-project-app-dc-html
---
Method: dual-agent (A: ad1176387eecdee02 · B: ab4fddbcca880ff63). No browser in this environment; both assessments from source. Target: design/project/App.dc.html (647 lines).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Offline scenario never reaches Home; band still reads "Synced 08:12" offline; no queued-items state. |
| 2 | Match System / Real World | 4 | "Cash & bank · today" reads as today's movement over what is a balance. |
| 3 | User Control and Freedom | 2 | Account chooser wipes the field list and has no cancel. |
| 4 | Consistency and Standards | 3 | Home rounds to the rupee, Review shows decimals. |
| 5 | Error Prevention | 2 | Confirm enabled while the pill reads "1 field to check"; flagged row scrolls out of view. |
| 6 | Recognition Rather Than Recall | 3 | Receipt thumbnail 130x110, rotated, reduced opacity, cannot be enlarged. |
| 7 | Flexibility and Efficiency | 2 | Three of four capture modes inert; project chip has no handler; press-and-hold unbuilt. |
| 8 | Aesthetic and Minimalist Design | 3 | Snap shows six capture paths and nine targets for a one-tap action. |
| 9 | Error Recovery | 2 | Read-failure sheet contradicts the pill above it. |
| 10 | Help and Documentation | 2 | "Full journal on desktop" points a phone-only owner off-device; no site-staff first run. |
| Total | | 26/40 | Acceptable |

## Design Specificity Verdict

Authored, top decile. The rule is load-bearing and unbroken; the hazard chevron appears exactly twice in 647 lines; the band size ladder and the reduced-motion check are real engineering. One borrowed element remains: the floating glass bar with a raised centre button, exempted by a design-system rule written to license it.

Deterministic scan: configured run exits 0, no findings, no advisories. Raw scan finds 6 cramped-padding plus 1 stripes advisory, all covered by two recorded ignores, all classified false positives with line reasons. The detector found nothing this round; every issue below is logic or hierarchy.

Verification: all eight accessibility claims asserted after the previous pass were confirmed against source. Caveat: the offline strip on Snap has role="status" but no literal aria-live.

## Priority Issues

- [P0] Amount and vendor on Review are static text and cannot be corrected, while two of four rows below them are wired. A misread amount posts into an append-only journal. Fix: amount block opens a numeric pad, vendor line opens a supplier picker, yellow flag moves onto whichever is low confidence. /impeccable harden
- [P1] dupeLine is logically inverted: shows "You said this is not the same bill" while the warning is unanswered, then "No duplicate found" after dismissal, erasing that one was found. Fix: three states, no tick until answered. /impeccable clarify
- [P1] "Type it in" on the read-failure card reveals a fully populated sheet, fabricating an extraction the app just said it could not do. Fix: empty sheet, keyboard up, Confirm disabled until amount and account are filled. /impeccable harden
- [P1] Float undo strip (696-744 on Home) covers the raised shutter (714-790) and the queue badge for 10 seconds on the main path; clips the camera shutter by 8px on Snap. Fix: raise clear on Home, suppress on Snap. /impeccable polish
- [P2] Account chooser destroys the field list while Confirm stays live, discards the bank/cash grouping the data carries, and marks the current account with a decorative tick only. Fix: labelled radio group, two subheadings, cancel that does not mutate, Confirm hidden while open. /impeccable audit

## Persona Red Flags

Casey: undo strip under the thumb on his exact path; nine elements on Snap; no pressed state anywhere.
Sam: middle dots announced literally; chooser has no radiogroup or checked state; countdown hidden; six links to nowhere; five dead buttons as focus stops.
Jordan: no site-staff screen exists; only route to camera is the owner's nav; project tagging is an inert button.
Nasrulla (director, view only): role hardcoded to Owner; the loudest control is an action he cannot perform; neither destination he wants is in the nav.

## Minor Observations

Rounding policy differs Home vs Review. Amount column fixed at 104px against a range needing ~135px. Cash hardcoded so a cash-paid bill moves the Bank line. Confirm decrements a queue it never consumed. Snap is absolutely positioned on fixed tops and breaks below 844px height. Above 10 days the deadline strip drops the money figure. Company switcher promises a menu with no aria-expanded or handler. Home heading is a section label, so post-undo focus announces the wrong thing. Expanded detail rows including supplier tax number are read-only.

## Questions to Consider

If the amount cannot be edited, what is the mandatory review reviewing? When the One Yellow Field rule and the money disagree, which wins? What does Sentryfi look like when the shutter is the entire app?
