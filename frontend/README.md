# Invoicer — Frontend Boilerplate (UI + mock data)

This is the **UI-only starter** for the AI Invoice & Billing Manager. It's the
full frontend, but every API call is **commented out** and the app runs on
**local mock data** (`src/mock/`). No backend, no `.env`, no database required —
just clone, install, and run.

Use it to build/demo the UI first, then wire in the real backend later.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

On the login screen, click **"Use demo credentials"** → **Sign in** (any
credentials work in mock mode) to enter the app with pre-populated data:
clients, invoices, payments, expenses, a services catalog, dashboards, and
reports. The AI features (receipt scan, business summary, reminders, notes)
return realistic canned responses.

> Mock data lives in memory and resets on refresh — that's expected.

## Wiring in the real backend

When your backend is running, switch from mock → real API in **3 steps**:

1. **`src/api/client.js`** — uncomment the axios client block.
2. **`src/api/*.js`** — in each file, comment the `── Mock ──` block and
   uncomment the `── Real API ──` block. (Also re-add
   `import { apiClient } from "./client"`.)
3. Delete the **`src/mock/`** folder.

The mock handlers return the exact same shapes as the real endpoints, so the
hooks, contexts, and pages need **zero** changes.

Make sure your Vite dev server proxies `/api` to the backend (already set in
`vite.config.js`).

## Tech

React 19 · Vite · Tailwind v4 · React Query · React Router 7 · Framer Motion ·
Recharts · lucide-react · `@react-pdf/renderer`.
