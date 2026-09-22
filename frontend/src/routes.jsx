/* eslint-disable react-refresh/only-export-components --
   This file is a route manifest, not a component module: it exports `router`,
   an object, and declares the lazy page components the routes point at. Fast
   Refresh cannot hot-swap a router, which is what the rule is protecting, so
   it has nothing to say here. */
import { lazy } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import ErrorPage from "./pages/ErrorPage";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Join from "@/pages/Join";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import OpenBooks from "@/pages/OpenBooks";
import { usePhone } from "@/lib/phone";

/**
 * What loads when.
 *
 * Everything used to be imported eagerly, which put the whole application into
 * one 2.3 MB download — including the charting library and the PDF renderer,
 * both of which arrived before the login form could be drawn. Someone whose
 * only job is to photograph a bill on site was paying for the reports screen
 * on every visit.
 *
 * The landing page, the two auth screens and the app shell stay eager: they
 * are the first thing every session touches, and splitting them would only add
 * a round trip. Everything behind the login is fetched when it is first
 * opened.
 */
const Figures = lazy(() => import("@/pages/Figures"));
const Attention = lazy(() => import("@/pages/Attention"));
const Bills = lazy(() => import("@/pages/Bills"));
const NotReady = lazy(() => import("@/pages/NotReady"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Bank = lazy(() => import("@/pages/Bank"));
const Closing = lazy(() => import("@/pages/Closing"));
const Statements = lazy(() => import("@/pages/Statements"));
const TaxReturn = lazy(() => import("@/pages/TaxReturn"));
const Import = lazy(() => import("@/pages/Import"));
const BankStatement = lazy(() => import("@/pages/BankStatement"));
// Clients, Expenses, Payments, Items and Reports are deliberately
// not imported. Their files stay as the reference for what replaces them, but
// nothing routes to them: they read the purchased product's tables, and a
// screen that looks right and is not is worse than one that is missing.
const Settings = lazy(() => import("@/pages/Settings"));

// The phone board. A separate register, not a breakpoint on the desk one —
// see lib/phone.js and the register table in DESIGN.md.
const PhoneHome = lazy(() => import("@/pages/phone/Home"));
const MobileHome = lazy(() => import("@/pages/mobile/Home"));
const MobileMoney = lazy(() => import("@/pages/mobile/Money"));
const PhoneBills = lazy(() => import("@/pages/phone/BillsBoard"));
const PhoneCash = lazy(() => import("@/pages/phone/Cash"));
const PhoneMe = lazy(() => import("@/pages/phone/Me"));
const PhoneOwed = lazy(() => import("@/pages/phone/Owed"));
const More = lazy(() => import("@/pages/More"));
const Assets = lazy(() => import("@/pages/Assets"));
const Loans = lazy(() => import("@/pages/Loans"));

/**
 * Which register this screen is in.
 *
 * Site Board is two registers, and a phone gets the phone board rather than
 * the desk register made narrow. Chosen here, at the route, because the two
 * are different screens with different chrome — not the same screen restyled.
 */
/**
 * Who gets the expense manager and who gets the main app.
 *
 * Decided 23 September 2026: the phone board is the expense manager, and only
 * assigned field staff — people who cannot read the books — see it. The owner,
 * the accountant and every other level get the main app on any screen, their
 * phone included, because a phone is where most of them do most of their work.
 */
function OnPhone({ board, phone: onPhone, desk }) {
  const { can } = useCompany();
  const phone = usePhone();
  if (!can("read")) return board;
  return phone && onPhone ? onPhone : desk;
}

/** A field tool anyone may open on a phone: the tin a person holds. */
function FieldTool({ board, desk }) {
  const phone = usePhone();
  const { can } = useCompany();
  return phone || !can("read") ? board : desk;
}

function ProtectedShell() {
  const { user, loading } = useAuth();
  const companies = useCompany();
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--ink-muted)] text-sm"
      >
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // Belonging to no company is the ordinary first-run state, not an error.
  // Everything is kept per company, so there is genuinely nothing to show
  // until one exists — a dashboard of zeroes would be worse than asking.
  if (companies.loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--ink-muted)] text-sm"
      >
        Loading…
      </div>
    );
  }
  if (companies.needsFirstCompany) return <OpenBooks />;

  return <AppShell />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Landing />, errorElement: <ErrorPage /> },
  { path: "/login", element: <Login />, errorElement: <ErrorPage /> },
  { path: "/register", element: <Register />, errorElement: <ErrorPage /> },
  { path: "/join/:token", element: <Join />, errorElement: <ErrorPage /> },
  {
    path: "/",
    element: <ProtectedShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: "dashboard", element: <OnPhone board={<PhoneHome />} phone={<MobileHome />} desk={<Attention />} /> },
      { path: "money", element: <OnPhone board={<PhoneHome />} phone={<MobileMoney />} desk={<Navigate to="/bills" replace />} /> },
      { path: "me", element: <PhoneMe /> },
      { path: "owed", element: <FieldTool board={<PhoneOwed />} desk={<Navigate to="/bank" replace />} /> },
      { path: "more", element: <More /> },
      { path: "assets", element: <Assets /> },
      { path: "loans", element: <Loans /> },
      { path: "figures", element: <Figures /> },
      // Still on the purchased product's tables. See config/readiness.js.
      { path: "invoices", element: <Invoices /> },
      { path: "bank", element: <Bank /> },
      { path: "closing", element: <Closing /> },
      { path: "statements", element: <Statements /> },
      { path: "tax", element: <TaxReturn /> },
      { path: "import", element: <Import /> },
      { path: "bank/:accountId", element: <BankStatement /> },
      { path: "clients", element: <NotReady /> },
      { path: "bills", element: <OnPhone board={<PhoneBills />} desk={<Bills />} /> },
      { path: "expenses", element: <NotReady /> },
      { path: "payments", element: <NotReady /> },
      { path: "items", element: <NotReady /> },
      { path: "reports", element: <NotReady /> },
      // Cash is a phone job. At a desk it is a report, and that comes with
      // the rest of the bank work in milestone two.
      { path: "cash", element: <FieldTool board={<PhoneCash />} desk={<NotReady />} /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <ErrorPage /> },
]);
