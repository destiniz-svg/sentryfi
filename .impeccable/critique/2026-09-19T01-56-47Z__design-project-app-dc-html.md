---
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:ad9cd16f2afff44e3253089e4bef36cb08f79a4e8b874ced87279a46b75554fd"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-19T01-56-47Z
slug: design-project-app-dc-html
---
IMPECCABLE_CRITIQUE_META
target: the Sentryfi phone flow artboard
total_score: 30
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 3
END_IMPECCABLE_CRITIQUE_META

Method: dual-agent (A: a6af0902c4e5f682b, design review; B: abea9d8fa3612e796, evidence). First pass with a render: 28 panels in design/preview/screens.html, produced by executing the artboard's own component and expanding its own markup. Static, so no motion, focus rings or hover. No live browser was used. Target: design/project/App.dc.html (1383 lines).

## Design Health Score

| # | Heuristic | Score | What a 4 needs |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | An extraction-running state between shutter and Review; a dated sync line. |
| 2 | Match System / Real World | 4 | Earned. |
| 3 | User Control and Freedom | 2 | A reversal that takes a reason and keeps the row; a duplicate discard that also clears the queue. |
| 4 | Consistency and Standards | 3 | One meaning per slot; no two visible controls sharing a label with opposite behaviour. |
| 5 | Error Prevention | 2 | Withdraw the commit while the duplicate question is open; require the vendor. |
| 6 | Recognition Rather Than Recall | 4 | Earned. |
| 7 | Flexibility and Efficiency | 3 | Close the camera-blocked dead end; give the backlog a batch path. |
| 8 | Aesthetic and Minimalist Design | 3 | Stop stating one blocker three ways; suppress the field list while the duplicate question is open. |
| 9 | Error Recovery | 3 | Render the typed-entry control the camera-off card promises; a failed-upload row with a reason and retry. |
| 10 | Help and Documentation | 3 | Make the GST and archive explainers reachable from Home and Bill detail. |
| Total | | 30/40 | Good, down 2 from the previous pass |

The drop is measurement, not regression in every case. The render made reachable states visible that four source-only passes had scored blind.

## Design Specificity Verdict

High. Load-bearing, not skinned: the surveyor's rule is one continuous 2px border built with a stretched amount cell and negative margins, not five per-row ticks; the hazard swatch appears on the GST strip and nowhere else; the budget bar is a graduated instrument scale. Copy is unfakeable Maldivian contractor language. Specificity thins on Recorded and Sent, which borrow the category-default success tick, and on Waiting, which carries no yellow and no band.

Deterministic scan clean (exit 0). Raw scan 11 cramped-padding plus 1 stripes advisory, all covered by two recorded ignores, all classified false positive against the markup, none stale.

## Fixes that did not land, or landed broken (3)

- maskLabel was reported fixed in the previous pass. Line 778 now carries a regex missing both backslashes, so every masked account renders "BML ,  MVR ending 4471", including the confirm button's aria-label. This is a regression introduced by that fix.
- askRetake clears amountEditing, billEditing, chooser and dupeDetail but not dupeAsk, so the retake and duplicate confirmations stack: two polite live regions and two yellow buttons at once.
- The duplicate guard was added to confirm but actionsVisible was not updated, so the guard is defeated by pressing the same unchanged pixel twice.

## Priority Issues

- [P0] Two taps on one unchanged pixel record a suspected duplicate. actionsVisible (L1095) excludes retakeAsk and dupeDetail but not dupeAsk, so the bottom commit stays visible, still reads "Record it anyway", and the second press skips the guard. A second visible control with the identical label does not record. Fix: add the dupeAsk term to actionsVisible; relabel the strip chip. /impeccable harden
- [P0] "Reverse it, give a reason" takes no reason, asks nothing, cannot be undone, and deletes the row. voidBill (L1225) filters every entry matching supplier and amount out of the ledger while the notice says the bill stays in the record and the screen says nothing can be deleted. It also never adjusts cash for a cash-box payment. Fix: require a reason, strike the row through, keep it. /impeccable harden
- [P1] Keyboard focus is invisible on every white screen. The focus-visible rule at L15 paints signal yellow, 1.67:1 on Board White, below the 3:1 floor for focus indicators. The shape brief asked for ink rings; the build shipped yellow and DESIGN.md then recorded the defect as the rule. Fix: default the ring to ink, scope yellow to dark grounds. /impeccable audit
- [P1] The camera-blocked screen tells the user to type the bill in and renders no control to do it. The button at L230 is gated on showModes, which requires the camera not to be blocked, inside a branch that requires it to be blocked. Fix: gate on the staff test alone. /impeccable harden
- [P1] A bill can be recorded with no supplier. vendorShown returns the literal placeholder question and blockers never counts it, so the Recorded summary and the OneDrive filename carry that question as the supplier name. Fix: add the vendor to blockers. /impeccable harden

## Remaining state defects

Staff first-run and camera-blocked render stacked at identical absolute geometry. forceConfirm neither confirms nor tells the truth: it sets dupeCleared, so the footnote claims the user compared the bills and said they differ. A kept blank bill reopens with fabricated amount, vendor and bill number from fallback operators. Bill detail opened from a Home row substitutes a canned account and an em dash for every bill. Undo after confirming a held bill restores the ledger but not the queue, so the bill is gone from both. Re-keeping a bill duplicates its queue row. The retry counter never resets, so the escalated blur wording persists for the whole session. discardDupe does not remove a queued duplicate and loses heldIndex on restore. Two computed values are never consumed.

## Cognitive Load

Fails on single focus, grouping, one-thing-at-a-time and minimal choices, all on the duplicate screen: the yellow strip, a 56px amount and the commit compete, and one label appears twice on two controls. Review's top row puts leave, information and destroy side by side at equal weight. Passes chunking, working memory and progressive disclosure.

## Emotional Journey

Peak and end are correctly placed: the proof, not the capture, and the new row arriving Home. Reassurance at the commit is the strongest work in the file; the button names the figure and the account, and the aria-label expands the mask. It inverts on both blocking questions, where the yellow sits on the dangerous branch: take it again over keep editing, record it anyway over compare them.

## Persona Red Flags

Casey: the double-tap duplicate commit is his failure mode by construction; the sync line carries no day; two affordances 600px apart reach the same board.
Sam: the focus ring is invisible on white; maskLabel breaks the most important announcement in the app; the chooser is six tab stops rather than one plus arrows; group headings are bare divs inside the radiogroup; blocking questions are announced politely with no focus move.
Jordan: the one decision the role matrix gives site staff, tagging the project, is wired to a no-op; the route to his own uploads draws a close icon; the queue has no failed state and no retry.
Director, a named launch user: not modelled at all. Two roles exist in data-props, and the role tag is a hard-coded literal. A Director gets the full Owner board including a reverse action on every money-out row.

## Minor Observations

The non-urgent GST strip wears the black confirmation costume. The strip slot collapses on First Day, breaking its own fixed-height rule. First Day still shows a project budget block. Currency is asserted and never checked: an MVR amount can post from a USD account with GST claimed. Money-in rows open a detail with no explanation for the missing reverse. Home shows five movements; the brief asked for eight. An alert role sits on persistent text. Contrast is otherwise well held; the focus ring is the one failure.

## Render fidelity

One defect in tools/render-artboard.js: panels are seeded with a direct state assignment, bypassing freshReview, so billSettled stays false. Two Review panels are byte-identical and both show a flagged bill number. The clean two-tap review exists in the mechanism and appears in no panel. Seed panels through freshReview before the next render.

## Questions to Consider

The best rule in this system, that review only asks what it doubts, has never once been shown in evidence. Is it a state the product has, or a claim the system makes? The most expensive error and the fastest gesture are now the same gesture: when three-taps-or-fewer and trust-is-shown collide, which loses? Everything on this surface reassures about a bill that went in. For a product named after a sentry, what tells the owner about the bills that never arrived?
