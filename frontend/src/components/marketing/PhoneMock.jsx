import { motion, useReducedMotion } from "framer-motion";

/**
 * The phone's Home, drawn rather than photographed, in the app's own refined
 * register: a greeting, the one black card for cash and how long it lasts,
 * what needs a person, and money out by month above a floating tab bar. Every
 * figure and name is illustrative and the drawing says so, because PRODUCT.md
 * forbids passing invented numbers off as real ones.
 */

const INK = "#141414";
const MUTED = "#5C5B55";
const ACCENT = "#F2C300";
const FONT = "Barlow, sans-serif";

const needs = [
  { dot: ACCENT, pill: "Costs money", title: "Q3 GST return due in 4 days", sub: "MVR 18,240 to pay" },
  { dot: "#C62B20", pill: "Getting old", title: "Palmway Apartments, 21 days late", sub: "MVR 39,336 still owed" },
];

const months = [
  ["Apr", 52],
  ["May", 64],
  ["Jun", 48],
  ["Jul", 71],
  ["Aug", 58],
  ["Sep", 80],
];

export default function PhoneMock() {
  const still = useReducedMotion();
  const rise = (delay) => (still ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: [0.2, 0.8, 0.2, 1] } });

  return (
    <div
      className="relative mx-auto"
      style={{ width: 300, height: 600 }}
      role="img"
      aria-label="The Sentryfi phone Home: cash and how long it lasts, what needs you, and money out by month. Figures are illustrative."
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius: 38, background: "#F4F3EF", border: `8px solid ${INK}`, boxShadow: "0 30px 70px rgba(20,20,20,.28)" }}
      >
        {/* greeting */}
        <div style={{ padding: "22px 16px 10px", font: `600 17px ${FONT}`, color: INK, letterSpacing: "-.01em" }}>Good morning, Aisha</div>

        {/* the one black card */}
        <motion.div {...rise(0.1)} style={{ margin: "0 12px", borderRadius: 20, background: INK, color: "#FFFFFF", padding: "16px 16px 14px" }} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div style={{ font: `500 11px ${FONT}`, opacity: 0.7 }}>Cash and bank now</div>
            <div className="tabular-nums" style={{ font: `600 25px/1.1 ${FONT}`, letterSpacing: "-.02em", marginTop: 6 }}>
              <span style={{ font: `500 11px ${FONT}`, opacity: 0.6, marginRight: 4, verticalAlign: "0.4em" }}>MVR</span>
              1,284,650
            </div>
            <div style={{ font: `500 11px ${FONT}`, color: ACCENT, marginTop: 10 }}>↗ 118,400 up in 30 days</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ font: `500 11px ${FONT}`, opacity: 0.7 }}>It lasts</div>
            <div style={{ font: `600 16px ${FONT}`, marginTop: 6 }}>7.4 months</div>
            <div style={{ height: 5, width: 64, borderRadius: 99, background: "rgba(255,255,255,.15)", marginTop: 10, marginLeft: "auto", overflow: "hidden" }}>
              <motion.div
                style={{ height: 5, borderRadius: 99, background: ACCENT }}
                initial={still ? false : { width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          </div>
        </motion.div>

        {/* needs you */}
        <div style={{ padding: "16px 16px 8px", font: `600 14px ${FONT}`, color: INK }}>
          Needs you <span style={{ color: MUTED, fontWeight: 400 }}>2</span>
        </div>
        {needs.map((n, i) => (
          <motion.div key={n.title} {...rise(0.3 + i * 0.1)} style={{ margin: "0 12px 8px", borderRadius: 16, background: "#FFFFFF", padding: "11px 12px", boxShadow: "0 6px 18px -10px rgba(20,20,20,.25)" }}>
            <div className="flex items-center" style={{ gap: 6, font: `500 11px ${FONT}`, color: MUTED }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: n.dot }} aria-hidden="true" />
              {n.pill}
            </div>
            <div className="truncate" style={{ font: `600 13px ${FONT}`, color: INK, marginTop: 3 }}>{n.title}</div>
            <div style={{ font: `400 11px ${FONT}`, color: MUTED, marginTop: 1 }}>{n.sub}</div>
          </motion.div>
        ))}

        {/* money out by month */}
        <motion.div {...rise(0.5)} style={{ margin: "6px 12px 0", borderRadius: 16, background: "#FFFFFF", padding: "12px 12px 10px", boxShadow: "0 6px 18px -10px rgba(20,20,20,.25)" }}>
          <div className="flex items-baseline justify-between" style={{ font: `600 12px ${FONT}`, color: INK }}>
            Money out
            <span style={{ font: `500 11px ${FONT}`, color: MUTED }}>6 months</span>
          </div>
          <div className="flex items-end justify-between" style={{ height: 58, marginTop: 8, gap: 8 }}>
            {months.map(([m, h], i) => (
              <div key={m} className="flex flex-col items-center" style={{ flex: 1, gap: 4 }}>
                <motion.span
                  style={{ display: "block", width: "100%", borderRadius: 5, background: i === months.length - 1 ? ACCENT : INK, opacity: i === months.length - 1 ? 1 : 0.8 }}
                  initial={still ? false : { height: 0 }}
                  animate={{ height: (h / 100) * 44 }}
                  transition={{ duration: 0.6, delay: 0.6 + i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
                />
                <span style={{ font: `500 9px ${FONT}`, color: MUTED }}>{m}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* the floating tab bar, with the record button at its centre */}
        <div className="absolute flex items-center justify-around" style={{ left: 14, right: 14, bottom: 14, height: 54, borderRadius: 99, background: "#FFFFFF", boxShadow: "0 10px 26px -10px rgba(20,20,20,.35)", padding: "0 10px" }}>
          {["Home", "Money", "", "Owed", "More"].map((t, i) =>
            i === 2 ? (
              <motion.span
                key="record"
                className="flex items-center justify-center"
                style={{ width: 46, height: 46, borderRadius: 99, background: ACCENT, color: INK, marginTop: -18, boxShadow: "0 8px 18px rgba(20,20,20,.28)" }}
                initial={still ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.85, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </motion.span>
            ) : (
              <span key={t} style={{ font: `${i === 0 ? 600 : 500} 10px ${FONT}`, color: i === 0 ? INK : MUTED }}>
                {t}
              </span>
            )
          )}
        </div>
      </div>

      <span className="absolute left-0 right-0 text-center" style={{ bottom: -26, font: `500 11px ${FONT}`, color: "#70767E" }}>
        Figures are illustrative
      </span>
    </div>
  );
}
