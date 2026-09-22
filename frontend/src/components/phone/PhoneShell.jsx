import { Link, useLocation } from "react-router-dom";
import { useUndo } from "@/context/UndoContext";
import { useOutbox } from "@/context/OutboxContext";
import { useCompany } from "@/context/CompanyContext";

/**
 * The phone board.
 *
 * Square, ink on white, one signal-yellow field. This is the register from
 * DESIGN.md for a phone held one-handed on a site in equatorial sun — not the
 * desk register scaled down. Corners are 0px, rows are hairline-separated, and
 * the only thing that lifts off the board is the shutter.
 *
 * The layout is fixed rather than flowing: a header, the yellow band, one
 * 44px strip slot, a scrolling body, and the nav. The strip slot never changes
 * height, so nothing below it moves when the undo strip appears and goes.
 */

export function PhoneShell({ heading, unit = "MVR", figure, position, sync, children, onSnap }) {
  return (
    <div className="phone-board">
      <PhoneHeader />

      <div className="on-yellow phone-band" role="group" aria-labelledby="phone-band-h">
        <h1 id="phone-band-h" className="phone-band-h">
          {heading}
        </h1>
        <div className="phone-band-figure">
          <span className="phone-band-unit">{unit}</span>
          <span>{figure}</span>
        </div>
        <div className="phone-band-lines">
          <span className="truncate">{position}</span>
          <span className="phone-band-sync">{sync}</span>
        </div>
      </div>

      <StripSlot />

      <div className="phone-body">{children}</div>

      <PhoneNav onSnap={onSnap} />
    </div>
  );
}

function PhoneHeader() {
  // The company this is, not the company the artboard was drawn for. The name
  // was hard-coded from the design and read "Altura Pvt Ltd" in every set of
  // books, which on a screen about whose money this is, is the one word that
  // has to be right.
  const { company } = useCompany();
  return (
    <div className="phone-header">
      <span className="phone-company">{company?.name || "Sentryfi"}</span>
      <svg width="28" height="28" viewBox="0 0 96 96" role="img" aria-label="Sentryfi" className="ml-auto">
        <circle cx="48" cy="48" r="34" fill="#F2C300" />
        {/* The ring follows the ground. On the night board an ink ring is
            invisible and the mark reads as a cut disc. */}
        <circle cx="48" cy="48" r="34" fill="none" stroke="var(--ink)" strokeWidth="6" />
        <path d="M17.6 58 H78.4" stroke="#141414" strokeWidth="7" />
        <path d="M48 26 V58" stroke="#141414" strokeWidth="7" />
      </svg>
    </div>
  );
}

/**
 * Home has one strip slot and exactly one thing occupies it: the undo while an
 * undo is live, then the notice saying what it did, otherwise nothing. They
 * never stack, and the slot keeps its height either way.
 */
function StripSlot() {
  const { posted, left, notice, undoing, undo } = useUndo();

  if (posted) {
    return (
      <div role="status" aria-live="polite" className="on-ink phone-strip">
        <span className="phone-strip-text">
          Recorded · {posted.who}
        </span>
        <button type="button" onClick={undo} disabled={undoing} className="phone-strip-action">
          <span>{undoing ? "Taking it back" : "Undo"}</span>
          {!undoing && <span aria-hidden="true" className="phone-strip-count">{left}s</span>}
        </button>
      </div>
    );
  }

  if (notice) {
    return (
      <div role="status" aria-live="polite" className="on-ink phone-strip">
        <span className="phone-strip-text">{notice}</span>
      </div>
    );
  }

  return <div className="phone-strip-empty" aria-hidden="true" />;
}

const NAV = [
  { to: "/dashboard", label: "Home", d: "M3 11l9-8 9 8v10h-6v-6H9v6H3z" },
  { to: "/bills", label: "Bills", d: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6" },
];
const NAV_RIGHT = [
  { to: "/cash", label: "Cash", d: "M3 7h18v12H3z M12 13h.01" },
  { to: "/settings", label: "More", d: "M4 7h16M4 12h16M4 17h16" },
];

function PhoneNav({ onSnap }) {
  const { pathname } = useLocation();
  const { count } = useOutbox();
  const { can } = useCompany();
  // Only the places this person can open. Site staff get the camera and More.
  const shows = (to) =>
    to === "/bills" ? can("read") : to === "/cash" ? can("read") || can("spend_cash") || can("count_cash") : true;

  return (
    <nav aria-label="Main" className="on-ink phone-nav">
      {NAV.filter((item) => shows(item.to)).map((item) => (
        <NavItem key={item.to} item={item} active={pathname === item.to} />
      ))}

      <button
        type="button"
        onClick={onSnap}
        aria-label={count > 0 ? `Photograph a bill · ${count} waiting to send` : "Photograph a bill"}
        className="on-yellow phone-shutter"
      >
        <span className="phone-shutter-disc">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        {count > 0 && (
          <span aria-hidden="true" className="phone-shutter-badge">
            {count}
          </span>
        )}
      </button>

      {NAV_RIGHT.filter((item) => shows(item.to)).map((item) => (
        <NavItem key={item.to} item={item} active={pathname === item.to} />
      ))}
    </nav>
  );
}

function NavItem({ item, active }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`phone-nav-item${active ? " is-active" : ""}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={item.d} />
      </svg>
      <span>{item.label}</span>
    </Link>
  );
}
