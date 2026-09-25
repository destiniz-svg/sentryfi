import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A dialog a keyboard can get out of.
 *
 * Four of the app's modals had none of this: no Escape, no focus trap, no
 * focus restore, no role, no aria-modal, no scroll lock. The consequences are
 * not cosmetic. Focus stays in the page behind the overlay, so a screen reader
 * reads the page underneath as if nothing had opened, and the only way out for
 * a keyboard user is to find and click Cancel with a mouse.
 *
 * The behaviour here was first written for the old phone menu (MobileNav), which had
 * been written correctly and was the only one in the codebase that had. It
 * lives here so the next dialog inherits it rather than reinventing three
 * quarters of it.
 *
 * Focusable selector note: the list below is deliberately wider than
 * MobileNav's "a,button", because these dialogs are forms. A trap that does
 * not know about inputs lets Tab escape to the page behind on the first field.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * The box a dialog may use: the visible part of the screen. A phone keyboard
 * shrinks the visual viewport but not `inset-0`, so a bottom sheet sat behind
 * the keyboard and the person typed blind. Pinning the overlay to
 * visualViewport keeps it above the keyboard; the focused field is then
 * scrolled back into view inside the panel.
 */
export function useVisibleBox(active) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const fit = () => {
      setBox({ top: vv.offsetTop, height: vv.height, bottom: "auto" });
      requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: "nearest" }));
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      setBox(null);
    };
  }, [active]);
  return box ?? undefined;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  as = "div",
  onSubmit,
  className,
  size = "md",
  initialFocus,
  // The phone board's review sheet: square, full width, rising from the
  // bottom edge with a grabber, rather than a rounded card floating in the
  // middle of the screen. Same dialog behaviour — only the register changes.
  variant = "card",
}) {
  const still = useReducedMotion();
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    // Remember who opened it, so focus can go back there on close. Without
    // this, closing a dialog drops focus to the top of the document and a
    // keyboard user has to tab back to where they were.
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Let the panel mount before reaching into it.
    const focusTimer = setTimeout(() => {
      const target =
        (initialFocus?.current ?? null) ||
        panelRef.current?.querySelector(FOCUSABLE);
      target?.focus();
    }, 0);

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes?.length) return;
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null);
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && opener.focus) opener.focus();
    };
  }, [open, onClose, initialFocus]);

  const Panel = as === "form" ? motion.form : motion.div;
  const widths = { sm: "max-w-[380px]", md: "max-w-[460px]", lg: "max-w-[620px]" };
  const sheet = variant === "sheet";
  const box = useVisibleBox(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={box}
          className={cn(
            "fixed inset-0 z-50 flex justify-center",
            sheet ? "items-end" : "items-center p-4"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={still ? { duration: 0 } : undefined}
        >
          <div
            className="absolute inset-0 bg-[var(--ink)]/30 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <Panel
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            onSubmit={onSubmit}
            initial={
              still ? false : sheet ? { y: 40, opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
            }
            animate={sheet ? { y: 0, opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={
              still ? { opacity: 0 } : sheet ? { y: 24, opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }
            }
            transition={
              still
                ? { duration: 0 }
                : sheet
                  ? { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }
                  : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
            }
            className={cn(
              "relative w-full bg-[var(--surface)] overflow-y-auto",
              sheet
                ? "phone-sheet max-h-[92%] px-5 pb-6 pt-3"
                : "rounded-3xl border border-[var(--border)] shadow-hover p-6 max-h-full",
              !sheet && widths[size],
              className
            )}
          >
            {sheet && (
              /* The grabber says which edge this came from, which is the only
                 thing on a sheet that is allowed a round corner. */
              <div aria-hidden="true" className="phone-sheet-grabber" />
            )}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h3
                  id={titleId}
                  className={
                    sheet
                      ? "font-display text-[22px] font-semibold tracking-[-0.01em]"
                      : "font-display text-lg font-semibold tracking-tight"
                  }
                >
                  {title}
                </h3>
                {description && (
                  <p
                    id={descId}
                    className={
                      sheet
                        ? "text-[13px] text-[var(--ink-muted)] mt-1 leading-snug"
                        : "text-xs text-[var(--ink-muted)] mt-1"
                    }
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  "h-11 w-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                  sheet && "bg-[var(--surface-2)]"
                )}
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
