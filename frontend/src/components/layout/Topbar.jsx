import { useLocation } from "react-router-dom";
import { ChevronRight, Moon, Search, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { trail } from "@/lib/sections";
import { NotificationsPopover } from "./NotificationsPopover";
import { useT } from "@/lib/i18n";

/**
 * The bar that says where you are: the breadcrumb at the left, search with
 * its keyboard hint in the middle, night and notifications at the right. On a
 * phone the tab bar already says where you are, so it keeps the greeting.
 */
export function Topbar({ onOpenPalette }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const firstName = user?.name?.split(" ")[0] || "there";
  const { t } = useT();
  const crumbs = trail(pathname, search).map((c) => t(c));

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

  return (
    <header className="flex items-center justify-between gap-4 md:gap-6 mb-6 md:mb-8 md:min-h-11">
      {/* On a phone: who this is, the way the day begins. */}
      <div className="md:hidden flex items-center gap-3 min-w-0">
        <span aria-hidden="true" className="h-11 w-11 shrink-0 rounded-full bg-[var(--ink)] text-[var(--accent)] font-display text-[18px] font-bold inline-flex items-center justify-center">
          {initials(user?.name)}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-4 text-[var(--ink-muted)]">{t(greeting())}</p>
          <p className="text-[20px] leading-6 tracking-[-0.01em] truncate">{firstName}</p>
        </div>
      </div>
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
          <kbd className="inline-flex items-center gap-0.5 text-[11px] px-2 h-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)] font-semibold">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        <IconButton onClick={onOpenPalette} title="Search" className="lg:hidden">
          <Search size={16} />
        </IconButton>

        <IconButton onClick={toggle} title={theme === "light" ? "Night" : "Day"} className="max-md:hidden">
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <NotificationsPopover />
      </div>
    </header>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase() || "·";
}
