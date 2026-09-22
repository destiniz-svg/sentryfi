import { useLocation } from "react-router-dom";
import { ChevronRight, Moon, Search, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { trail } from "@/lib/sections";
import { NotificationsPopover } from "./NotificationsPopover";

/**
 * The bar that says where you are: the breadcrumb at the left, search with
 * its keyboard hint in the middle, night and notifications at the right. On a
 * phone the tab bar already says where you are, so it keeps the greeting.
 */
export function Topbar({ onOpenPalette }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const firstName = user?.name?.split(" ")[0] || "there";
  const crumbs = trail(pathname);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

  return (
    <header className="flex items-center justify-between gap-6 mb-8 md:min-h-11">
      <p className="text-sm text-[var(--ink-muted)] md:hidden">Hello, {firstName}.</p>
      <nav aria-label="Breadcrumb" className="hidden md:block min-w-0">
        <ol className="flex items-center gap-1.5 text-[14px] text-[var(--ink-muted)]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className={`flex items-center gap-1.5 min-w-0 ${last ? "text-[var(--ink)] font-semibold" : ""}`} aria-current={last ? "page" : undefined}>
                {i > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-[var(--ink-muted)]" />}
                <span className="truncate">{c}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden lg:flex items-center gap-3 h-11 w-[360px] rounded-full bg-[var(--surface)] border border-[var(--border)] pl-5 pr-1.5 text-left"
        >
          <Search size={16} className="text-[var(--ink-muted)] shrink-0" />
          <span className="flex-1 text-sm text-[var(--ink-muted)] truncate">Search, or jump to a page</span>
          <kbd className="inline-flex items-center gap-0.5 text-[10px] px-2 h-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)] font-semibold">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        <IconButton onClick={onOpenPalette} title="Search" className="lg:hidden">
          <Search size={16} />
        </IconButton>

        <IconButton onClick={toggle} title={theme === "light" ? "Night" : "Day"}>
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <NotificationsPopover />
      </div>
    </header>
  );
}
