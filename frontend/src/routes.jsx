/* eslint-disable react-refresh/only-export-components --
   This file is a route manifest, not a component module: it exports `router`,
   an object, and declares the lazy page components the routes point at. Fast
   Refresh cannot hot-swap a router, which is what the rule is protecting, so
   it has nothing to say here. */
import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { PORTAL_URL } from "@/lib/portal";
import ErrorPage from "./pages/ErrorPage";
import { AppShell } from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import CheckEmail from "@/pages/CheckEmail";
const Landing = lazy(() => import("@/pages/Landing"));
const Register = lazy(() => import("@/pages/Register"));
const Join = lazy(() => import("@/pages/Join"));
const Reset = lazy(() => import("@/pages/Reset"));
const Forgot = lazy(() => import("@/pages/Forgot"));
const Verify = lazy(() => import("@/pages/Verify"));
const Portal = lazy(() => import("@/pages/Portal"));
const Shared = lazy(() => import("@/pages/Shared"));
const Genuine = lazy(() => import("@/pages/Genuine"));
const Practice = lazy(() => import("@/pages/Practice"));
const Trust = lazy(() => import("@/pages/Trust"));
const Go = lazy(() => import("@/pages/Go"));
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
const OpenBooks = lazy(() => import("@/pages/OpenBooks"));
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
const Analytics = lazy(() => import("@/pages/Analytics"));
const Attention = lazy(() => import("@/pages/Attention"));
const Bills = lazy(() => import("@/pages/Bills"));
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
const MobileBill = lazy(() => import("@/pages/mobile/Bill"));
const PhoneBills = lazy(() => import("@/pages/phone/BillsBoard"));
const PhoneCash = lazy(() => import("@/pages/phone/Cash"));
const PhoneMe = lazy(() => import("@/pages/phone/Me"));
const PhoneOwed = lazy(() => import("@/pages/phone/Owed"));
const More = lazy(() => import("@/pages/More"));
const Assets = lazy(() => import("@/pages/Assets"));
const Stock = lazy(() => import("@/pages/Stock"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const Advances = lazy(() => import("@/pages/Advances"));
const PayRun = lazy(() => import("@/pages/PayRun"));
const Payslip = lazy(() => import("@/pages/Payslip"));
const MyPayslips = lazy(() => import("@/pages/Payslip").then((m) => ({ default: m.MyPayslips })));
const Shipments = lazy(() => import("@/pages/Shipments"));
const Shipment = lazy(() => import("@/pages/Shipment"));
const Projects = lazy(() => import("@/pages/Projects"));
const Project = lazy(() => import("@/pages/Project"));
const Orders = lazy(() => import("@/pages/Orders"));
const Order = lazy(() => import("@/pages/Order"));
const Claims = lazy(() => import("@/pages/Claims"));
const Cfo = lazy(() => import("@/pages/Cfo"));
const Branding = lazy(() => import("@/pages/Branding"));
const NewInvoice = lazy(() => import("@/pages/NewInvoice"));
const Document = lazy(() => import("@/pages/Document"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Reports = lazy(() => import("@/pages/Reports"));
const Report = lazy(() => import("@/pages/Report"));
const Contact = lazy(() => import("@/pages/Contact"));
const Talk = lazy(() => import("@/pages/Talk"));
const Payments = lazy(() => import("@/pages/Payments"));
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
  // Back here after signing in: a link to an approval or a document should open it, not the dashboard.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} replace />;
  if (user.mustVerify) return <CheckEmail />;

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
  if (companies.needsFirstCompany) return <Suspense fallback={null}><OpenBooks /></Suspense>;

  return <AppShell />;
}

function ToPortal() {
  window.location.replace(PORTAL_URL);
  return null;
}

export const router = createBrowserRouter([
  { path: "/", element: <Suspense fallback={null}><Landing /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/login", element: <Login />, errorElement: <ErrorPage /> },
  { path: "/register", element: <Suspense fallback={null}><Register /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/join/:token", element: <Suspense fallback={null}><Join /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/reset/:token", element: <Suspense fallback={null}><Reset /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/forgot", element: <Suspense fallback={null}><Forgot /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/verify/:token", element: <Suspense fallback={null}><Verify /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/portal/:token", element: <Suspense fallback={null}><Portal /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/d/:token", element: <Suspense fallback={null}><Shared /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/trust", element: <Suspense fallback={null}><Trust /></Suspense>, errorElement: <ErrorPage /> },
  { path: "/v/:sha", element: <Suspense fallback={null}><Genuine /></Suspense>, errorElement: <ErrorPage /> },
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
      { path: "stock", element: <Stock /> },
      { path: "payroll", element: <Payroll /> },
      { path: "advances", element: <Advances /> },
      { path: "payroll/runs/:id", element: <PayRun /> },
      { path: "payroll/runs/:runId/slips/:employeeId", element: <Payslip /> },
      { path: "payslips", element: <MyPayslips /> },
      { path: "payslips/:runId", element: <Payslip mine /> },
      { path: "shipments", element: <Shipments /> },
      { path: "shipments/:id", element: <Shipment /> },
      { path: "projects", element: <Projects /> },
      { path: "projects/:id", element: <Project /> },
      { path: "orders", element: <Orders /> },
      { path: "orders/:id", element: <Order /> },
      { path: "claims", element: <Claims /> },
      { path: "cfo", element: <Cfo /> },
      // The developer dashboard moved to its own subdomain.
      { path: "developer", element: <ToPortal /> },
      { path: "branding", element: <Branding /> },
      { path: "practice", element: <Practice /> },
      { path: "go", element: <Go /> },
      { path: "documents/:kind/:id", element: <Document /> },
      { path: "approvals", element: <Approvals /> },
      { path: "inbox", element: <Inbox /> },
      { path: "contacts", element: <Contacts /> },
      { path: "contacts/:id", element: <Contact /> },
      { path: "talk/:kind/:id", element: <Talk /> },
      { path: "payments", element: <Payments /> },
      { path: "loans", element: <Loans /> },
      { path: "figures", element: <Navigate to="/analytics" replace /> },
      { path: "analytics", element: <Analytics /> },
      { path: "invoices", element: <Invoices /> },
      { path: "invoices/new", element: <NewInvoice /> },
      { path: "bank", element: <Bank /> },
      { path: "closing", element: <Closing /> },
      { path: "statements", element: <Statements /> },
      { path: "tax", element: <TaxReturn /> },
      { path: "import", element: <Import /> },
      { path: "bank/:accountId", element: <BankStatement /> },
      { path: "clients", element: <Navigate to="/contacts?side=customers" replace /> },
      { path: "customers", element: <Navigate to="/contacts?side=customers" replace /> },
      { path: "suppliers", element: <Navigate to="/contacts?side=suppliers" replace /> },
      { path: "bills", element: <OnPhone board={<PhoneBills />} desk={<Bills />} /> },
      { path: "bills/:id", element: <MobileBill /> },
      { path: "expenses", element: <Navigate to="/bills" replace /> },
      { path: "items", element: <Navigate to="/stock" replace /> },
      { path: "reports", element: <Reports /> },
      { path: "reports/:key", element: <Report /> },
      // Cash is a phone job. At a desk the tins are on Bank and cash.
      { path: "cash", element: <FieldTool board={<PhoneCash />} desk={<Navigate to="/bank" replace />} /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <ErrorPage /> },
]);
