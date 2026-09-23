import { motion, useReducedMotion } from "framer-motion";

/**
 * The phone board, drawn rather than photographed. Every figure is illustrative
 * and the board says so, because PRODUCT.md forbids passing invented numbers off
 * as real ones. The band counts up once on entry; the ruled row slides in after
 * it, which is the same two-beat the real app plays when a bill posts.
 */

const rows = [
  ["18 Sep", "Moonreef Hotels", "Money in · advance", "+250,000", true],
  ["17 Sep", "Road Development Corp.", "Excavator rental", "+42,000", true],
  ["16 Sep", "Fuel Supplies Maldives", "Diesel · site cash box", "−6,120", false],
];

const codes = [
  ["Materials", 100],
  ["Labour", 53],
  ["Subcontractors", 34],
  ["Everything else", 40],
];

export default function PhoneMock() {
  const still = useReducedMotion();

  return (
    <div
      className="relative mx-auto"
      style={{ width: 300, height: 600 }}
      role="img"
      aria-label="The Sentryfi phone board, showing what has been spent this month, where it went, and the latest movements. Figures are illustrative."
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: 34,
          background: "#FFFFFF",
          border: "8px solid #141414",
          boxShadow: "0 30px 70px rgba(20,20,20,.28)",
        }}
      >
        {/* band */}
        <div style={{ background: "#F2C300", color: "#141414", padding: "26px 18px 16px" }}>
          <div
            style={{
              font: "600 11px Barlow, sans-serif",
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            Spent this month
          </div>
          <div className="flex items-baseline gap-2" style={{ paddingTop: 4 }}>
            <span style={{ font: "500 15px Barlow, sans-serif" }}>MVR</span>
            <motion.span
              className="tabular-nums"
              style={{ font: "600 40px/1 Barlow, sans-serif", letterSpacing: "-.02em" }}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              412,880
            </motion.span>
          </div>
          <div style={{ font: "500 12px Barlow, sans-serif", paddingTop: 4 }}>
            MVR 1,284,650 in bank and cash
          </div>
        </div>

        {/* where it went */}
        <div style={{ padding: "14px 18px 4px" }}>
          <div
            style={{
              font: "600 10px Barlow, sans-serif",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#70767E",
            }}
          >
            Where it went
          </div>
          {codes.map(([name, pct], i) => (
            <div key={name} className="flex items-center gap-2" style={{ padding: "6px 0" }}>
              <span
                style={{ font: "500 12px Barlow, sans-serif", width: 96, flexShrink: 0 }}
                className="truncate"
              >
                {name}
              </span>
              <span
                style={{ height: 6, borderRadius: 99, background: "#F1F2F4", flex: 1 }}
              >
                <motion.span
                  style={{ display: "block", height: 6, borderRadius: 99, background: "#141414" }}
                  initial={still ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, delay: 0.3 + i * 0.09, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </span>
            </div>
          ))}
        </div>

        {/* the rule */}
        <div style={{ padding: "10px 18px 0" }}>
          <div
            style={{
              font: "600 10px Barlow, sans-serif",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#70767E",
              paddingBottom: 2,
            }}
          >
            Latest recorded
          </div>
          {rows.map(([date, who, what, amount, isIn], i) => (
            <motion.div
              key={who}
              className="grid items-center"
              style={{
                gridTemplateColumns: "42px minmax(0,1fr) 78px",
                columnGap: 8,
                minHeight: 50,
                padding: "7px 0",
                borderTop: "1px solid #E6E7EA",
              }}
              initial={still ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.55 + i * 0.1 }}
            >
              <span style={{ font: "600 10px Barlow, sans-serif", color: "#70767E" }}>{date}</span>
              <span className="min-w-0">
                <span
                  className="block truncate"
                  style={{ font: "600 12px Barlow, sans-serif" }}
                >
                  {who}
                </span>
                <span
                  className="block truncate"
                  style={{ font: "400 11px Barlow, sans-serif", color: "#70767E" }}
                >
                  {what}
                </span>
              </span>
              <span
                className="tabular-nums"
                style={{
                  font: "600 13px Barlow, sans-serif",
                  textAlign: "right",
                  paddingRight: 8,
                  borderRight: "2px solid #141414",
                  alignSelf: "stretch",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  color: isIn ? "#167A41" : "#C62B20",
                }}
              >
                {amount}
              </span>
            </motion.div>
          ))}
        </div>

        {/* shutter */}
        <div
          className="absolute flex items-center justify-center"
          style={{ left: 0, right: 0, bottom: 18 }}
        >
          <motion.span
            className="flex items-center justify-center"
            style={{
              width: 68,
              height: 68,
              borderRadius: 999,
              background: "#F2C300",
              boxShadow: "0 10px 24px rgba(20,20,20,.3)",
            }}
            initial={still ? false : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.85, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span
              className="flex items-center justify-center"
              style={{ width: 52, height: 52, borderRadius: 999, background: "#141414", color: "#F2C300" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </motion.span>
        </div>
      </div>

      <span
        className="absolute left-0 right-0 text-center"
        style={{ bottom: -26, font: "500 11px Barlow, sans-serif", color: "#70767E" }}
      >
        Figures are illustrative
      </span>
    </div>
  );
}
