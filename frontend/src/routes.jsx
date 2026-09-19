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
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import OpenBooks from "@/pages/OpenBooks";

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
// Invoices, Clients, Expenses, Payments, Items and Reports are deliberately
// not imported. Their files stay as the reference for what replaces them, but
// nothing routes to them: they read the purchased product's tables, and a
// screen that looks right and is not is worse than one that is missing.
const Settings = lazy(() => import("@/pages/Settings"));

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
  {
    path: "/",
    element: <ProtectedShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: "dashboard", element: <Attention /> },
      { path: "figures", element: <Figures /> },
      // Still on the purchased product's tables. See config/readiness.js.
      { path: "invoices", element: <NotReady /> },
      { path: "clients", element: <NotReady /> },
      { path: "bills", element: <Bills /> },
      { path: "expenses", element: <NotReady /> },
      { path: "payments", element: <NotReady /> },
      { path: "items", element: <NotReady /> },
      { path: "reports", element: <NotReady /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <ErrorPage /> },
]);
