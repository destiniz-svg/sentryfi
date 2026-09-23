import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, ChevronDown, ChevronRight, Eye, History, Lightbulb, ListChecks, Loader2, MessageSquareText, RefreshCw, Square, TrendingUp, Volume2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The CFO: the morning brief, the four figures kept apart, what it noticed,
 * how the business stands, and what it has learned about the business. Every
 * figure opens onto what makes it up; every market note says its source and
 * date. It advises and never posts.
 *
 * Drawn in the refined register (DESIGN.md, "The phone, refined"): one black
 * card for cash and the next thirty days, white cards on a soft lift, icons in
 * pale circles, and explanations folded until asked for.
 */

const TOPICS = ["What we sell", "Who we sell to", "Our seasons", "What worries us", "What we are planning"];
const CARD = "rounded-[24px] bg-[var(--surface)] lift p-5 sm:p-6";

function speak(lines, onEnd) {
  const s = window.speechSynthesis;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(lines.join(". ").replace(/MVR ([\d,]+)\.(\d\d)/g, (_, a, b) => `${a} rufiyaa${b !== "00" ? ` ${b} laari` : ""}`));
  u.rate = 0.98;
  u.onend = onEnd;
  s.speak(u);
  return true;
}

export default function Cfo() {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [talking, setTalking] = useState(false);
  const [making, setMaking] = useState(false);
  const [parts, setParts] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["cfo", companyId], queryFn: () => apiClient.get("/cfo").then((r) => r.data), enabled: Boolean(companyId) });

  if (isLoading || !data) return <Skeleton className="h-80 rounded-[24px]" />;
  const b = data.brief;
  const fig = data.figures;
  const p = data.profile;
  const text = [
    b.headline,
    ...(b.written?.summary ? [b.written.summary] : []),
    "Yesterday. " + b.changed.lines.join(" "),
    "Today. " + b.todo.map((t) => t.text).join(" "),
    ...(b.noticed.length ? ["Noticed. " + b.noticed.map((n) => `${n.title}. ${n.detail}`).join(" ")] : []),
    b.market ? `The market. ${b.market.text}` : b.marketQuiet,
    "Learned. " + b.learned,
  ];

  return (
    <div className="max-w-[1100px]">
      <PageHeader
        title="The CFO"
        description={`The morning brief for ${formatDate(b.forDate)}. Every figure opens onto what makes it up.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (talking) {
                  window.speechSynthesis?.cancel();
                  setTalking(false);
                } else if (speak(text, () => setTalking(false))) setTalking(true);
                else toast.error("Not on this device", "This browser cannot read aloud.");
              }}
            >
              {talking ? <Square size={14} /> : <Volume2 size={15} />} {talking ? "Stop" : "Read it to me"}
            </Button>
            <Button
              variant="ghost"
              disabled={making}
              onClick={async () => {
                setMaking(true);
                await apiClient.post("/cfo/brief");
                await qc.invalidateQueries({ queryKey: ["cfo", companyId] });
                setMaking(false);
              }}
            >
              {making ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Make it again
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start" data-testid="brief">
        {/* ---- the one black card: cash, and the next thirty days */}
        <section className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <button type="button" disabled className="text-left disabled:cursor-default" data-testid="cfo-cash-now">
              <div className="text-[14px] opacity-70">Cash now</div>
              <div className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular whitespace-nowrap">
                <Money amount={fig.cash} className="text-inherit" />
              </div>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[440px]">
              {[
                ["Due in, 30 days", "In, 30 days", fig.expectedIn, fig.inParts, "cfo-due-in"],
                ["Due out, 30 days", "Out, 30 days", fig.committedOut, fig.outParts, "cfo-due-out"],
                ["Leaves", "Leaves", fig.forecast, null, "cfo-leaves"],
              ].map(([label, short, v, list, id]) => (
                <button
                  key={label}
                  type="button"
                  disabled={!list}
                  onClick={() => setParts({ label, list })}
                  data-testid={id}
                  className="text-left rounded-2xl bg-white/[.07] px-4 sm:px-3 py-3 sm:py-2.5 enabled:hover:bg-white/[.12] disabled:cursor-default min-w-0 flex sm:block items-baseline justify-between gap-3"
                >
                  <div className="text-[13px] sm:text-[12px] opacity-65 truncate">{short}</div>
                  <div className={cn("sm:mt-1 text-[16px] sm:text-[17px] font-semibold tabular whitespace-nowrap", id === "cfo-leaves" && (fig.short ? "text-[#ff9d8f]" : "text-[var(--accent)]"))}>
                    <Money amount={v} className="text-inherit" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-5 text-[14px] leading-snug opacity-75" data-testid="brief-headline">
            {b.headline}
          </p>
        </section>

        {b.written && (
          <section className={cn(CARD, "lg:col-span-2")}>
            <Heading icon={MessageSquareText} title="What the CFO says" note="Written by Gemini from the figures on this page, and nothing else." />
            <p className="text-[15px] leading-relaxed mt-3">{b.written.summary}</p>
            {b.written.advice?.length > 0 && (
              <ul className="mt-3 space-y-2">
                {b.written.advice.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink)]" aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ---- the morning, in five short parts */}
        <section className={CARD} aria-label="This morning">
          <ul className="space-y-5">
            <Part icon={History} title="Yesterday">
              {b.changed.lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </Part>
            <Part icon={ListChecks} title="Today">
              <ul className="space-y-1">
                {b.todo.map((t, i) => (
                  <li key={i}>
                    <Link to={t.href} className="inline-flex items-center gap-1 text-[var(--ink)] hover:underline underline-offset-2">
                      {t.text} <ChevronRight size={14} aria-hidden="true" className="text-[var(--ink-muted)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Part>
            <Part icon={Eye} title="Noticed">
              {b.noticed.length === 0 ? (
                <p>Nothing out of the ordinary this week.</p>
              ) : (
                <ul className="space-y-2" data-testid="noticed">
                  {b.noticed.map((n, i) => (
                    <li key={i}>
                      <span className="font-medium text-[var(--ink)]">{n.title}.</span> {n.detail}
                      {n.entries?.length > 0 && <span className="block text-[12px]">Entries {n.entries.join(", ")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Part>
            <Part icon={TrendingUp} title="The market">
              {b.market ? (
                <>
                  <p>{b.market.text}</p>
                  <p className="text-[12px] mt-1">
                    Source: {b.market.source}, {formatDate(b.market.on)}.
                  </p>
                </>
              ) : (
                <p>{b.marketQuiet}</p>
              )}
            </Part>
            <Part icon={Lightbulb} title="Learned">
              <p>{b.learned}</p>
            </Part>
          </ul>
        </section>

        <Ask ready={data.written} />
        <Health checks={data.health} />
        <Profile p={p} />
        <Settings data={data} />
      </div>

      {parts && (
        <Modal open onClose={() => setParts(null)} title={parts.label} description="What makes up this figure.">
          {parts.list.length === 0 ? (
            <p className="text-[14px] text-[var(--ink-muted)]">Nothing.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-[14px]" data-testid="parts">
              {parts.list.map((x, i) => (
                <li key={i} className="py-2 flex items-baseline gap-3">
                  <span className="flex-1 min-w-0">
                    {x.label}
                    {x.due && <span className="block text-[12px] text-[var(--ink-muted)]">{x.due < fig.asOf ? `was due ${formatDate(x.due)}` : `due ${formatDate(x.due)}`}</span>}
                  </span>
                  <Money amount={x.amount} />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

/** An icon in a pale circle: the one icon treatment on these cards. */
function Dot({ icon: Icon }) {
  return (
    <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink)]" aria-hidden="true">
      <Icon size={17} strokeWidth={1.75} />
    </span>
  );
}

function Heading({ icon, title, note }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <Dot icon={icon} />}
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] leading-9">{title}</h2>
        {note && <p className="text-[13px] text-[var(--ink-muted)] -mt-1 leading-snug">{note}</p>}
      </div>
    </div>
  );
}

function Part({ icon, title, children }) {
  return (
    <li className="flex gap-3">
      <Dot icon={icon} />
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <div className="text-[14px] text-[var(--ink-muted)] leading-snug mt-1">{children}</div>
      </div>
    </li>
  );
}

/** A share of the whole: the name, a thin bar, the figure. */
function Rows({ list, empty }) {
  const [all, setAll] = useState(false);
  if (!list.length) return <p className="text-[14px] text-[var(--ink-muted)]">{empty}</p>;
  const shown = all ? list : list.slice(0, 4);
  return (
    <>
      <ul className="space-y-3">
        {shown.map((x, i) => (
          <li key={i}>
            <div className="flex items-baseline gap-3 text-[14px]">
              <span className="flex-1 min-w-0 truncate">{x.name}</span>
              <span className="tabular text-[var(--ink-muted)]">
                <Money amount={x.value} />
              </span>
              {x.share !== null && <span className="w-11 text-right tabular font-medium">{x.share}%</span>}
            </div>
            {x.share !== null && (
              <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--ink)] opacity-80" style={{ width: `${Math.min(100, Math.max(1, Number(x.share)))}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.length > 4 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </>
  );
}

function Profile({ p }) {
  return (
    <section className={cn(CARD, "lg:col-span-2")} data-testid="profile">
      <Heading
        icon={Lightbulb}
        title="What it has learned about the business"
        note={`From ${formatDate(p.from)} to ${formatDate(p.to)}, ${p.monthsOfBooks} ${p.monthsOfBooks === 1 ? "month" : "months"} of books. Revenue MVR ${p.revenue}, costs MVR ${p.costs}${p.grossMarginPercent !== null ? `, ${p.grossMarginPercent}% over cost on what is sold` : ""}.`}
      />
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-7 mt-6">
        {[
          ["What it sells", p.sells, "Nothing sold yet."],
          ["To whom", p.customers, "No customers yet."],
          ["Where the money goes", p.costStructure, "No costs yet."],
          ["From whom", p.suppliers, "No suppliers yet."],
        ].map(([title, list, empty]) => (
          <div key={title}>
            <h3 className="text-[13px] text-[var(--ink-muted)] mb-3">{title}</h3>
            <Rows list={list} empty={empty} />
          </div>
        ))}
      </div>
      <p className="text-[14px] text-[var(--ink-muted)] mt-6">
        {p.busiest ? `Busiest month ${p.busiest.month}, MVR ${p.busiest.revenue}. ` : ""}
        {p.quietest ? `Quietest ${p.quietest.month}, MVR ${p.quietest.revenue}. ` : ""}
        {p.financing.loans ? `${p.financing.loans} ${p.financing.loans === 1 ? "loan" : "loans"}, MVR ${p.financing.owed} owed; borrowing cost MVR ${p.financing.interestLastYear} last year.` : "No borrowing."}
      </p>
      <Notes notes={p.notes} />
    </section>
  );
}

function Notes({ notes }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [note, setNote] = useState("");
  if (!can("record") && !can("manage_settings")) return null;
  return (
    <div className="mt-6 pt-5 border-t border-[var(--border)]">
      <h3 className="text-[15px] font-semibold">What you have told it</h3>
      {notes.length > 0 && (
        <ul className="text-[14px] mt-2 space-y-1">
          {notes.map((n) => (
            <li key={n.topic}>
              <span className="text-[var(--ink-muted)]">{n.topic}:</span> {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="About">
        {TOPICS.map((t) => (
          <button key={t} type="button" onClick={() => setTopic(t)} aria-pressed={topic === t} className={cn("h-9 px-3.5 rounded-full text-[13px] font-medium transition-colors", topic === t ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex items-center gap-2 rounded-full bg-[var(--surface-2)] pl-5 pr-1.5 h-12"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          await apiClient.put("/cfo/notes", { topic, note });
          setNote("");
          qc.invalidateQueries({ queryKey: ["cfo", companyId] });
        }}
      >
        <input aria-label="What it should know" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Correct it, or tell it something the books cannot" className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-[var(--ink-muted)]" />
        <button type="submit" disabled={!note.trim()} className="h-9 px-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[14px] font-medium disabled:opacity-40">
          Tell it
        </button>
      </form>
    </div>
  );
}

function Settings({ data }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [hour, setHour] = useState(String(data.subscription?.send_hour ?? 7));
  const [email, setEmail] = useState(data.subscription ? data.subscription.email : false);
  const [pushIt, setPushIt] = useState(data.subscription ? data.subscription.push !== false : true);
  const pill = (on) => cn("h-10 px-4 rounded-full text-[14px] font-medium inline-flex items-center gap-1.5 transition-colors", on ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]");
  return (
    <section className={cn(CARD, "lg:col-span-2")}>
      <Heading icon={History} title="The brief each morning" note="Sent at the hour you choose, Maldives time: to the devices you turned notifications on for, and by email if you like." />
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button type="button" id="cfo-push" aria-pressed={pushIt} onClick={() => setPushIt(!pushIt)} className={pill(pushIt)}>
          Notify me
        </button>
        <button type="button" id="cfo-email" aria-pressed={email} onClick={() => setEmail(!email)} className={pill(email)}>
          Email it to me
        </button>
        <label className="h-10 pl-4 pr-2 rounded-full bg-[var(--surface-2)] text-[14px] inline-flex items-center gap-1 text-[var(--ink-muted)]">
          at
          <select id="cfo-hour" aria-label="Hour" value={hour} onChange={(e) => setHour(e.target.value)} className="bg-transparent outline-none text-[var(--ink)] font-medium cursor-pointer">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={async () => {
            await apiClient.put("/cfo/subscription", { sendHour: Number(hour), email, push: pushIt });
            qc.invalidateQueries({ queryKey: ["cfo", companyId] });
            toast.success(email || pushIt ? `Sent at ${String(hour).padStart(2, "0")}:00` : "Not sent", email || pushIt ? "Starting tomorrow morning." : "It is still here every morning.");
          }}
        >
          Save
        </Button>
      </div>
      {!data.written && <p className="text-[13px] text-[var(--ink-muted)] mt-4">A written summary, advice and answers to questions come from Gemini once its key is set on the server. Everything else works without it.</p>}
    </section>
  );
}

const SUGGESTED = ["Who owes us the most, and since when?", "Can we afford to pay all bills due this month?", "Why did costs go up last month?", "What should I worry about this week?"];

function Ask({ ready }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState([]);
  const toast = useToast();
  const go = async (q) => {
    const text = (q ?? question).trim();
    if (text.length < 3 || asking) return;
    setAsking(true);
    try {
      const r = await apiClient.post("/cfo/ask", { question: text });
      setAnswers((a) => [{ question: text, ...r.data }, ...a]);
      setQuestion("");
    } catch (err) {
      toast.error("It could not answer", err.message);
    } finally {
      setAsking(false);
    }
  };
  return (
    <section className={CARD} data-testid="ask">
      <Heading icon={MessageSquareText} title="Ask the CFO" note={ready ? "Answered from your books, with what each figure rests on. It reads; it never changes anything." : "Asking needs a Gemini key on the server."} />
      <form
        className="mt-4 flex items-center gap-2 rounded-full bg-[var(--surface-2)] pl-5 pr-1.5 h-12"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <input aria-label="Your question" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!ready} maxLength={500} placeholder="Ask about cash, customers, costs, GST…" className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-[var(--ink-muted)]" />
        <button type="submit" aria-label="Ask" disabled={!ready || asking || question.trim().length < 3} className="h-9 w-9 shrink-0 rounded-full bg-[var(--ink)] text-[var(--surface)] inline-flex items-center justify-center disabled:opacity-30">
          {asking ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
        </button>
      </form>
      {ready && answers.length === 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTED.map((q) => (
            <button key={q} type="button" disabled={asking} onClick={() => go(q)} className="text-left text-[13px] rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] px-3.5 py-2 hover:text-[var(--ink)]">
              {q}
            </button>
          ))}
        </div>
      )}
      {asking && <p className="text-[13px] text-[var(--ink-muted)] mt-3">Reading the books…</p>}
      <div className="mt-4 space-y-4">
        {answers.map((a, i) => (
          <div key={i} data-testid="answer" className="rounded-2xl bg-[var(--surface-2)] p-4">
            <p className="text-[13px] text-[var(--ink-muted)]">{a.question}</p>
            <p className="text-[15px] mt-1.5 whitespace-pre-line leading-relaxed">{a.answer}</p>
            {a.sources.length > 0 && (
              <ul className="text-[12px] text-[var(--ink-muted)] mt-2 space-y-0.5" data-testid="sources">
                {a.sources.map((s) => (
                  <li key={s.kind + s.ref}>
                    {s.kind === "entry" ? "Entry" : s.kind === "invoice" ? "Invoice" : "Bill"} {s.ref}: {s.label}
                  </li>
                ))}
              </ul>
            )}
            {a.looked.length > 0 && <p className="text-[12px] text-[var(--ink-muted)] mt-1">Looked at: {[...new Set(a.looked.map((l) => LOOKED[l.tool] || l.tool))].join(", ")}.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

const LOOKED = { figures: "the four figures", health: "the checks", profile: "the profile", account_balance: "account balances", documents: "invoices and bills", monthly: "month by month", search_entries: "the journal" };
const VERDICT = { act: ["Act on it", "var(--danger)"], watch: ["Watch", "var(--warning)"], good: ["Good", "var(--success)"] };

/** The checks, grouped by what to do about them; each opens onto its reasons. */
function Health({ checks }) {
  const [open, setOpen] = useState(null);
  const [only, setOnly] = useState("all");
  const count = (v) => checks.filter((c) => c.verdict === v).length;
  const shown = only === "all" ? checks : checks.filter((c) => c.verdict === only);
  return (
    <section className={cn(CARD, "lg:col-span-2")} data-testid="health">
      <Heading icon={ListChecks} title="How the business stands" note="What a CFO checks, from the books as they are this morning. What needs acting on comes first." />
      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Show">
        {[
          ["all", `All ${checks.length}`],
          ["act", `Act on ${count("act")}`],
          ["watch", `Watch ${count("watch")}`],
          ["good", `Good ${count("good")}`],
        ].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setOnly(v)} aria-pressed={only === v} className={cn("h-9 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors", only === v ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
            {v !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: VERDICT[v][1] }} aria-hidden="true" />}
            {l}
          </button>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {shown.map((c) => {
          const isOpen = open === c.name;
          return (
            <li key={c.name}>
              <button type="button" onClick={() => setOpen(isOpen ? null : c.name)} className="w-full text-left flex items-center gap-3 py-3.5" aria-expanded={isOpen}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: VERDICT[c.verdict][1] }} title={VERDICT[c.verdict][0]} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium leading-snug">{c.name}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">{c.area}</span>
                </span>
                <span className="text-[15px] font-semibold tabular text-right">{c.value}</span>
                <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 text-[var(--ink-muted)] transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="pb-4 pl-[22px]">
                  <p className="text-[14px] text-[var(--ink-muted)] leading-snug">{c.explain}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] mt-3 rounded-xl bg-[var(--surface-2)] p-3" data-testid="basis">
                    {Object.entries(c.basis).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-[var(--ink-muted)]">{k.replace(/([A-Z])/g, " $1").replace(/(d+)/, " $1").toLowerCase()}</dt>
                        <dd className="tabular">{v ?? "none"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
