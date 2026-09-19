---
target: the Sentryfi phone flow artboard
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
target_fingerprint: "sha256:79090dbb4c97d80165d1fc5a0725689d6c1d07e04be8ea7d607419bd08b4dee9"
target_path: "C:\\Users\\THINAN\\ledgeros\\design\\project\\App.dc.html"
timestamp: 2026-09-18T23-43-11Z
slug: design-project-app-dc-html
closed: true
---
Method: dual-agent (A: af05e4fac7423084a · B: affd1eee2d78e78ec). No browser in this environment; both assessments from source. Target: design/project/App.dc.html.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Leaving Recorded kills undo silently; undo confirms nothing; Flash has no state; no extraction-running or offline state. |
| 2 | Match System / Real World | 3 | "Input Tax Statement", Debit/Credit, "void from the entry", "Undo 10" without a unit leak through. |
| 3 | User Control and Freedom | 2 | Flagged field and "Edit more details" are dead; Back and Retake both discard the photo; undo forfeited by navigation. |
| 4 | Consistency and Standards | 3 | Chip "Hotel · Materials" vs Review "Materials · Hotel"; 14 Sep row above 18 Sep in "Latest"; tick icon on "1 field to check". |
| 5 | Error Prevention | 2 | "Paid from" is vendor memory shown as a read fact with no confidence cue. |
| 6 | Recognition Rather Than Recall | 3 | "Quick entry" and "Voice" unexplained; nothing marks the fresh row after the slide. |
| 7 | Flexibility and Efficiency | 3 | Home rows, See all, Bills, Cash, More dead; press-and-hold project tag not built. |
| 8 | Aesthetic and Minimalist Design | 3 | Snap carries two yellow surfaces; Recorded stacks nine information units. |
| 9 | Error Recovery | 1 | No error state exists; "please check" offers no path to act. |
| 10 | Help and Documentation | 2 | Nothing explains the hash, Accountant view, Voice, or the time-boxed undo. |
| Total | | 25/40 | Acceptable |

## Design Specificity Verdict

LLM assessment: authored, not interchangeable. The rule every amount hangs on, the MVR band with bank and cash split, the hazard strip counting to the 28th, and the Recorded proof could not be lifted into another product. Conventional where it should be: five-slot bar with raised shutter, iOS-style camera.

Deterministic scan: exit 2. One counted cramped-padding finding on the black strip (line 241), false positive (48px flex row centring one line; Undo button bleeds to the edge by design). Ten advisories: six literal shutter/tick radii instead of the 9999px token, two undocumented greys on the placeholder receipt, two currency-code sizes (22px, 20px) described in DESIGN.md prose but missing from the token ramp. Stripes exception honoured.

Visual overlays: none (no browser automation).

## Priority Issues

- [P1] The flagged field cannot be acted on. "Bill no. · please check" and "Edit more details" have no handler. Fix: inline input on the row; yellow clears on edit or "Looks right"; pill moves to "Read · all checked". /impeccable harden
- [P1] "Paid from" is an inference dressed as a read. Fix: label "Paid from · as last time", flag yellow when vendor history is mixed, tap opens Bank accounts / Cash boxes chips. /impeccable clarify
- [P1] No focus management or announcements across screen swaps. Fix: heading per screen with focus moved to it, role="status" on the black strip, one undo announcement. /impeccable audit
- [P2] Undo forfeited silently; Accountant view always open; Latest sorts by bill date. Fix: timer runs across screens on the black strip, undo confirms "Not recorded · MVR 3,450 removed", journal collapses to one row on the rule, Latest sorts by posting time. /impeccable polish
- [P3] Chevron strip clips at 318px (nowrap, 47 chars); no prefers-reduced-motion guard. Fix: "GST · 9 days · MVR 21,480 · by 28 Sep"; wrap motion in a no-preference query. /impeccable adapt

## Persona Red Flags

Casey: project chip at top; mode tabs 24px apart above the shutter; flagged field same height as unflagged; undo expires during the next bill.
Sam: no headings; no aria-current; Flash without aria-pressed; tabs by colour only; journal div grid; focus drops on swap.
Jordan (site staff): chip asks for a category; lands on Review which the role matrix forbids; no site-staff branch, queue count, or offline state.
Accountant / CFO: no posting or payment date so time of supply unreadable; GST treatment asserted before confirmation; supplier TIN absent; hash truncated without a chain link.

## Minor Observations

Owner tag inside the switcher button; "illustrative" in product copy; Back and Retake share a handler; "Undo 10" lacks a unit; band overflows at nine digits; focus ring colour disagrees between brief and DESIGN.md; uppercase tracked labels will not survive Thaana; new entry description is a category not an item; radius token, receipt greys and currency sizes need DESIGN.md hygiene.

## Questions to Consider

Is "please check" a control or a disclaimer if Confirm stays primary? Could plain-language proof be the default and Debit/Credit the toggle? What does the hazard strip look like at 25 days, 3 days, and the day after filing?
