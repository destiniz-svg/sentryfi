import { Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import TrialStrip from "./TrialStrip";
import { CommandPalette } from "./CommandPalette";
import { TabBar } from "@/components/mobile/TabBar";
import { RecordSheet } from "@/components/mobile/RecordSheet";
import { RecordBill } from "@/components/bills/RecordBill";
import { RouteFallback } from "@/components/ui/RouteFallback";
import { usePhone } from "@/lib/phone";
import { useCompany } from "@/context/CompanyContext";

/**
 * The screens that carry the phone board's own chrome.
 *
 * They draw their own header, band, strip slot and nav, so the desk shell
 * must stand out of the way entirely rather than wrapping them — two navs on
 * one screen is not a style problem, it is two answers to "where am I".
 */
const BOARD = new Set(["/dashboard", "/bills", "/cash", "/owed", "/me"]);

// Where someone who feeds the books but does not read them may go: the
// camera, their tin, and their own account. Everything else is the office's.
const FIELD = new Set(["/dashboard", "/cash", "/owed", "/me", "/go"]);

export function AppShell() {
  const location = useLocation();
  const phone = usePhone();
  const { can } = useCompany();
  const field = !can("read");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    function onKey(e) {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // close on route change
  useEffect(() => {
    setPaletteOpen(false);
    setRecordOpen(false);
  }, [location.pathname]);

  if (field && !FIELD.has(location.pathname)) return <Navigate to="/dashboard" replace />;

  // The board's own chrome: always for field staff, and on a phone for the
  // one field tool anybody may hold (a cash tin). Everyone else keeps the app.
  // The expense companion (/go) is its own light app for everyone: no rail, no tab bar.
  const boardHere = location.pathname === "/go" || (field ? BOARD.has(location.pathname) : phone && (location.pathname === "/cash" || location.pathname === "/owed"));
  if (boardHere) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <Sidebar />
      <main className="phone-soft flex-1 min-w-0 px-4 sm:px-6 md:px-8 py-5 md:py-6 pb-32 md:pb-6 max-w-[1600px] min-[2200px]:max-w-[1880px] mx-auto w-full">
        <Topbar onOpenPalette={openPalette} />
        <TrialStrip />
        {/* A CSS fade, not a framer-motion one. The framer version waited for
            the old page to leave, and when the new page was a screen not yet
            fetched it suspended mid-entrance and stayed at opacity 0: Settings
            opened blank until a refresh. A CSS animation runs whatever React
            is doing. */}
        <div key={location.pathname} className="page-enter">
            {/* The boundary sits here rather than around the whole shell, so a
                screen being fetched swaps only the page body. The sidebar and
                the topbar stay put, which is what makes a slow connection feel
                like a page loading rather than the app restarting. */}
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <TabBar onRecord={() => setRecordOpen(true)} />
      <RecordSheet open={recordOpen} onClose={() => setRecordOpen(false)} onBill={(start) => setBillOpen(start || true)} />
      <RecordBill open={Boolean(billOpen)} start={typeof billOpen === "object" ? billOpen : null} onClose={() => setBillOpen(false)} />
    </div>
  );
}
