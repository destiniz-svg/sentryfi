import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import AILogo from "@/components/layout/AILogo";
import Reveal from "@/components/marketing/Reveal";

/**
 * The website as a surveyor's level book. A level book only closes when two
 * sums agree, and so do Sentryfi's books: the page is booked like one, every
 * section a reading on the staff down its left edge, the hero a bill booking
 * itself onto the rule until the check line reads "Balanced".
 *
 * Everything claimed here is something the product does. There are no
 * customers, prices or quotes, because none exist yet. The screens are the
 * demo company's made-up books, and the bills in the hero are illustrations.
 */

const INK = "#141414";
const YELLOW = "#F2C300";
const RED = "#C62B20";
const EASE = [0.2, 0.8, 0.2, 1];

const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Four ordinary bills, four ways GST arrives. Illustrative, and labelled so.
const BILLS = [
  {
    tab: "GST on top",
    supplier: "Seabridge Cement Supplies",
    ref: "SCS-2026-0911",
    date: "15 Sept 2026",
    items: [["Cement, 40 bags", "3,000.00"], ["GST 8%", "240.00"]],
    total: "MVR 3,240.00",
    rows: [
      ["Materials", "Staff block", 3000],
      ["GST you claim back", "8% on top of 3,000.00", 240],
    ],
    from: ["Main current account", 3240],
    note: "The supplier added 8% on top, so the price and the tax go on separate lines.",
  },
  {
    tab: "GST inside",
    supplier: "Brightwater Fuel Co",
    ref: "BF-80102",
    date: "22 Sept 2026",
    items: [["Diesel, 480 litres", "15,336.00"], ["Price includes GST", ""]],
    total: "MVR 15,336.00",
    rows: [
      ["Fuel", "Excavator 2", 14200],
      ["GST you claim back", "8% already inside 15,336.00", 1136],
    ],
    from: ["Staff block site tin", 15336],
    note: "The price already included GST, so Sentryfi takes it out instead of adding it.",
  },
  {
    tab: "No GST",
    supplier: "Island Weld Works",
    ref: "No bill number",
    date: "18 Sept 2026",
    items: [["Welding, gate frames", "4,500.00"], ["Not GST registered", ""]],
    total: "MVR 4,500.00",
    rows: [["Subcontractors", "Staff block", 4500]],
    from: ["Office petty cash", 4500],
    note: "Not registered for GST, so there is nothing to claim, and nothing is invented.",
  },
  {
    tab: "In dollars",
    supplier: "Northwind Steel Trading",
    ref: "NST-2208",
    date: "14 Sept 2026",
    items: [["Rebar 12mm, 6 tonnes", "USD 8,600.00"], ["Rate on the day", "15.42"]],
    total: "USD 8,600.00",
    rows: [["Materials", "USD 8,600.00 at 15.42", 132612]],
    from: ["Dollar account", 132612],
    note: "Kept in dollars, reported in rufiyaa, and the rate used is stored on the entry.",
  },
];

// What the product is, each a reading taken on the staff, each with its real screen.
const READINGS = [
  {
    id: "snap",
    title: "Snap the bill on site",
    body: "The camera opens on launch. Sentryfi reads the bill, asks only about what it doubts, and posts it. No signal is fine: bills wait on the phone.",
    img: "/site/phone-money.png",
    phone: true,
    alt: "Sentryfi on a phone: the Money screen listing bills, one waiting for a decision and the others in the books.",
  },
  {
    id: "needs",
    title: "It tells you what needs you",
    body: "No dashboard of tiles. A short list, assembled from the books: a return running late, a bill nobody has decided on, bank lines nothing explains.",
    img: "/site/phone-home.png",
    phone: true,
    alt: "Sentryfi on a phone: Home, with cash and bank now and three things that need the owner.",
  },
  {
    id: "bank",
    title: "The bank agrees with the books",
    body: "Drop in the statement as your bank exports it. Lines the books already explain are matched. The rest wait for one answer each.",
    img: "/site/desk-match.png",
    alt: "The bank statement screen: lines the books do not yet explain, each with a question, what was it.",
  },
  {
    id: "cfo",
    title: "A CFO every morning",
    body: "Cash now, what comes in and goes out in thirty days, and what to do about it, written only from your own figures. Ask it anything; it reads, never changes.",
    img: "/site/desk-cfo.png",
    alt: "The CFO screen: cash now, thirty days in and out, and the morning brief.",
  },
  {
    id: "tax",
    title: "The return, the way MIRA asks",
    body: "The GST return builds as you go. Both statements come in MIRA's own layout, ready for the portal, with every bill behind every figure.",
    img: "/site/desk-tax.png",
    alt: "The GST return screen: supplies, output tax, input tax and the amount payable, with the two MIRA statements.",
  },
  {
    id: "cash",
    title: "Every tin, every account, both currencies",
    body: "Cash tins held by named people, accounts in rufiyaa and dollars, and what each one should hold according to the books.",
    img: "/site/desk-bank.png",
    alt: "The bank and cash screen: bank accounts in rufiyaa and dollars, and two cash tins with who holds them.",
  },
];

const LOCAL = [
  ["GST, whichever way it was quoted", "Added on top, already inside, or not charged at all by a supplier who is not registered. Sentryfi records which, rather than assuming."],
  ["The return and both statements", "Figures in MIRA's format, and the Input and Output Tax Statements in the portal's own layout."],
  ["Withholding tax on payments abroad", "Kept back when a non-resident is paid, and due with the MIRA 602 by the 15th."],
  ["Rufiyaa and dollars", "Held in the currency you dealt in, reported in rufiyaa, with the rate that was used kept on the entry."],
  ["Your history from Zoho Books", "Bring in the backup and every account ends where it did there, to the laari."],
  ["An archive an auditor can read", "Every bill's image kept against its entry, found by supplier, amount and number."],
];

const ROLES = [
  ["Owner", "Everything, on the phone and at the desk."],
  ["Accountant", "The journal, the trial balance, the return. Corrects with a reason; deletes nothing."],
  ["Office admin", "Bills, invoices, the bank, and chasing what is unpaid."],
  ["Approver", "Says yes or no above a limit, and nothing else."],
  ["Directors", "See what they put in and what it was spent on. They never post."],
  ["Site staff", "Photograph a bill, tag the project. That is all."],
  ["Cash holder", "One number: what is left in their own tin."],
];

// A levelling staff: E-graduations, alternating ink and red by the half metre.
function Staff({ className = "", vertical = true }) {
  const id = vertical ? "staff-v" : "staff-h";
  return (
    <svg className={className} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        {vertical ? (
          <pattern id={id} width="18" height="100" patternUnits="userSpaceOnUse">
            <rect width="18" height="100" fill={YELLOW} />
            {[0, 50].map((y, k) => (
              <g key={y} fill={k ? RED : INK}>
                <rect x="4" y={y} width="4" height="50" />
                <rect x="8" y={y} width="7" height="5" />
                <rect x="8" y={y + 10} width="7" height="5" />
                <rect x="8" y={y + 20} width="7" height="5" />
                <rect x="8" y={y + 30} width="7" height="5" />
                <rect x="8" y={y + 40} width="7" height="5" />
              </g>
            ))}
          </pattern>
        ) : (
          <pattern id={id} width="100" height="6" patternUnits="userSpaceOnUse">
            <rect width="100" height="6" fill={YELLOW} />
            {[0, 50].map((x, k) => (
              <g key={x} fill={k ? RED : INK}>
                {[0, 10, 20, 30, 40].map((d) => (
                  <rect key={d} x={x + d} y="0" width="5" height="6" />
                ))}
              </g>
            ))}
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// The staff down the page, with the instrument's crosshair reading where you are.
function StaffSpine({ reading }) {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  const fill = useTransform(smooth, (v) => `${Math.max(2, v * 100).toFixed(2)}%`);
  return (
    <>
      <div className="hidden lg:block fixed left-0 top-16 bottom-0 w-[18px] z-40 border-r-2 border-[#141414] bg-[#EDEEF0]">
        <motion.div style={{ height: fill }} className="absolute inset-x-0 top-0 overflow-hidden">
          <Staff className="absolute inset-x-0 top-0 w-full h-[100vh]" />
        </motion.div>
        <motion.div style={{ top: fill }} className="absolute left-0 -translate-y-1/2 flex items-center pointer-events-none">
          <span className="block w-[34px] h-[2px] bg-[#141414]" />
          <span className="ml-1 h-7 px-2.5 inline-flex items-center bg-[#141414] text-[#F2C300] outline outline-1 outline-[#F2C300] font-display text-[12px] font-bold uppercase tracking-[.12em] whitespace-nowrap">
            {reading}
          </span>
        </motion.div>
      </div>
      <div className="lg:hidden fixed top-16 inset-x-0 h-[6px] z-40 bg-[#EDEEF0]" aria-hidden="true">
        <motion.div style={{ width: fill }} className="h-full overflow-hidden">
          <Staff vertical={false} className="w-[100vw] h-[6px]" />
        </motion.div>
      </div>
    </>
  );
}

// The bill as it arrived: a flat document beside the book it is booked into.
function Receipt({ bill }) {
  return (
    <div
      className="w-[236px] bg-[#EDE9DF] text-[#2A2C33] px-5 pt-4 pb-5 border border-[#B9B4A6]"
      aria-label={`Illustrative bill from ${bill.supplier}`}
    >
      <div className="font-display text-[12px] font-bold uppercase tracking-[.12em] text-[#5A5648]">The bill</div>
      <div className="mt-2 font-display text-[17px] font-bold uppercase leading-tight tracking-[.04em]">{bill.supplier}</div>
      <div className="mt-3 flex justify-between text-[11px] text-[#5A5648] tabular-nums">
        <span>{bill.ref}</span>
        <span>{bill.date}</span>
      </div>
      <div className="mt-3 border-t border-dashed border-[#C9C4B6]" />
      {bill.items.map(([what, amt]) => (
        <div key={what} className="mt-2.5 flex justify-between gap-3 text-[12px] tabular-nums">
          <span className="text-[#5A5648]">{what}</span>
          <span>{amt}</span>
        </div>
      ))}
      <div className="mt-3 border-t border-dashed border-[#C9C4B6]" />
      <div className="mt-2.5 flex justify-between font-display text-[15px] font-bold tabular-nums">
        <span>TOTAL</span>
        <span>{bill.total}</span>
      </div>
    </div>
  );
}

// The signature: a bill booking itself onto the rule until the check line agrees.
function LevelBook() {
  const still = useReducedMotion();
  const [which, setWhich] = useState(0);
  const [step, setStep] = useState(still ? 99 : 0);
  const bill = BILLS[which];
  const lines = bill.rows.length + 1;
  const sum = bill.rows.reduce((a, r) => a + r[2], 0);

  useEffect(() => {
    if (still) return undefined;
    const t = setInterval(() => setStep((s) => (s > lines + 1 ? s : s + 1)), 560);
    return () => clearInterval(t);
  }, [which, lines, still]);

  const done = step > lines;
  const pick = (i) => {
    setWhich(i);
    setStep(still ? 99 : 0);
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-0 border-2 border-[#141414] w-fit" role="tablist" aria-label="Four ways a bill arrives">
        {BILLS.map((b, i) => (
          <button
            key={b.tab}
            role="tab"
            aria-selected={i === which}
            onClick={() => pick(i)}
            className={`h-10 px-3 sm:px-4 font-display text-[12px] sm:text-[13px] font-bold uppercase tracking-[.1em] transition-colors ${
              i ? "border-l-2 border-[#141414]" : ""
            } ${i === which ? "bg-[#141414] text-white" : "bg-white text-[#141414] hover:bg-[#F4F4F2]"}`}
          >
            {b.tab}
          </button>
        ))}
      </div>

      <div className="mt-6 grid sm:grid-cols-[auto_minmax(0,1fr)] gap-6 sm:gap-8 items-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={which}
            initial={still ? false : { opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="justify-self-center sm:justify-self-start sm:pt-4"
          >
            <Receipt bill={bill} />
          </motion.div>
        </AnimatePresence>

        <div className="bg-white border-2 border-[#141414]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] h-9 items-center px-4 bg-[#141414] text-white font-display text-[12px] font-bold uppercase tracking-[.12em]">
            <span>What it was for</span>
            <span className="pr-[12px]">Amount</span>
          </div>
          <div className="relative">
            <motion.span
              aria-hidden="true"
              className="absolute right-[14px] top-0 w-[2px] bg-[#141414] origin-top"
              style={{ height: "100%" }}
              initial={still ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
              key={`rule-${which}`}
            />
            {bill.rows.map(([what, detail, amt], i) => (
              <Row key={`${which}-${what}`} shown={step > i} dir="in" still={still}>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold truncate">{what}</div>
                  <div className="text-[13px] text-[#5F646C] truncate">{detail}</div>
                </div>
                <div className="text-[15px] font-semibold tabular-nums text-right pr-[10px]">{fmt(amt)}</div>
              </Row>
            ))}
            <Row shown={step > bill.rows.length} dir="out" still={still}>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">Paid from</div>
                <div className="text-[13px] text-[#5F646C] truncate">{bill.from[0]}</div>
              </div>
              <div className="text-[15px] font-semibold tabular-nums text-right pr-[10px] text-[#C62B20]">&minus;{fmt(bill.from[1])}</div>
            </Row>
          </div>
          <div
            className={`flex items-center justify-between gap-3 px-4 h-12 border-t-2 border-[#141414] transition-colors duration-500 ${
              done ? "bg-[#141414] text-white" : "bg-white text-[#5F646C]"
            }`}
            aria-live="polite"
          >
            <span className="font-display text-[13px] font-bold uppercase tracking-[.12em]">
              {done ? "Check" : "Booking"}
            </span>
            <span className="tabular-nums text-[14px]">
              {done ? (
                <>
                  {fmt(sum)} <span className="text-[#A9ADB6]">=</span> {fmt(bill.from[1])}
                  <span className="ml-3 inline-flex items-center gap-1 font-display text-[13px] font-bold uppercase tracking-[.12em] text-[#F2C300]">
                    <Check size={15} strokeWidth={3} aria-hidden="true" /> Balanced
                  </span>
                </>
              ) : (
                "reading the bill"
              )}
            </span>
          </div>
          <p className="px-4 py-3 text-[13.5px] leading-[1.45] text-[#5F646C] border-t border-[#E6E7EA] min-h-[62px]">{bill.note}</p>
        </div>
      </div>
      <button
        onClick={() => (done ? pick((which + 1) % BILLS.length) : setStep(99))}
        className="mt-4 inline-flex items-center gap-2 h-11 text-[14px] font-semibold text-[#0F4C5C] underline underline-offset-4 decoration-2 hover:text-[#141414]"
      >
        <RotateCcw size={15} aria-hidden="true" /> Book another bill
      </button>
      <p className="mt-1 text-[12.5px] text-[#5F646C]">Illustrative bills. The books you keep are your own.</p>
    </div>
  );
}

function Row({ shown, dir, still, children }) {
  return (
    <motion.div
      className="grid grid-cols-[minmax(0,1fr)_104px] sm:grid-cols-[minmax(0,1fr)_112px] gap-6 items-center px-4 min-h-[58px] py-2 border-b border-[#E6E7EA]"
      initial={still ? false : { opacity: 0, y: dir === "in" ? 16 : -16 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: dir === "in" ? 16 : -16 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// The product, each part a reading; the screen beside them follows the one you are on.
function Readings() {
  const still = useReducedMotion();
  const [active, setActive] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const r = READINGS[active];
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 xl:gap-16">
      <div className="hidden lg:block">
        <div className="sticky top-[96px]">
        <div className="h-8 inline-flex items-center px-3 bg-[#141414] text-white font-display text-[12px] font-bold uppercase tracking-[.12em] tabular-nums">
          Reading {active + 1} of {READINGS.length} &middot; {r.title}
        </div>
        <div className={`relative border-2 border-[#141414] bg-[#F4F4F2] overflow-hidden ${r.phone ? "h-[min(calc(100dvh-160px),660px)]" : "aspect-[16/10]"}`}>
          <AnimatePresence initial={false}>
            <motion.div
              key={r.id}
              className={`absolute inset-0 flex ${r.phone ? "items-center justify-center p-6" : ""}`}
              initial={still ? false : { clipPath: "inset(0 0 100% 0)" }}
              animate={{ clipPath: "inset(0 0 0% 0)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <Screen r={r} fill />
            </motion.div>
          </AnimatePresence>
        </div>
        </div>
      </div>
      <ol className="border-t-2 border-[#141414]">
        {READINGS.map((x, i) => (
          <li
            key={x.id}
            ref={(el) => (refs.current[i] = el)}
            data-i={i}
            className="lg:min-h-[46vh] flex flex-col justify-start pt-10 pb-12 border-b border-[#E6E7EA]"
          >
            <div className="flex items-baseline gap-4">
              <span
                className={`font-display text-[15px] font-bold tabular-nums transition-colors ${i === active ? "text-[#141414]" : "text-[#A9ADB6]"}`}
                aria-hidden="true"
              >
                {(i + 1).toFixed(1)}
              </span>
              <h3 className="font-display text-[clamp(28px,3vw,40px)] leading-[1.02] font-bold uppercase tracking-[.01em]">{x.title}</h3>
            </div>
            <p className="mt-4 text-[17px] leading-[1.55] text-[#3D4046] max-w-[46ch]">{x.body}</p>
            <div className="lg:hidden mt-6 border-2 border-[#141414] bg-[#F4F4F2] p-4 flex justify-center">
              <Screen r={x} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Screen({ r, fill = false }) {
  return r.phone ? (
    <img
      src={r.img}
      alt={r.alt}
      width="390"
      height="844"
      loading="lazy"
      className="h-full max-h-[620px] w-auto max-w-full rounded-[34px] border-[6px] border-[#141414] bg-white"
    />
  ) : (
    <img
      src={r.img}
      alt={r.alt}
      width="1440"
      height="900"
      loading="lazy"
      className={fill ? "w-full h-full object-contain" : "w-full h-auto border border-[#141414] bg-white"}
    />
  );
}

// Returns fall due on the 28th after each quarter; the light runs to now.
function FilingStrip() {
  const still = useReducedMotion();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const today = new Date();
  const now = today.getMonth();
  const midnight = new Date(today.getFullYear(), now, today.getDate());
  // The next return due: the first quarter-end month's 28th still ahead.
  let next = null;
  for (let k = 0; k < 13 && !next; k += 1) {
    const m = (now + k) % 12;
    const d = new Date(today.getFullYear() + Math.floor((now + k) / 12), m, 28);
    if (m % 3 === 0 && d >= midnight) next = { m, d };
  }
  const daysLeft = next ? Math.round((next.d - midnight) / 86400000) : null;
  const [lit, setLit] = useState(-1);
  const ref = useRef(null);

  // Runs every time the strip comes into view, so it is not spent before anyone looks.
  // Only colours change, nothing moves, so it runs with reduced motion too, in slower steps.
  useEffect(() => {
    let t;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(t);
      if (!e.isIntersecting) return setLit(-1);
      let i = -1;
      t = setInterval(() => {
        i += 1;
        setLit(i);
        if (i >= now) clearInterval(t);
      }, still ? 160 : 110);
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      clearInterval(t);
    };
  }, [now, still]);

  return (
    <div ref={ref}>
      <div className="grid grid-cols-6 sm:grid-cols-12 border-2 border-[#141414]">
        {months.map((m, i) => {
          const due = i % 3 === 0;
          const isNext = next && i === next.m;
          const past = due && !isNext && i < now;
          const on = i <= lit;
          return (
            <div
              key={m}
              className={`relative h-[92px] sm:h-[118px] flex flex-col justify-between p-2.5 ${i % 6 ? "border-l border-[#141414]" : "sm:border-l sm:first:border-l-0 border-[#141414]"} ${
                i >= 6 ? "border-t sm:border-t-0 border-[#141414]" : ""
              } ${i === now && on ? "bg-[#F2C300]" : on ? "bg-[#141414] text-white" : "bg-white"} transition-colors duration-200`}
            >
              <span className="font-display text-[14px] font-bold uppercase tracking-[.1em]">{m}</span>
              {isNext && (
                <span className="flex flex-col gap-1">
                  <span className="h-[8px] w-full" style={{ background: `repeating-linear-gradient(135deg, ${YELLOW} 0 6px, ${INK} 6px 12px)` }} aria-hidden="true" />
                  <span className="font-display text-[12px] font-bold tabular-nums leading-tight">
                    28th &middot; {daysLeft} {daysLeft === 1 ? "day" : "days"}
                  </span>
                </span>
              )}
              {past && (
                <span className="inline-flex items-center gap-1 font-display text-[12px] font-bold tabular-nums">
                  <Check size={13} strokeWidth={3} aria-hidden="true" /> 28th filed
                </span>
              )}
              {due && !isNext && !past && <span className="font-display text-[12px] font-bold tabular-nums">28th</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[14px] text-[#5F646C]">
        A quarterly filer: returns fall due on the 28th after each quarter. The stripe marks the next one, counted down, and Sentryfi says what is still wrong with it before it is due.
      </p>
    </div>
  );
}

const SECTIONS = [
  ["book", "The bill"],
  ["check", "The check"],
  ["screens", "The app"],
  ["maldives", "The Maldives"],
  ["filing", "The 28th"],
  ["who", "Who sees what"],
];

export default function Landing() {
  const [reading, setReading] = useState("The bill");

  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "light");
    return () => {
      if (prev) document.documentElement.setAttribute("data-theme", prev);
      else document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setReading(e.target.dataset.reading)),
      { rootMargin: "-40% 0px -55% 0px" }
    );
    document.querySelectorAll("[data-reading]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="site min-h-dvh bg-white text-[#141414] font-sans">
      <style>{`
        .site ::selection { background: ${YELLOW}; color: ${INK}; }
        .site a:focus-visible, .site button:focus-visible { outline: 3px solid ${INK}; outline-offset: 3px; }
        .site .on-ink a:focus-visible, .site .on-ink button:focus-visible { outline-color: ${YELLOW}; }
        html:has(.site) { scrollbar-color: ${INK} #F4F4F2; scroll-behavior: smooth; scroll-padding-top: 88px; }
        @media (prefers-reduced-motion: reduce) { html:has(.site) { scroll-behavior: auto; } }
      `}</style>

      <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white border-b-2 border-[#141414]">
        <div className="h-full mx-auto max-w-[1320px] pl-4 pr-4 lg:pl-[64px] lg:pr-8 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Sentryfi home">
            <AILogo size={30} />
            <span className="text-[20px] font-semibold tracking-[-.02em]">Sentryfi</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-6 ml-4" aria-label="On this page">
            {SECTIONS.slice(0, 5).map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`font-display text-[13px] font-bold uppercase tracking-[.12em] underline-offset-[6px] decoration-2 hover:underline ${
                  reading === label ? "text-[#141414] underline" : "text-[#5F646C]"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link to="/login" className="h-11 px-3 inline-flex items-center text-[15px] font-semibold text-[#3D4046] hover:text-[#141414]">
              Log in
            </Link>
            <Link
              to="/register"
              className="h-11 px-4 inline-flex items-center bg-[#141414] text-[#F2C300] font-display text-[14px] font-bold uppercase tracking-[.1em] hover:bg-[#2A2A2A] transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <StaffSpine reading={reading} />

      <main className="pt-16 lg:pl-[18px]">
        {/* The first reading: a bill, booked. */}
        <section id="book" data-reading="The bill" className="border-b-2 border-[#141414]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] pt-14 sm:pt-20 pb-16 grid xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] gap-12 xl:gap-16 items-center">
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
                className="font-display font-bold uppercase text-[clamp(60px,9vw,96px)] leading-[.9] tracking-[-.01em]"
              >
                Snap it.
                <br />
                Record it.
                <br />
                <span className="inline-block bg-[#F2C300] px-3 -mx-3 mt-1">Done.</span>
              </motion.h1>
              <Reveal delay={0.15}>
                <p className="mt-8 text-[clamp(18px,1.5vw,20px)] leading-[1.5] text-[#3D4046] max-w-[46ch]">
                  Books for Maldivian businesses that check themselves. Photograph a bill and Sentryfi books it,
                  GST the right way round, in rufiyaa or dollars. Every entry has to balance before it goes in, and
                  nobody has to learn the word debit.
                </p>
              </Reveal>
              <Reveal delay={0.22}>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    to="/register"
                    className="group h-14 px-6 inline-flex items-center gap-3 bg-[#141414] text-[#F2C300] font-display text-[16px] font-bold uppercase tracking-[.1em] hover:bg-[#2A2A2A] transition-colors"
                  >
                    Start recording bills
                    <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                  <a
                    href="#screens"
                    className="h-14 px-6 inline-flex items-center border-2 border-[#141414] font-display text-[16px] font-bold uppercase tracking-[.1em] hover:bg-[#141414] hover:text-white transition-colors"
                  >
                    See the app
                  </a>
                </div>
              </Reveal>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}>
              <LevelBook />
            </motion.div>
          </div>
        </section>

        {/* The check that closes a level book, and these books. */}
        <section id="check" data-reading="The check" className="on-ink bg-[#141414] text-white">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-20 sm:py-28 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-12 lg:gap-20">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(40px,5.4vw,76px)] leading-[.95]">
                A level book won&apos;t close until two sums agree.
                <span className="block text-[#F2C300]">Neither will your books.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="text-[18px] leading-[1.55] text-[#D5D7DB] max-w-[48ch]">
                A surveyor checks a page of readings with one sum before trusting any height on it. Sentryfi does the
                same to every entry, underneath the plain words, so the figures you look at on your phone are ones an
                accountant can sign.
              </p>
              <ul className="mt-9 border-t border-[#3A3B40]">
                {[
                  ["Every entry balances", "or the database refuses it. Not the screen: the database."],
                  ["Nothing is deleted", "A correction is a new entry that reverses the old one, with a reason."],
                  ["A changed record shows", "Each entry is sealed to the one before it, so tampering breaks the chain."],
                ].map(([a, b]) => (
                  <li key={a} className="py-5 border-b border-[#3A3B40] grid grid-cols-[22px_minmax(0,1fr)] gap-3">
                    <Check size={18} strokeWidth={2.6} className="mt-1 text-[#F2C300]" aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-white">{a}</span>
                      <span className="text-[#BFC2C8]"> &mdash; {b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* The app, one reading at a time. */}
        <section id="screens" data-reading="The app" className="border-b-2 border-[#141414]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] pt-20 sm:pt-28 pb-16">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(40px,5.4vw,76px)] leading-[.95] max-w-[16ch]">
                On the phone on site. At the desk in the office.
              </h2>
              <p className="mt-5 text-[18px] leading-[1.55] text-[#3D4046] max-w-[56ch]">
                The same books, in plain words for the owner and in an accountant&apos;s words for the accountant. These
                are the real screens, showing a demo company&apos;s made-up figures.
              </p>
            </Reveal>
            <div className="mt-14">
              <Readings />
            </div>
          </div>
        </section>

        {/* What has to be local. */}
        <section id="maldives" data-reading="The Maldives" className="border-b-2 border-[#141414]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-20 sm:py-28 grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-12 lg:gap-20">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(40px,5.4vw,76px)] leading-[.95]">
                Zoho, QuickBooks and Xero don&apos;t file a Maldivian return.
              </h2>
              <p className="mt-6 text-[18px] leading-[1.55] text-[#3D4046] max-w-[42ch]">
                They are good products built for somewhere else. This is the part that has to be local, and it is not a
                setting you switch on.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <dl className="border-t-2 border-[#141414]">
                {LOCAL.map(([t, d]) => (
                  <div key={t} className="group grid sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-x-8 gap-y-1 py-5 border-b border-[#E6E7EA] hover:bg-[#F7F7F5] transition-colors sm:px-3 sm:-mx-3">
                    <dt className="font-semibold text-[17px] leading-[1.35]">{t}</dt>
                    <dd className="text-[15.5px] leading-[1.5] text-[#4A4D54]">{d}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* The deadline, as a clock. */}
        <section id="filing" data-reading="The 28th" className="border-b-2 border-[#141414]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-20 sm:py-28">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(40px,5.4vw,76px)] leading-[.95] max-w-[18ch]">
                Built as you go. Filed by the 28th.
              </h2>
              <p className="mt-5 text-[18px] leading-[1.55] text-[#3D4046] max-w-[56ch]">
                Every bill goes into the return the day it is booked, not the night before it is due.
              </p>
            </Reveal>
            <div className="mt-12">
              <FilingStrip />
            </div>
          </div>
        </section>

        {/* Who sees what. */}
        <section id="who" data-reading="Who sees what" className="border-b-2 border-[#141414]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-20 sm:py-28 grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-12 lg:gap-20">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(40px,5.4vw,76px)] leading-[.95]">
                Everyone sees only their own job.
              </h2>
              <p className="mt-6 text-[18px] leading-[1.55] text-[#3D4046] max-w-[42ch]">
                Enforced by the database, not hidden by the screen. The person photographing a bill on a jetty cannot
                reach the books by any route.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <table className="w-full border-t-2 border-[#141414] text-left">
                <caption className="sr-only">Roles and what each can see and do</caption>
                <tbody>
                  {ROLES.map(([role, what]) => (
                    <tr key={role} className="border-b border-[#E6E7EA]">
                      <th scope="row" className="py-4 pr-6 align-top font-display text-[16px] font-bold uppercase tracking-[.08em] whitespace-nowrap w-[1%]">
                        {role}
                      </th>
                      <td className="py-4 text-[15.5px] leading-[1.5] text-[#4A4D54]">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* The page closes the way a level book does: on its check. */}
        <section className="on-ink bg-[#141414] text-white" data-reading="Start">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] min-h-16 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="font-display text-[14px] font-bold uppercase tracking-[.12em]">Check</span>
            <span className="text-[14px] sm:text-[15px] tabular-nums">
              What your books say <span className="text-[#A9ADB6]">=</span> what your bank says
              <span className="ml-3 inline-flex items-center gap-1 font-display text-[14px] font-bold uppercase tracking-[.12em] text-[#F2C300]">
                <Check size={16} strokeWidth={3} aria-hidden="true" /> Balanced
              </span>
            </span>
          </div>
        </section>
        {/* The close: the one yellow field on this screen. */}
        <section className="bg-[#F2C300]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-20 sm:py-28 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-10 items-end">
            <Reveal>
              <h2 className="font-display font-bold uppercase text-[clamp(52px,8vw,96px)] leading-[.9]">
                Snap it on site.
                <br />
                File it by the 28th.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="group h-14 px-6 inline-flex items-center gap-3 bg-[#141414] text-[#F2C300] font-display text-[16px] font-bold uppercase tracking-[.1em] hover:bg-[#2A2A2A] transition-colors"
                >
                  Create an account
                  <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="h-14 px-6 inline-flex items-center border-2 border-[#141414] font-display text-[16px] font-bold uppercase tracking-[.1em] hover:bg-[#141414] hover:text-[#F2C300] transition-colors"
                >
                  Log in
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="lg:pl-[18px] bg-white">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-[46px] py-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <AILogo size={24} />
            <span className="text-[16px] font-semibold tracking-[-.02em]">Sentryfi</span>
          </div>
          <p className="text-[14px] text-[#5F646C]">Made in Male&apos;, Maldives</p>
          <Link to="/trust" className="text-[14px] text-[#0F4C5C] underline underline-offset-4 hover:text-[#141414]">
            What happens to your books
          </Link>
          <a href="mailto:support@sentryfi.app" className="text-[14px] text-[#0F4C5C] underline underline-offset-4 hover:text-[#141414]">
            support@sentryfi.app
          </a>
          <p className="sm:ml-auto text-[13px] text-[#5F646C]">Bills and figures on this page are illustrative.</p>
        </div>
      </footer>
    </div>
  );
}

