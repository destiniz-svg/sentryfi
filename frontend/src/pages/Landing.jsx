import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Camera,
  CheckCheck,
  FileText,
  Landmark,
  Layers,
  Lock,
  Receipt,
  ShieldCheck,
  Signal,
  Wallet,
} from "lucide-react";
import AILogo from "@/components/layout/AILogo";
import Reveal, { Stagger, StaggerItem } from "@/components/marketing/Reveal";
import PhoneMock from "@/components/marketing/PhoneMock";

/**
 * Everything on this page comes from PRODUCT.md. There are no testimonials,
 * no customer counts and no benchmarks, because the product record says none
 * exist yet and forbids inventing them. Where a page like this would normally
 * carry social proof, this one carries the constraints the product actually
 * has to survive, which are real and, on a building site in the Maldives,
 * more convincing than a quote.
 */

const wash = (a, b) =>
  `radial-gradient(120% 120% at 12% 8%, ${a} 0%, rgba(255,255,255,0) 58%), radial-gradient(90% 90% at 88% 92%, ${b} 0%, rgba(255,255,255,0) 60%)`;

const SAND = "rgba(242,195,0,.16)";
const SKY = "rgba(96,125,160,.14)";
const CLAY = "rgba(198,43,32,.08)";
const REEF = "rgba(22,122,65,.10)";

const jobs = [
  {
    icon: Receipt,
    title: "A backlog of bills nobody has time to enter",
    body:
      "Photograph it the moment it is handed to you. Sentryfi reads it, shows you what it read, and you confirm. Three taps, then it is in the books and the paper can go in a drawer.",
    wash: wash(SAND, SKY),
  },
  {
    icon: Wallet,
    title: "Cash, bank, and who funded what",
    body:
      "Several petty cash boxes, accounts in rufiyaa and dollars, directors putting money in, and transfers between three companies. Every movement lands against a source, so the question answers itself.",
    wash: wash(SKY, REEF),
  },
  {
    icon: Landmark,
    title: "GST, on the 28th, every month",
    body:
      "The return is assembled as you go, not the night before. The figures, both Excel statements in MIRA's fixed template, and every receipt image behind them, in one pack you key into MIRAconnect.",
    wash: wash(REEF, CLAY),
  },
];

const steps = [
  {
    n: "01",
    icon: Camera,
    title: "Snap it",
    body:
      "On site, one hand, in bright sun. The camera opens on launch. No signal is fine: bills wait on the phone and go when you are back.",
  },
  {
    n: "02",
    icon: CheckCheck,
    title: "Check it",
    body:
      "The review only asks about what it doubts. A clean bill confirms in two taps. An unclear amount, a possible duplicate, a supplier it has never seen: those it puts in front of you.",
  },
  {
    n: "03",
    icon: FileText,
    title: "Done",
    body:
      "A balanced double-entry journal posts behind the words. You get the amount, the account, a ten-second undo, and the filename the receipt now lives under.",
  },
];

const nativeBits = [
  {
    title: "GST the way MIRA asks for it",
    body:
      "Return figures in MIRA format, and the Input and Output Tax Statements as Excel in the fixed template, tab named exactly as the portal expects.",
  },
  {
    title: "Both ways of quoting tax",
    body:
      "Some suppliers add 8 percent on top. Others quote a figure that already includes it. Many are not registered and charge none. Sentryfi records which, rather than assuming one.",
  },
  {
    title: "Rufiyaa and dollars, side by side",
    body:
      "Accounts in both, with the rate that was used stored against the entry rather than recalculated later.",
  },
  {
    title: "Three companies, one group",
    body:
      "Altura, Steva Hotels and Steva Enterprises keep separate books, and a transfer between them mirrors on both sides instead of being typed twice.",
  },
  {
    title: "Built for a construction job",
    body:
      "Cost codes for materials, labour, subcontractors, equipment, fuel, boat freight and site overheads. Budget against actual, per project.",
  },
  {
    title: "An archive an auditor can read",
    body:
      "Every receipt image filed to OneDrive under the supplier, the amount and the bill number, so the folder works even without the app.",
  },
];

const survives = [
  {
    icon: Signal,
    kicker: "No signal",
    body:
      "Site work happens where the bars run out. Capture is offline first: photos queue on the phone and sync when it finds a connection.",
  },
  {
    icon: Lock,
    kicker: "Snap-only hands",
    body:
      "Site staff photograph bills and see nothing else. A staff member holding petty cash sees one number, what is left in their own box, and no balance beyond it.",
  },
  {
    icon: Layers,
    kicker: "Paper that argues with itself",
    body:
      "A supplier who spells their own name two ways on one invoice. A quotation that looks like a bill. An invoice addressed to one company and paid by another. All of these are real, and all of them are handled.",
  },
  {
    icon: ShieldCheck,
    kicker: "Being wrong later",
    body:
      "Nothing is deleted and nothing is edited after posting. A correction is a new entry that reverses the old one and carries a reason. The journal is hash-chained, so tampering shows.",
  },
];

const roles = [
  ["Owner", "Phone and desk. Everything, everywhere."],
  ["Site staff", "Snap a bill. Tag the project. That is all."],
  ["Cash holder", "Spend from the box, with a bill or without. Count it when asked."],
  ["Directors", "See what they put in, and what the project has spent. They never post."],
  ["Accountant", "Journals, trial balance, the filing pack. Adjust and void with a reason."],
  ["Office admin", "Import the bank, reconcile, chase what is unpaid."],
];

export default function Landing() {
  const still = useReducedMotion();

  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "light");
    return () => {
      if (prev) document.documentElement.setAttribute("data-theme", prev);
      else document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  return (
    <div className="min-h-dvh bg-white text-[#141414] font-sans">
      {/* ---------------------------------------------------------- nav */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/85 border-b border-[#EDEEF0]">
        <div className="mx-auto max-w-[1180px] px-6 h-[68px] flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Sentryfi home">
            <AILogo size={30} />
            <span className="text-[19px] font-semibold tracking-[-.02em]">Sentryfi</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[15px] text-[#6B7078]">
            <a href="#how" className="hover:text-[#141414] transition-colors">How it works</a>
            <a href="#maldives" className="hover:text-[#141414] transition-colors">Maldives</a>
            <a href="#real" className="hover:text-[#141414] transition-colors">What it survives</a>
            <a href="#who" className="hover:text-[#141414] transition-colors">Who it is for</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/login"
              className="h-10 px-4 inline-flex items-center rounded-full text-[15px] font-semibold text-[#6B7078] hover:text-[#141414] transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="h-10 px-5 inline-flex items-center rounded-full bg-[#F2C300] text-[#141414] text-[15px] font-semibold hover:brightness-[.97] transition"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ background: wash(SAND, SKY) }}
        />
        <div className="relative mx-auto max-w-[1180px] px-6 pt-16 pb-14 grid lg:grid-cols-[1.05fr_auto] gap-14 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-[#E6E7EA] text-[12px] font-semibold tracking-[.1em] uppercase text-[#806400]">
                Maldives native
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-[clamp(44px,6.4vw,76px)] leading-[0.98] font-bold tracking-[-.035em]">
                Snap it.<br />Record it.<br />
                <span
                  style={{
                    background: "linear-gradient(96deg,#141414 0%,#806400 46%,#F2C300 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Done.
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 text-[19px] leading-[1.5] text-[#44474E] max-w-[52ch]">
                A business finance app for Maldivian contractors. Photograph a bill, check what was
                read, confirm. Behind the plain words a correct double-entry ledger keeps the books
                right, and nobody has to learn the word debit.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="h-12 px-6 inline-flex items-center gap-2 rounded-full bg-[#F2C300] text-[#141414] text-[16px] font-semibold hover:brightness-[.97] transition"
                >
                  Start recording bills
                </Link>
                <a
                  href="/design/phone.html"
                  className="h-12 px-6 inline-flex items-center gap-2 rounded-full border border-[#141414] text-[16px] font-semibold hover:bg-[#141414] hover:text-white transition-colors"
                >
                  See every screen
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-5 text-[14px] text-[#6B7078]">
                Being built in the open. Nothing here records real money yet.
              </p>
            </Reveal>
          </div>

          <motion.div
            initial={still ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            className="justify-self-center lg:justify-self-end pb-8"
          >
            <PhoneMock />
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------- hardest jobs */}
      <section className="mx-auto max-w-[1180px] px-6 py-20">
        <Reveal>
          <h2 className="text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-.03em] max-w-[18ch]">
            Three jobs that eat a contractor&apos;s week
          </h2>
          <p className="mt-3 text-[17px] text-[#6B7078] max-w-[58ch]">
            Sentryfi was built around these, in that order, for one construction company before
            anyone else.
          </p>
        </Reveal>
        <Stagger className="mt-10 grid md:grid-cols-3 gap-5">
          {jobs.map((j) => (
            <StaggerItem key={j.title}>
              <article
                className="h-full rounded-[20px] border border-[#EDEEF0] p-7 bg-white"
                style={{ background: j.wash, backgroundColor: "#fff" }}
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white border border-[#E6E7EA] text-[#141414]">
                  <j.icon size={19} strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-[21px] font-semibold leading-[1.2] tracking-[-.01em]">
                  {j.title}
                </h3>
                <p className="mt-3 text-[15.5px] leading-[1.55] text-[#44474E]">{j.body}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section id="how" className="border-y border-[#EDEEF0] bg-[#FAFAFB]">
        <div className="mx-auto max-w-[1180px] px-6 py-20">
          <Reveal>
            <span className="text-[12px] font-semibold tracking-[.16em] uppercase text-[#806400]">
              How it works
            </span>
            <h2 className="mt-3 text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-.03em]">
              Three taps or fewer. Every time.
            </h2>
          </Reveal>
          <Stagger className="mt-11 grid md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <StaggerItem key={s.n}>
                <div className="h-full rounded-[20px] bg-white border border-[#EDEEF0] p-7">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#141414] text-[#F2C300]">
                      <s.icon size={19} strokeWidth={1.9} />
                    </span>
                    <span className="tabular-nums text-[13px] font-semibold tracking-[.14em] text-[#9AA0A8]">
                      {s.n}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-.01em]">{s.title}</h3>
                  <p className="mt-2.5 text-[15.5px] leading-[1.55] text-[#44474E]">{s.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ------------------------------------------------------- maldives */}
      <section id="maldives" className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-12">
          <Reveal>
            <span className="text-[12px] font-semibold tracking-[.16em] uppercase text-[#806400]">
              Why not Zoho, QuickBooks or Xero
            </span>
            <h2 className="mt-3 text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-.03em]">
              None of them file a Maldivian return
            </h2>
            <p className="mt-4 text-[17px] leading-[1.55] text-[#44474E]">
              They are good products built for somewhere else. What follows is the part that has to
              be local, and it is not a setting you can switch on.
            </p>
            <p className="mt-4 text-[15px] leading-[1.55] text-[#6B7078]">
              Rates, periods, forms and industry profiles are stored as data keyed by effective
              date, so when MIRA changes something it is a configuration change rather than a
              rewrite.
            </p>
          </Reveal>
          <Stagger className="grid sm:grid-cols-2 gap-x-8 gap-y-7">
            {nativeBits.map((b) => (
              <StaggerItem key={b.title}>
                <h3 className="text-[16.5px] font-semibold tracking-[-.01em]">{b.title}</h3>
                <p className="mt-1.5 text-[15px] leading-[1.55] text-[#6B7078]">{b.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ----------------------------------------- what it has to survive */}
      <section id="real" className="border-y border-[#EDEEF0]">
        <div
          className="mx-auto max-w-[1180px] px-6 py-20"
          style={{ background: wash(SKY, SAND), backgroundColor: "transparent" }}
        >
          <Reveal>
            <span className="text-[12px] font-semibold tracking-[.16em] uppercase text-[#806400]">
              What it has to survive
            </span>
            <h2 className="mt-3 text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-.03em] max-w-[20ch]">
              The conditions, not the pitch
            </h2>
            <p className="mt-3 text-[17px] text-[#6B7078] max-w-[62ch]">
              Sentryfi has no customers yet, so there are no quotes on this page. These are the real
              conditions it was designed against, taken from the work itself.
            </p>
          </Reveal>
          <Stagger className="mt-11 grid md:grid-cols-2 gap-5">
            {survives.map((s) => (
              <StaggerItem key={s.kicker}>
                <article className="h-full rounded-[20px] bg-white border border-[#EDEEF0] p-7">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF3C2] text-[#806400]">
                      <s.icon size={18} strokeWidth={1.9} />
                    </span>
                    <h3 className="text-[18px] font-semibold tracking-[-.01em]">{s.kicker}</h3>
                  </div>
                  <p className="mt-3.5 text-[15.5px] leading-[1.6] text-[#44474E]">{s.body}</p>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ------------------------------------------------------- who */}
      <section id="who" className="mx-auto max-w-[1180px] px-6 py-20">
        <Reveal>
          <h2 className="text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-.03em]">
            Everyone sees only their own job
          </h2>
          <p className="mt-3 text-[17px] text-[#6B7078] max-w-[60ch]">
            Six roles, enforced in the database rather than hidden in the interface. The person
            snapping a bill on a jetty cannot reach the books, by any route.
          </p>
        </Reveal>
        <Stagger className="mt-9 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#EDEEF0] rounded-[20px] overflow-hidden border border-[#EDEEF0]">
          {roles.map(([name, what]) => (
            <StaggerItem key={name} className="bg-white p-7">
              <h3 className="text-[17px] font-semibold tracking-[-.01em]">{name}</h3>
              <p className="mt-1.5 text-[15px] leading-[1.55] text-[#6B7078]">{what}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* -------------------------------------------------------- close */}
      <section className="px-6 pb-20">
        <Reveal>
          <div
            className="mx-auto max-w-[1180px] rounded-[26px] border border-[#EDEEF0] px-6 py-20 text-center"
            style={{ background: wash(SAND, SKY), backgroundColor: "#fff" }}
          >
            <span className="text-[12px] font-semibold tracking-[.18em] uppercase text-[#806400]">
              Get started
            </span>
            <h2 className="mt-4 text-[clamp(34px,5vw,60px)] leading-[1.02] font-bold tracking-[-.035em]">
              Snap it on site.
              <br />
              <span
                style={{
                  background: "linear-gradient(96deg,#141414 0%,#806400 52%,#F2C300 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                File it by the 28th.
              </span>
            </h2>
            <p className="mt-5 text-[17px] text-[#44474E] max-w-[48ch] mx-auto">
              Built for Altura Pvt Ltd first, and for every Maldivian business that keeps its books
              in a shoebox and a spreadsheet.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="h-12 px-7 inline-flex items-center rounded-full bg-[#F2C300] text-[#141414] text-[16px] font-semibold hover:brightness-[.97] transition"
              >
                Create an account
              </Link>
              <a
                href="/design/desktop.html"
                className="h-12 px-7 inline-flex items-center rounded-full border border-[#141414] text-[16px] font-semibold hover:bg-[#141414] hover:text-white transition-colors"
              >
                Look at the desk app
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------- footer */}
      <footer className="border-t border-[#EDEEF0]">
        <div className="mx-auto max-w-[1180px] px-6 py-10 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <AILogo size={26} />
            <span className="text-[16px] font-semibold tracking-[-.02em]">Sentryfi</span>
          </div>
          <p className="text-[14px] text-[#6B7078]">
            Altura Pvt Ltd &middot; Male&apos;, Maldives
          </p>
          <p className="ml-auto text-[13px] text-[#9AA0A8]">
            Figures shown on this page are illustrative.
          </p>
        </div>
      </footer>
    </div>
  );
}
