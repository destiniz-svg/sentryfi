---
name: Sentryfi
description: The books as a site notice board. Signal yellow, ink, and one vertical rule every amount hangs on.
colors:
  signal-yellow: "#F2C300"
  ink: "#141414"
  board-white: "#FFFFFF"
  concrete: "#6B7078"
  money-in: "#167A41"
  money-out: "#C62B20"
  hairline: "#E6E7EA"
  camera-ground: "#0B0B0C"
  camera-muted: "#A9ADB6"
  camera-tile: "#1E1E21"
  camera-tile-edge: "#34353A"
  grabber: "#D6D8DD"
  receipt-paper: "#EDE9DF"
  receipt-caption: "#5A5648"
  receipt-ink: "#2A2C33"
  receipt-line: "#B9B4A6"
  receipt-figure: "#8E8A7E"
  receipt-rule: "#C9C4B6"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "64px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  title:
    fontFamily: "Barlow, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  title-sm:
    fontFamily: "Barlow, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Barlow, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  body-secondary:
    fontFamily: "Barlow, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
  label-section:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.14em"
  label-nav:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.10em"
  currency-code:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  currency-code-sm:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  wordmark:
    fontFamily: "Barlow, Barlow Semi Condensed, Helvetica Neue, Arial, sans-serif"
    fontSize: "56px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  none: "0px"
  full: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter-phone: "20px"
  xl: "24px"
  gutter-desktop: "28px"
  safe-top: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "60px"
    padding: "0 16px"
  button-primary-desktop:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.board-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "52px"
    padding: "0 16px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.concrete}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0"
  band:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    padding: "18px 20px 16px"
  chevron-strip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 14px"
  black-strip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board-white}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 0 0 14px"
  role-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board-white}"
    typography: "{typography.label-nav}"
    rounded: "{rounded.none}"
    padding: "3px 6px"
  status-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.board-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "0 10px"
  review-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "56px"
    padding: "0"
  review-field-flagged:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "56px"
    padding: "0 0 0 10px"
  nav-glass:
    backgroundColor: "rgba(20,20,20,0.88)"
    textColor: "{colors.board-white}"
    typography: "{typography.label-nav}"
    rounded: "{rounded.none}"
    height: "72px"
    padding: "0 4px"
  nav-glass-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label-nav}"
    height: "56px"
  nav-rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 20px"
  nav-rail-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 20px"
  shutter:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.signal-yellow}"
    rounded: "{rounded.full}"
    size: "76px"
  shutter-camera:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.signal-yellow}"
    rounded: "{rounded.full}"
    size: "88px"
  camera-control:
    backgroundColor: "rgba(20,20,20,0.8)"
    textColor: "{colors.board-white}"
    rounded: "{rounded.none}"
    size: "44px"
  camera-tile:
    backgroundColor: "{colors.camera-tile}"
    textColor: "{colors.board-white}"
    rounded: "{rounded.none}"
    size: "56px"
---

# Design System: Sentryfi

## Overview

**Creative North Star: "The Site Board"**

Sentryfi's books are a construction site notice board read at arm's length in equatorial sun: a white board, ink lettering, and one signal-yellow field for whatever matters now. The world borrows from site signage and survey instruments (hazard chevrons for deadlines, a levelling-staff rule that every amount hangs on, a graduated bar with ticks, a stencil-weight condensed face) and refuses the dark bento dashboard of rounded glowing cards and the grid of metric tiles. Chosen 19 September 2026 (candidate 3 of 7 on the grounded list, seed key 49afc33d) and shipped first as three interactive artboards under `design/project/`: the phone flow (Home, Snap, Review, Recorded), the desktop journal, and the brand sheet.

Density is high and flat. Rows are 44 to 58px tall, separated by hairlines, with amounts right-aligned against a single 2px ink rule. Nothing is elevated except what physically lifts off the board: the shutter and the photographed receipt. Colour is rationed: one yellow field per screen, chevrons only on a countdown or a blocker, green and red only on amounts. Corners are square everywhere except the shutter, the brand mark, and the platform-masked app icon.

The signature interaction is the confirm loop: confirm posts the entry, Recorded shows the balanced journal with a ten-second undo in the black strip, and returning Home slides the new row onto the rule while the band's total counts down to the new figure. Motion is one exponential ease-out moment per screen change, never decoration.

**Key Characteristics:**
- White board, ink type, one signal-yellow field per screen
- Every amount right-aligns to a single 2px ink vertical rule with hairline graduations per row
- Barlow Condensed 700 uppercase labels with 0.10 to 0.14em tracking; Barlow 400/500/600 body with tabular numerals
- Square corners on every field, strip, button, and input; circles only for the shutter and the mark
- Flat by default; the only soft shadows lift the shutter and the photographed receipt
- Hazard chevrons mean a deadline or a blocker, nothing else
- One ease-out motion per screen change on `cubic-bezier(0.2, 0.8, 0.2, 1)`, 420 to 900ms

## Colors

A signage palette: one saturated yellow, near-black ink, white, a concrete grey, and two money colours that appear only on amounts.

### Primary
- **Signal Yellow** (`{colors.signal-yellow}`): the one field per screen that matters now. The Home band behind the cash-and-bank total (headed "Cash & bank now", changed from "today" on 19 September 2026 because "today" read as a day movement over what is a balance), the desktop journal header band, the flagged Review field ("Bill no. · please check"), the Confirm button once every field is checked, the shutter ring, the active nav label, the focus ring on dark grounds, text selection, and the yellow-on-ink text of primary buttons, chevron strips, and status pills. Never a page background, never a decorative tint.

### Neutral
- **Ink** (`{colors.ink}`): all primary text, the vertical rule, 2px table borders, primary button fill, chevron and black strip fill, the role tag, the active desktop rail item, the shutter disc, and the app icon tile.
- **Board White** (`{colors.board-white}`): page ground on phone and desktop, the Review sheet, secondary button fill, text on ink strips and on the night lockup.
- **Concrete** (`{colors.concrete}`): secondary text (row descriptions, dates in the ruled list, field labels, footers, column headers, "Edit more details"), link hover, and the dash placeholder in empty debit or credit cells.
- **Hairline** (`{colors.hairline}`): 1px row dividers in every ruled list and table, and the untinted track of the graduated bar.
- **Grabber** (`{colors.grabber}`): the 44 by 4px handle at the top of the Review sheet only.
- **Camera Ground** (`{colors.camera-ground}`): the full-bleed ground of the Snap and Review screens, under the viewfinder and behind the sheet.
- **Camera Muted** (`{colors.camera-muted}`): inactive mode tabs and the Gallery and Waiting captions on the camera ground.
- **Camera Tile** and **Camera Tile Edge** (`{colors.camera-tile}` / `{colors.camera-tile-edge}`): the 56px Gallery and Waiting tiles (fill and 1px edge). The edge colour also divides the undo action from the black strip's message.
- **Receipt Paper** and **Receipt Caption** (`{colors.receipt-paper}` / `{colors.receipt-caption}`): the placeholder receipt in the viewfinder, the Review thumbnail, and the desktop "Selected entry" attachment. The printed marks on it use `{colors.receipt-ink}` for headings and totals, `{colors.receipt-line}` for address lines, `{colors.receipt-figure}` for line items, and `{colors.receipt-rule}` for its horizontal rules. All six are placeholder values for a drawn receipt; no receipt raster exists yet, and they belong to that object only, never to interface chrome.

### Semantic
- **Money In** (`{colors.money-in}`): incoming amounts on the rule (prefixed "+"), the "Balanced · hash" and "Period balanced · chain intact" lines, the chain-intact ticks in the journal, and the duplicate-check tick on Review. Text and stroke only, never a fill.
- **Money Out** (`{colors.money-out}`): outgoing amounts on the rule (prefixed with a true minus sign), and the "TIN" flag in the journal hash column. Text only, never a fill.

### Named Rules
**The One Yellow Field Rule.** Each screen carries at most one signal-yellow field, and it marks the number or action that matters now. A second yellow surface competing for that job is a defect, not emphasis. A screen with nothing to decide carries none: the bill record and the waiting list are read, not acted on, and stay ink on white. Two things are exempt because they are not screen content: the shutter, which is persistent chrome and keeps its yellow everywhere, and the graduated bar's fill, which is data. The camera's project selector was yellow until 19 September 2026 and is now white for this reason.

**The Yellow Follows The Risk Rule.** On Review the yellow field is not fixed to a component; it lands on whatever is most uncertain about the money. The order is ranked by what it costs the owner if it is wrong: a suspected duplicate first, then the amount, then the account that paid, then the bill number. When nothing is uncertain it moves to the Confirm button, so the loudest thing on screen is always either the doubt or the commitment, never a detail. Anything the user has opened outranks everything else, because the thing they are working in is the thing at risk: a blocking question first (the retake confirmation), then an open chooser, whose currently-set option carries the yellow so "what it is now" is visible while they pick, then an open editor. A field that is uncertain but not first renders quiet, with an ink warning glyph and no fill, so the rule is never broken to show a second problem. Introduced 19 September 2026 to replace a fixed flagged row, and reordered the same day to put the duplicate first: paying a supplier twice and claiming the input tax twice is the most expensive error the flow can make, and it had been ranked below an unchecked invoice number.

**The Commitment Names The Money Rule.** The button that performs the irreversible act carries the figure and the account, not a verb: "Record MVR 3,450" over "from BML · MVR ····4471". It falls back to the blocker when one exists ("Add the amount"), and to "Record it anyway" while a duplicate is unresolved. A commit button that reads only "Confirm" asks the thumb to commit to a word.

**The Strip Slot Rule.** Home has one strip slot directly under the band, 44px tall, and exactly one thing occupies it: the undo strip while an undo is live, the reversal notice for six seconds after an undo, otherwise the GST countdown. They never stack and the slot never changes height, so nothing below it moves. The undo strip is never drawn over the shutter; an earlier floating version of it covered the shutter and the queue badge for ten seconds and was removed.

**The Review Only Asks What It Doubts Rule.** A field arrives checked when the model is confident about it, so a clean bill confirms in two taps: snap, record. A yellow field means the app genuinely could not read something, not that the form wants a signature. Making one field always unchecked turns the review into a ritual tap and teaches the owner to clear it without reading, which is worse than no review at all. Decided 19 September 2026.

**The Plain Proof Rule.** Debit and credit vocabulary never appears on the phone. The Recorded screen proves the entry in the owner's own words (amount, what it was for, which account paid, the archive filename) and closes with one green line, "Balanced · full journal on desktop". The debit-and-credit journal lives in the desktop Accountant / CFO shell, which is the only surface those words appear on. Decided by the owner on 19 September 2026.

**The Ring Follows The Ground Rule.** The focus ring is 3px ink by default, because every primary surface is board white and signal yellow on white is 1.67:1, below the 3:1 floor a focus indicator has to clear. Dark grounds carry `class="on-ink"` and flip the ring to yellow; white cards and sheets sitting on a dark ground carry `class="on-board"` and flip it back; yellow fields carry `class="on-yellow"` and keep it ink. Corrected on 19 September 2026: the ring shipped yellow everywhere and this document had recorded the defect as the rule.

**The Latin-Only Casing Rule.** Uppercase and positive tracking are properties of the Latin labels, not of the label role. Thaana has no case and tracks badly, so a Dhivehi build sets the same labels in sentence case with no tracking and keeps the weight, size, and colour.

**The Chevrons Mean Deadlines Rule.** The hazard stripe (`repeating-linear-gradient(135deg, #F2C300 0 8px, #141414 8px 16px)`) appears only on a countdown or a blocker: the GST deadline, the TIN blocker, the time-of-supply note. Never as decoration and never on a brand surface except the brand sheet's swatch.

**The Money Colours Are Text Rule.** Green and red colour amounts and status lines only. They never fill a field, a badge, or a button.

## Typography

**Display Font:** Barlow Condensed 700 (with sans-serif fallback)
**Body Font:** Barlow 400, 500, 600 (with Helvetica Neue, Arial, sans-serif)
**Wordmark:** Barlow 600, -0.03em tracking (live text in the SVG lockups; outline before print)

**Character:** Stencil-weight condensed caps for anything that names or labels, set wide-tracked like signage; a plain grotesque for anything that has to be read as a sentence. Every number is tabular so amounts stack on the rule. Loaded from Google Fonts (Barlow 400 to 700, Barlow Condensed 600 and 700); only 700 of the condensed face is used.

### Hierarchy
- **Display** (Barlow Condensed 700, 72px/0.9 to 44px/1, tabular, -0.01em): the one big figure or word per screen. 72px for "Recorded.", 64px for the Home band total, 56px for the Review amount, 44px for the desktop journal title. The currency code sits at 22px (band) or 20px (Review) on the same baseline.
- **Headline** (Barlow Condensed 700, 28px/1 to 20px/1, tabular): the desktop aside amount (28px), the project percentage (20px), and primary button labels (20px, 0.10em, uppercase).
- **Title** (Barlow 600, 17px to 15px): the row's "who" line, the Review vendor, the Recorded summary line, table total rows, and the value column in Review fields.
- **Body** (Barlow 500, 14px, tabular): journal rows, the black strip message, the Home band's bank-and-cash line (13px), the input text.
- **Body secondary** (Barlow 400, 13px to 12px, Concrete): the row's "what" line, dates under summaries, the archive filename, the project bar caption.
- **Label** (Barlow Condensed 700, uppercase): 13px at 0.14em for section labels ("Cash & bank now", "Latest", "Hotel · 48 rooms", "Selected entry"); 12px at 0.12em for field labels and column headers; 11px at 0.10em for nav labels and the camera captions; 11px at 0.12em for the role tag; 14px at 0.10em for desktop rail and desktop buttons; 15px at 0.10em for camera mode tabs and the undo action; 18px at 0.04em for the company switcher.
- **Strip text** (Barlow Condensed 700, 17px phone / 14px desktop / 13px aside, 0.02em, sentence case): the chevron strip is the one condensed setting that is not uppercase and not wide-tracked; it reads as a sentence.

### Named Rules
**The Condensed Names, Grotesque Reads Rule.** Barlow Condensed 700 is for labels, headings, figures, and button text. Anything a person reads as a sentence (descriptions, captions, strip messages in the black strip, empty-state copy when it exists) is set in Barlow.

**The Tabular Rule.** Every numeral that can sit under another numeral is `font-variant-numeric: tabular-nums`. Incoming amounts are prefixed "+", outgoing with U+2212 minus, never a hyphen.

## Layout

Phone-first at 390 by 844 with 20px side gutters, 56px top safe padding, and 16px insets for the floating nav; content ends 112px above the bottom edge to clear the bar. Sections stack full-bleed (band, chevron strip) or inside the gutters (ruled list, project rule). Rows use CSS grid with a fixed date column (46px), a fluid middle, and a fixed amount column (104px) so the rule lands in the same place on every row.

Desktop at 1280 by 800 is a three-column shell: a 216px section rail with a 2px ink right border, a fluid journal with 28px gutters, and a 320px "Selected entry" aside with a 2px ink left border. The journal table is a seven-column grid (72px date, fluid entry, 150px account, 110px project, 110px debit, 110px credit, 48px hash) with 12px column gaps; the date cell carries the bill date at 14px over the posting date at 12px Concrete, because time of supply is the earlier of invoice or payment and an auditor cannot read that from one date. Row heights step down from phone to desk: 58px ruled list on phone, 56px Review fields, 44px journal rows, 52px account-chooser rows, 48px expanded-detail rows, 36px aside rows.

The spacing rhythm as built is a 2px base with 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, and 28 all in use; 20px and 28px are the phone and desktop gutters. The contract's 8px grid was not held strictly and is recorded here as built, not as intended.

The brand sheet uses a 12-column grid with 24px column gaps and 32px row gaps inside 48px by 56px padding.

## Elevation & Depth

Flat by default. Depth is drawn, not lit: 2px ink borders separate shell regions, 1px hairlines separate rows, and 2px ink top-and-bottom borders bracket the first and last rows of a table. Only two things carry shadows, and both are objects that physically sit above the board.

### Shadow Vocabulary
- **Shutter lift, on the glass bar** (`box-shadow: 0 10px 24px rgba(20,20,20,0.35)`): the 76px shutter raised out of the nav bar.
- **Shutter lift, on the camera** (`box-shadow: 0 12px 28px rgba(0,0,0,0.55)`): the 88px shutter on the camera ground.
- **Receipt lift** (`box-shadow: 0 30px 60px rgba(0,0,0,0.6)`): the placeholder receipt in the viewfinder, rotated -4deg.

The floating nav on the phone is tinted ink glass: `rgba(20,20,20,0.88)` with `backdrop-filter: blur(18px)`. It is the only blurred surface. The camera's close and flash controls use a plainer `rgba(20,20,20,0.8)` with a 1px `rgba(255,255,255,0.14)` edge and no blur.

### Named Rules
**The Only Objects Cast Shadows Rule.** Shadows are reserved for the shutter and the photographed bill. Fields, strips, buttons, sheets, and tables are flat; the Review sheet rises with motion, not with a shadow.

**The Glass Is Navigation Rule.** Tinted ink glass with blur belongs to the phone nav bar only.

## Shapes

Square. Every field, strip, button, input, tag, pill, tile, and table cell has `border-radius: 0`. Circles are reserved for the shutter (an ink disc inside a yellow ring, at a 76:58, 88:68, or 84:64 ratio), the brand mark (a yellow disc with a 6-unit ink ring, one horizontal rule, one vertical post), and the app icon's platform-masked tile (`rx` 116 on 512). The receipt placeholder sits at -4deg to read as a physical object; nothing else rotates.

Borders are ink and heavy: 2px for the vertical rule, secondary buttons, inputs, shell dividers, and table brackets; 3px for the brand sheet's rules and the active camera tab underline; 4px for the viewfinder's corner brackets (28px, yellow). Hairlines are 1px in `{colors.hairline}`.

Recurring silhouettes: the band (full-bleed yellow block), the strip (full-bleed ink block with a striped swatch at its left edge, 44px wide on phone, 36px on desktop, 32px in the aside), the rule (a 2px ink right border on the amount cell with 10px right padding, 8px in the aside), and the graduated bar (14px tall, `repeating-linear-gradient(90deg, #141414 0 2px, #E6E7EA 2px 35px)` ticks, a yellow fill with a 2px ink leading edge).

## Components

### Buttons
Blunt and heavy, sized for a gloved thumb.
- **Shape:** square (0px)
- **Primary:** ink fill, yellow label in Barlow Condensed 700 uppercase at 0.10em; 60px tall at 20px on phone ("Confirm · Record it", "Snap another"), 44px tall at 14px on desktop ("Sign off period", "Adjust with reason"). Leading inline SVG icon at 22px with 10px gap when present.
- **Secondary:** white fill, 2px ink border, ink label; 52px tall at 18px on phone ("Home"), 44px at 14px on desktop ("Export", "Void with reason").
- **Text:** no fill or border, Concrete label in Barlow 500 14px, 44px tall ("Edit more details"). The camera's "Retake" is the same pattern in white condensed caps.
- **Selector:** yellow fill, ink condensed label at 14px with a 14px chevron ("Hotel · Materials" on the camera); 44px tall, 14px side padding.
- **Focus:** 3px ink outline, 2px offset, on every focusable element; yellow on dark grounds via `on-ink`. Hover and active states are not built.

### Band
The one yellow field. Full-bleed `{colors.signal-yellow}` with 18px top, 20px side, 16px bottom padding; a 13px section label at 0.14em, the display figure at 64px with the currency code at 22px on the same baseline, and a 13px Barlow 500 tabular line for bank, cash, and sync time. On desktop it becomes the journal header (44px title, 22/28/18px padding) with the action buttons right-aligned.

### Chevron Strip
Deadlines only. A 44px ink strip (36px on desktop, 40px in the aside) with a striped swatch at the left edge (`repeating-linear-gradient(135deg, #F2C300 0 8px, #141414 8px 16px)`, 6/12px stripes in the aside), then yellow Barlow Condensed 700 text at 17/14/13px with 0.02em tracking in sentence case, 14px side padding. On Home it is a link to the tax centre.

### The Rule (ruled list and tables)
- **Row:** grid with fixed date and amount columns; 58px min-height on phone, 8px vertical padding, 1px hairline top border.
- **Amount cell:** Barlow 600 17px tabular, right-aligned, 10px right padding, `border-right: 2px solid {colors.ink}`, stretched to the full row height (`align-self: stretch` with negative vertical margins equal to the row padding) so the rule is continuous.
- **Direction:** Money In green with "+", Money Out red with U+2212.
- **Table variant (Recorded accountant view, desktop journal, aside):** column headers in the 12px 0.12em label with the header's rule cell carrying the same 2px border; the first row of a desktop journal gets a 2px ink top and bottom bracket; the last row of every table gets a 2px ink bottom border; empty cells show a Concrete dash.

### Graduated Bar
14px track of 2px ink ticks every 35px on a hairline ground (10 percent at the 350px phone content width), a yellow fill to the percentage with a 2px ink leading edge, a 13px 0.14em label above with the percentage at 20px condensed on the right, and a 12px Concrete caption below.

### Black Strip
The app's single voice for confirmation, undo, and warnings. Ink fill, 48px min-height, white Barlow 500 14px message with 14px left padding. An action ("Undo" with a tabular countdown) sits at the right in yellow Barlow Condensed 700 15px 0.10em, 16px side padding, divided by a 1px `{colors.camera-tile-edge}` left border. The camera caption "Line up the bill. We read the rest." is the same strip at 8/14px padding in Barlow 600 15px.

### Shutter
An ink disc inside a yellow ring, always circular, always carrying a yellow camera or tick icon. Three sizes as built: 76/58px raised 40px out of the nav bar, 88/68px on the camera at the centre of a three-column control row, and 84/64px on Recorded where it pops in and holds a tick instead of a camera. See Elevation for its shadows.

### Navigation
- **Phone:** floating tinted ink glass bar, 16px inset, 72px tall, five equal columns, 4px side padding. Items are 56px tall columns of a 22px stroke icon over an 11px 0.10em condensed label; active is yellow, inactive is white. The shutter occupies the centre column.
- **Desktop:** 216px left rail with a 2px ink right border and 24px vertical padding; the lockup (36px mark, 24px Barlow 600 wordmark at -0.03em, company name in the 12px label) sits above 44px rail items in the 14px 0.10em label with 20px side padding; the current section (`aria-current="page"`) inverts to ink fill and yellow text. The signed-in person and role sit at the bottom.
- **Top bar (phone):** company name in Barlow Condensed 700 18px uppercase at 0.04em with a 16px switcher chevron and the role tag; the 32px mark at the right; 56px top, 20px side, 12px bottom padding.

### Tags and Pills
- **Role tag:** ink fill, white 11px 0.12em condensed caps, 3px by 6px padding ("Owner").
- **Status pill:** ink fill, yellow 13px 0.10em condensed caps, 8px by 12px padding, 14px tick icon ("Read · 1 field to check").

### Inputs / Fields
- **Text input (desktop filter):** 36px tall, 2px ink border, white fill, Barlow 500 14px, 10px side padding, square. Placeholder colour is the browser default; a label in the 12px 0.12em Concrete label precedes it.
- **Review field:** a 56px tall button-row with a hairline top border; the label (12px 0.12em Concrete condensed caps) on the left and the value (Barlow 600 15px) right-aligned in a 150px column that carries the rule. A field the reader must check inverts to yellow fill with an ink label, a 14px info icon, and 10px left padding.
- **Focus:** 3px ink outline, 2px offset, flipped to yellow on dark grounds by `on-ink` and back to ink on white cards inside them by `on-board`. **Error:** a 4px ink border on the input plus an alert-role message; the red is carried by the message text, never by the border. **Blocked:** the primary action keeps `aria-disabled` and its place in the tab order, states the reason in an alert above itself, and moves the user to the missing field when pressed.

### Review Sheet
A white sheet rising from 236px on the camera ground with `sf-rise` over 420ms, a 44 by 4px grabber in `{colors.grabber}`, the amount at 56px display, vendor in Barlow 600 17px, provenance in Barlow 400 14px Concrete, the Review fields, a check line (14px green tick plus 13px Concrete text), and the primary and text buttons pinned to the bottom with 24px bottom padding.

### Camera
Full-bleed `{colors.camera-ground}`. Viewfinder marked by four 28px yellow corner brackets at 4px; the placeholder receipt inside at -4deg. Controls are 44px square glass buttons; mode tabs are 15px 0.10em condensed caps with a 3px yellow underline when active and Camera Muted when not, 24px apart; Gallery and Waiting are 56px `{colors.camera-tile}` tiles with a 1px edge and an 11px caption below.

### Icons
Inline SVG on a 24-unit grid, stroke only, `currentColor`, round caps and joins. Stroke 2 for nav and tiles, 2.2 for the camera glyph, 2.4 to 2.5 for chevrons and close, 3 for ticks. Sizes as built: 14, 16, 20, 22, 24, 28, 30, 34px. No icon fonts, no glyph characters.

### Motion
One ease-out moment per screen change on `cubic-bezier(0.2, 0.8, 0.2, 1)`:
- `sf-rise` (translateY 40px to 0, fade in), 420ms: the Review sheet.
- `sf-pop` (scale 0.9 to 1, fade in), 480ms: the Recorded shutter.
- `sf-slide` (translateX 48px to 0, fade in), 600ms: the new row sliding onto the rule on return to Home.
- Band count: 900ms cubic ease-out (`1 - (1 - t)^3`) in script, re-counting the total to the new figure.
The undo countdown ticks once per second for ten seconds. Hover transitions are not built.

## Do's and Don'ts

### Do:
- **Do** give every screen exactly one signal-yellow field, and put the number or action that matters now in it.
- **Do** right-align every amount to a single 2px ink rule with 10px right padding, and separate rows with 1px hairlines.
- **Do** set labels in Barlow Condensed 700 uppercase at 0.10 to 0.14em, scaled 11/12/13px, and body in Barlow 400/500/600 with tabular numerals.
- **Do** keep every field, strip, button, input, and table square; circles are for the shutter and the mark only.
- **Do** use the chevron strip for a countdown or a blocker and the black strip for confirmation, undo, and warnings.
- **Do** colour incoming amounts Money In with "+" and outgoing amounts Money Out with a true minus, and use those colours only on text and strokes.
- **Do** animate one ease-out moment per screen change on `cubic-bezier(0.2, 0.8, 0.2, 1)` between 420 and 900ms.
- **Do** keep touch targets at 44px or taller, and primary actions at 60px on phone.
- **Do** ship icons as inline stroke SVG in `currentColor`.

### Don't:
- **Don't** build dark bento dashboards, rounded metric cards, or grids of metric tiles; amounts hang on the rule, not in cards.
- **Don't** use the hazard chevrons as decoration, as a brand device on product surfaces, or on anything that is not a deadline or blocker.
- **Don't** put shadows on fields, strips, buttons, sheets, or tables; only the shutter and the photographed bill lift off the board.
- **Don't** use blurred glass anywhere except the phone nav bar.
- **Don't** fill a field, badge, or button with Money In green or Money Out red.
- **Don't** round corners on fields or controls; the app icon's platform mask is the only rounded rectangle.
- **Don't** set sentence-length copy in Barlow Condensed; the chevron strip's single line is the one condensed sentence the world allows.
- **Don't** use accounting terms (debit, credit, Dr, Cr) outside the Accountant view; the phone shows "Paid from", "What for", "Money in".
