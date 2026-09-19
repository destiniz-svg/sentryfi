# The reference front end: what to take, what to leave

Cloned 19 September 2026 to `reference/ai-invoice-and-billing-manager-ui-boilerplate-code` from `time-to-program/ai-invoice-and-billing-manager-ui-boilerplate-code`. One commit, about 7,150 lines of JSX across 56 files. Vite 8, React 19.2, Tailwind v4, React Router 7, TanStack Query 5, framer-motion, recharts, `@react-pdf/renderer`. Plain JavaScript, no TypeScript.

Its own README is honest about what it is: a UI-only starter where every API call is commented out and the app runs on local mock data.

## The verdict in one line

**Take the chassis. Leave the domain.** The shell, the token layer and the data-fetching architecture are genuinely good and worth adopting. The invoice, tax and payment model is a single-currency, receivables-only, flat-tax freelancer app and shares almost nothing with construction accounting in rufiyaa.

## Take these

| What | Where | Why |
|---|---|---|
| The CSS-variable token layer | `src/index.css`, 122 lines | Two themes, no Tailwind config file, dark mode free. Re-point about eighteen variables and roughly 90 percent of the app changes palette. The single highest-value file in the repository. |
| Theme context | `src/context/ThemeContext.jsx` | `data-theme` on the root element, persisted, defaults to the device setting. Exactly the night board behaviour already decided for Sentryfi. |
| The API facade plus React Query hook split | `src/api/*.js`, `src/hooks/*` | Pages never touch transport. Query keys exported per hook, invalidation explicit. Textbook, and it survives replacing every endpoint. |
| App shell, command palette, notifications, toasts | `src/components/layout/`, `src/context/UIContext.jsx` | Polished and self-contained. The command palette has fuzzy scoring and arrow-key navigation. |
| Loading and empty state discipline | `Skeleton`, `EmptyState`, used on every page | Rare in a boilerplate. Copy the habit as much as the components. |
| The PDF document as a starting point | `src/components/invoice/InvoiceDocument.jsx` | Sound layout and StyleSheet approach for `@react-pdf/renderer`. Content needs a Maldives rewrite. |
| The backend contract | The commented-out lines in `src/api/*.js` | A free specification. Cookie session on `/api`, proxied to port 8000. Adopt or reject deliberately, but it is written down. |

## Leave these

**The whole domain model.** Six entities in `src/mock/store.js`, all receivables. An invoice carries one flat `tax_rate` percentage applied to the whole document after a discount. There is no supplier, no bill payable, no purchase order, no payables ageing, no cash account, no chart of accounts, no journal, no double entry. Net profit is literally revenue minus expenses.

**The tax engine.** `computeTotals` is fifteen lines and is duplicated in four places: the mock, the editor preview, the detail preview and the PDF. Maldives GST needs per-document convention detection, exempt and unregistered suppliers, a tax identification number on the document, and input versus output separation. That is a rewrite of the totals engine in four places, not a tweak.

**Multi-currency, which is cosmetic.** Seven currencies in a list, no rufiyaa, and **no exchange rate anywhere**. Every aggregate sums `total` across currencies as if they were the same unit, then formats the result as United States dollars in United States grouping. That is an arithmetic bug a mixed rufiyaa and dollar business hits on day one.

**The marketing surface.** `Landing.jsx` and `BrandCardMarquee.jsx` are about 1,060 lines, fifteen percent of the codebase, and pull framer-motion into the initial bundle. Delete on day one.

**Partial payments.** Reconciliation is all or nothing. A fifty percent payment leaves the invoice marked sent with no record of what was received. There is no balance due field anywhere.

## What it costs to adopt

Four things to budget for, each one real.

**There is no mobile navigation at all.** The sidebar is `hidden md:flex`. Below the medium breakpoint the authenticated app has no navigation, no drawer and no bottom bar. Under the new platform split this matters less than it would have, because the phone is a separate expense and capture app, but it means the reference contributes nothing to the phone.

**The brand is hard-coded outside the token layer.** Teal hexes are pasted into the dashboard charts, the landing page, the auth shell, the toast context and the PDF document. Change the tokens and those stay teal.

**The pill shape is baked into the primitives.** Every button size and every input is fully rounded, cards are large-radius. The Site Board world is square-cornered throughout. That fights at the primitive level and in about forty inline overrides.

**Colour is written inline as arbitrary variable classes**, not utility classes, across roughly 1,400 class strings. Good for re-pointing a palette, hostile to swapping in a component library.

## Correctness problems worth knowing before you build on it

- **`keepPreviousData: true` is a React Query v4 option on a v5 project** (`src/hooks/useInvoices.js:11`). Silently ignored, so the invoice list flashes empty on every filter change.
- **Dates use `toISOString()`**, which is UTC. The Maldives is UTC+5, so anything derived from the current time can serialise as the previous day.
- **The invoice list, expense list, client list and item list are keyboard-unreachable.** They are clickable `div` elements with no role, no tab index and no key handler. The payments and dashboard lists correctly use buttons, so it is inconsistent rather than uniform.
- **No modal is accessible.** Four hand-rolled modals with no dialog role, no Escape handler, no focus trap, no focus restore and no scroll lock.
- **Toasts are never announced.** The viewport has no status role and no live region, so a screen reader user hears nothing when a save succeeds or fails.
- **Row actions are hover-only**, so they are unreachable on touch.
- Money is JavaScript floats rounded to two places. For an accounting product that is a liability, and a reason to add TypeScript and integer minor units before building.

## What this means under the new platform split

The owner changed the plan on 19 September 2026: the phone is an expense dashboard and capture tool, the desktop web app is the full accounting suite. That makes this reference relevant to **the desktop only**, which is the right half. Its strengths are a desktop shell, a desktop sidebar, a command palette and data tables. Its total absence of mobile navigation is no longer a problem to solve.

The phone keeps the Site Board world already built and rendered in `design/preview/screens.html`. The desktop can take this chassis and wear the same tokens.

**Before building the first real desktop screen**, extract the four things the reference copy-pastes: a dialog, a data table, a field, and a select. The repository has four near-identical modals, five copies of a field helper and three hand-written grid tables. Adopt it as it stands and the marginal cost of screen fourteen is as high as screen four.
