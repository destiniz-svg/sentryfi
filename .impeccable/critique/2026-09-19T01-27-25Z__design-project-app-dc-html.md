---
target: the Sentryfi phone flow artboard
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:055161d6021c85134f4ef7068dcafe2ddfae1be6924dc623ded9dac6569a19d3"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-19T01-27-25Z
slug: design-project-app-dc-html
---
Method: dual-agent (A: ae5ff95f4d8a890d9 · B: a1cff398350a3d53b). Source-only; a browser was available in the skill tooling but not used. Target: design/project/App.dc.html (1249 lines).

## Design Health Score

| # | Heuristic | Score | What a 4 needs |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | An extraction-running state between shutter and Review. |
| 2 | Match System / Real World | 4 | Earned. |
| 3 | User Control and Freedom | 3 | Discard action for a real duplicate; undo surviving the trip Home; a real bill detail. |
| 4 | Consistency and Standards | 3 | One name per destination per role; uniform ARIA value types. |
| 5 | Error Prevention | 3 | Gate the duplicate confirm like the retake; currency and rate on Review. |
| 6 | Recognition Rather Than Recall | 4 | Earned. |
| 7 | Flexibility and Efficiency | 2 | Batch, quick entry, voice, chooser search. |
| 8 | Aesthetic and Minimalist Design | 4 | Earned. |
| 9 | Error Recovery | 3 | Failed-upload state with reason and retry; a real bill detail. |
| 10 | Help and Documentation | 3 | Explainers on Balanced and the archive line; staff first run. |
| Total | | 32/40 | Good |

## Design Specificity Verdict

Authored in the logic, not the strings: inclusive GST extraction at the Maldives rate, the product's own cost codes and accounts, and a role boundary enforced by the state machine so staff cannot reach the books by misroute or back button.

Deterministic scan clean (exit 0). Raw scan 7 cramped-padding + 1 stripes advisory, all covered by two recorded ignores, all false positives, none provably stale.

## Fixes that did not land from the previous pass (3 of 10)

- Two yellow fields can still render together: the retake confirmation closes nothing, and the amount editor, bill editor and chooser option are hardcoded yellow rather than risk-driven.
- The chooser's selected option is a yellow-filled button with no on-yellow class, so its focus ring is yellow on yellow; and on-yellow was applied to two buttons sitting on dark grounds, making those rings invisible.
- The Home undo strip is unreachable dead code: every route into Home zeroes undoLeft.

## Priority Issues

- [P0] A genuine duplicate has no discard action; four buttons and none is the right answer. Fix: "Same bill, discard this one" with its own undo. /impeccable harden
- [P1] Friction inverted: recording a suspected duplicate is one tap, discarding a photo is two. Fix: route confirm through the retake confirmation pattern when a duplicate is open. /impeccable harden
- [P1] Hard-coded provenance copy contradicts live values on the trust screen: the duplicate strip, the compare card's right column, the vendor history line, the category note, and the post-dismissal audit line. Fix: drive all five from renderVals. /impeccable clarify
- [P1] The ten-second undo does not survive the trip Home and the fallback link points nowhere. Fix: carry undoLeft through backHome; wire a real bill detail. /impeccable polish
- [P2] No batch and the queue cannot be worked: rows carry no amount or date and every row opens the same bill. /impeccable shape

## Remaining state defects

Retake panel over a yellow editor or chooser; Home undo strip unreachable; undo never resets ledgerStarted so the first-run state is lost for the session; the project card jumps to 62 percent off one bill; reading a held bill never clears the queue; every held row opens the same canned bill; the notice timer outlives navigation; first-day arithmetic drops the cash and bank split.

## Persona Red Flags

Casey: both escape hatches at the top as identical white labels, one destructive; "Type it in" rendered twice on the camera-blocked screen.
Sam: ARIA values raw booleans in five places including aria-checked; blocking panels announced politely with no focus move; chooser focus lands on the first option, not the checked one.
Jordan: the project chevron is still dead; one destination carries three names; a held bill is painted money-in green.
Abdulla in sun: concrete grey at 12 to 13px carries everything he skims; camera controls nearly invisible on the dark ground; the deadline strip has a cliff at eleven days.

## Minor Observations

DESIGN.md is stale in four places against the build. The band prints hyphen-minus while rows use a true minus. First-day confirm drives the balance negative while the project bar jumps to 62 percent. The chooser cancel reads "Cancel, keep nothing" when unset.

## Questions to Consider

What does the flow believe is expensive, thirty seconds or a supplier paid twice? Is the mandatory review a confidence check or a ritual tap? What would this look like if the unit of work were the queue rather than the bill?
