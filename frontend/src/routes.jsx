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
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceEditor = lazy(() => import("@/pages/InvoiceEditor"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Payments = lazy(() => import("@/pages/Payments"));
const Items = lazy(() => import("@/pages/Items"));
const Reports = lazy(() => import("@/pages/Reports"));
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
      { path: "dashboard", element: <Dashboard /> },
      { path: "invoices", element: <Invoices /> },
      { path: "invoices/new", element: <InvoiceEditor /> },
      { path: "invoices/:id", element: <InvoiceDetail /> },
      { path: "invoices/:id/edit", element: <InvoiceEditor /> },
      { path: "clients", element: <Clients /> },
      { path: "clients/:id", element: <ClientDetail /> },
      { path: "expenses", element: <Expenses /> },
      { path: "payments", element: <Payments /> },
      { path: "items", element: <Items /> },
      { path: "reports", element: <Reports /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <ErrorPage /> },
]);
