import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * The primary target of a card.
 *
 * A card that opens a record has to be clickable across its whole face, and a
 * keyboard user has to be able to reach it. The obvious way to do both — put
 * `role="button"` and `onClick` on the card itself — breaks as soon as the card
 * also holds an Edit or Delete button, because a control inside a control is
 * invalid markup and assistive technology either flattens it or reports it
 * wrongly. A screen reader user hears one target where there are three.
 *
 * So the card is not the control. This is: one real link or button, with its
 * hit area stretched over the whole card by an absolutely positioned overlay.
 * The result is a single focusable element per card carrying a proper
 * accessible name, the full card stays clickable by mouse and thumb, and any
 * action buttons sit above the overlay as separate, separately reachable
 * controls.
 *
 * The card it sits in must be `relative`, and sibling controls must be
 * `relative z-10` so they stay clickable above the stretched overlay.
 */
export function CardLink({ to, onClick, label, className, children, ...props }) {
  const stretch =
    "after:absolute after:inset-0 after:content-[''] after:rounded-2xl " +
    "focus-visible:outline-none focus-visible:after:ring-2 " +
    "focus-visible:after:ring-[var(--ink)] focus-visible:after:ring-offset-2 " +
    "focus-visible:after:ring-offset-[var(--bg)]";

  // The ring is drawn on the stretched overlay rather than on the text, so the
  // focus indicator outlines the whole card — which is what the user is about
  // to activate — instead of a few words inside it.
  if (to) {
    return (
      <Link to={to} aria-label={label} className={cn(stretch, className)} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn(stretch, className)} {...props}>
      {children}
    </button>
  );
}
