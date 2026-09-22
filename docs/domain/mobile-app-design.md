# Mobile app design: what "app quality" means for Sentryfi

*Last researched: 23 September 2026.* Most people use Sentryfi on a phone. This reference fixes the mobile patterns the two phone experiences are built from, so the choice is made once from evidence rather than screen by screen.

Two experiences, one codebase, decided 23 September 2026:

- **The main app** for the owner, the accountant and every level that reads the books. A first-class app, not the desk shrunk.
- **The expense manager** (the phone board) for assigned field staff only: send a bill, run the tin, confirm cash received, see what is owed back.

## What the research agrees on

- **Bottom tab bar, 3 to 5 destinations, icon and label always.** It keeps the places people go most inside the thumb's reach — the lower 40% of the screen — and is the most effective pattern for apps with 3–5 main sections ([UXPin](https://www.uxpin.com/studio/blog/mobile-navigation-examples/); [Parachute Design](https://parachutedesign.ca/blog/thumb-zone-ux/)).
- **Bottom sheets for actions that should not lose context.** Dismissed by a downward swipe or a tap on the background, with a drag handle that makes the dismissal discoverable ([Lollypop](https://lollypop.design/blog/2026/june/banking-app-ui-design/)).
- **Finance apps win on clarity at the moment of decision:** what changed, what is safe, what to do next ([Lollypop](https://lollypop.design/blog/2026/june/banking-app-ui-design/)). The strongest ones reduce friction, reassure at high-stakes moments and let people act without second-guessing.
- **A gesture needs a confirmation.** Haptics where the platform allows, and always a visible state change and an undo window for anything that moves money.
- **Accessibility is the floor, not a feature:** WCAG 2.1 AA as a baseline — 44×44 pt targets, 4.5:1 contrast, screen-reader labels, text that scales, and an alternative to every gesture-only action ([Lollypop](https://lollypop.design/blog/2026/june/banking-app-ui-design/)).

## The constraints of being a web app on a phone

Sentryfi is installed from the browser, not an app store. On iPhones that matters ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide); [MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios/)):

- **No background sync on iOS.** Work held offline sends itself when the app is opened or regains signal, not in the background. The outbox already works this way; the screen must always say what is waiting.
- **About 50 MB of storage.** Photographs held offline must be shrunk before they are kept. They already are.
- **Push notifications only for an app added to the home screen**, and only after a tap that asks for them. The ask is made at the moment it is useful ("tell me when cash is handed to me"), never on first launch.
- **Camera, audio, standalone display and safe areas all work.** Every screen respects the notch and the home indicator.

## Decisions for Sentryfi

**Both apps**

1. Bottom tab bar with labels always shown. The central slot is the one action that app exists for.
2. Money in a list is one row: party, a line under it (date, what, standing), and the amount right-aligned in tabular figures with the laari held back. Grouped by day, with the day as a sticky header.
3. Anything that records money opens as a sheet over where the person was, and ends with a figure in the button ("Record MVR 4,250.50"). Committing shows the undo strip for ten seconds.
4. Empty states teach: what this screen will hold, and the one action that fills it.
5. Skeletons while loading; never a spinner in the middle of an empty page.
6. Every screen works offline for what a person types, and says so.
7. Refused: glassmorphism and gradients (fail contrast in sun), an AI chat box on every screen (the adviser speaks where the figure is, not in a side panel), dark mode by default.

**The main app**

- **Tabs:** Home · Money · **Record** · Bank · More.
- **Home, top to bottom:** greeting and company switcher; one ink card with cash and bank now; "Needs you" as a short list of what is waiting on this person, each opening where it is resolved; the month so far in one line; recent entries.
- **Record** (the centre) opens a sheet: photograph a bill, say it, raise an invoice, move money, give cash to a tin.
- **Money:** bills and invoices under one segmented control, a sticky total, day-grouped rows, swipe for the common action (put in the books, record money in).
- **More:** the books (statements, closing, GST return), the company (people, cash tins, settings, backups), and the person.

**The expense manager**

- **Tabs:** Home · **Send** · Tin · Me. Square, ink and signal yellow: the site board.
- **Home:** the tin in the yellow band (what is in it, the float, what is owed back); cash handed over waiting to be confirmed; a large "Send a bill"; what has been sent, with each one's standing (sent, in the books, a question back).
- **Send** is the camera: photograph, or say it; check the amount and who it is from; send. Three taps.
- **Tin:** spend, count, ask for more, confirm cash received; the history.

## What this means for the build

The screens are drawn on the canvas "Sentryfi redesign direction", page "Mobile". The shared pieces — the tab bar, the sheet, the money row, the day header, the empty state, the offline line — are built once as components and used by both apps, so the two stay one product.
