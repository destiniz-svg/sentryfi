import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { MobileNav } from "./MobileNav";
import { RouteFallback } from "@/components/ui/RouteFallback";
import { usePhone } from "@/lib/phone";

/**
 * The screens that carry the phone board's own chrome.
 *
 * They draw their own header, band, strip slot and nav, so the desk shell
 * must stand out of the way entirely rather than wrapping them — two navs on
 * one screen is not a style problem, it is two answers to "where am I".
 */
const BOARD = new Set(["/dashboard", "/bills", "/cash"]);

export function AppShell() {
  const location = useLocation();
  const phone = usePhone();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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
    setNavOpen(false);
  }, [location.pathname]);

  if (phone && BOARD.has(location.pathname)) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <Sidebar />
      <main className="flex-1 px-4 sm:px-6 md:px-8 py-6 pb-28 md:pb-6 max-w-[1600px] mx-auto w-full">
        <Topbar onOpenPalette={openPalette} />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* The boundary sits here rather than around the whole shell, so a
                screen being fetched swaps only the page body. The sidebar and
                the topbar stay put, which is what makes a slow connection feel
                like a page loading rather than the app restarting. */}
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <MobileNav
        open={navOpen}
        onOpen={() => setNavOpen(true)}
        onClose={() => setNavOpen(false)}
      />
    </div>
  );
}
