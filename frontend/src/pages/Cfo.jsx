import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Volume2, Square } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";

/**
 * The CFO: the morning brief, the four figures kept apart, what it noticed,
 * and what it has learned about the business. Every figure opens onto what
 * makes it up; every market note says its source and date. It advises and
 * never posts.
 */

const TOPICS = ["What we sell", "Who we sell to", "Our seasons", "What worries us", "What we are planning"];

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

  if (isLoading || !data) return <Skeleton className="h-80 rounded-2xl" />;
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
    <div>
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

      <Card padding="lg" className="mb-4" data-testid="brief">
        <p className={`text-[20px] leading-snug font-semibold ${b.short ? "text-[var(--danger)]" : ""}`} data-testid="brief-headline">
          {b.headline}
        </p>
        {b.written && (
          <div className="mt-3 border-l-2 border-[var(--accent)] pl-3">
            <p className="text-[15px]">{b.written.summary}</p>
            {b.written.advice?.length > 0 && (
              <ul className="list-disc pl-5 mt-1.5 text-[15px] space-y-0.5">
                {b.written.advice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-[var(--ink-muted)] mt-1.5">Written by Claude from the figures on this page, and nothing else.</p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {[
            ["Cash now", fig.cash, null],
            ["Due in, 30 days", fig.expectedIn, fig.inParts],
            ["Due out, 30 days", fig.committedOut, fig.outParts],
            ["Leaves", fig.forecast, null],
          ].map(([label, v, list]) => (
            <button
              key={label}
              type="button"
              disabled={!list}
              onClick={() => setParts({ label, list })}
              data-testid={`cfo-${label.split(",")[0].toLowerCase().replace(/ /g, "-")}`}
              className="text-left rounded-xl border border-[var(--border)] p-3 enabled:hover:border-[var(--ink)] disabled:cursor-default"
            >
              <div className="text-[12px] text-[var(--ink-muted)]">{label}</div>
              <div className={`text-[18px] font-semibold ${label === "Leaves" && fig.short ? "text-[var(--danger)]" : ""}`}>
                <Money amount={v} />
              </div>
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-x-8 gap-y-5 mt-6">
          <Section title="Yesterday">
            {b.changed.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </Section>
          <Section title="Today">
            <ul className="space-y-1">
              {b.todo.map((t, i) => (
                <li key={i}>
                  <Link to={t.href} className="hover:underline">
                    {t.text}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Noticed">
            {b.noticed.length === 0 ? (
              <p className="text-[var(--ink-muted)]">Nothing out of the ordinary this week.</p>
            ) : (
              <ul className="space-y-2" data-testid="noticed">
                {b.noticed.map((n, i) => (
                  <li key={i}>
                    <span className="font-medium">{n.title}.</span> {n.detail}
                    {n.entries?.length > 0 && <span className="block text-[12px] text-[var(--ink-muted)]">Entries {n.entries.join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="The market">
            {b.market ? (
              <>
                <p>{b.market.text}</p>
                <p className="text-[12px] text-[var(--ink-muted)] mt-1">
                  Source: {b.market.source}, {formatDate(b.market.on)}.
                </p>
              </>
            ) : (
              <p className="text-[var(--ink-muted)]">{b.marketQuiet}</p>
            )}
          </Section>
          <Section title="Learned" wide>
            <p>{b.learned}</p>
          </Section>
        </div>
      </Card>

      <div className="grid gap-4">
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

function Section({ title, wide, children }) {
  return (
    <section className={`text-[15px] ${wide ? "md:col-span-2" : ""}`}>
      <h2 className="font-display text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] mb-1.5">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ list, empty }) {
  if (!list.length) return <p className="text-[14px] text-[var(--ink-muted)]">{empty}</p>;
  return (
    <ul className="text-[14px] space-y-1">
      {list.map((x, i) => (
        <li key={i} className="flex items-baseline gap-3">
          <span className="flex-1 min-w-0 truncate">{x.name}</span>
          <Money amount={x.value} className="text-[var(--ink-muted)]" />
          {x.share !== null && <span className="w-12 text-right tabular">{x.share}%</span>}
        </li>
      ))}
    </ul>
  );
}

function Profile({ p }) {
  return (
    <Card padding="lg" data-testid="profile">
      <CardTitle>What it has learned about the business</CardTitle>
      <p className="text-[13px] text-[var(--ink-muted)] mt-1">
        From {formatDate(p.from)} to {formatDate(p.to)}, {p.monthsOfBooks} {p.monthsOfBooks === 1 ? "month" : "months"} of books. Revenue MVR {p.revenue}, costs MVR {p.costs}
        {p.grossMarginPercent !== null ? `, ${p.grossMarginPercent}% over cost on what is sold` : ""}.
      </p>
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-5 mt-4">
        <div>
          <h3 className="text-[13px] font-semibold mb-1">What it sells</h3>
          <Rows list={p.sells} empty="Nothing sold yet." />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold mb-1">To whom</h3>
          <Rows list={p.customers} empty="No customers yet." />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold mb-1">Where the money goes</h3>
          <Rows list={p.costStructure} empty="No costs yet." />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold mb-1">From whom</h3>
          <Rows list={p.suppliers} empty="No suppliers yet." />
        </div>
      </div>
      <p className="text-[14px] mt-4">
        {p.busiest ? `Busiest month ${p.busiest.month}, MVR ${p.busiest.revenue}. ` : ""}
        {p.quietest ? `Quietest ${p.quietest.month}, MVR ${p.quietest.revenue}. ` : ""}
        {p.financing.loans ? `${p.financing.loans} ${p.financing.loans === 1 ? "loan" : "loans"}, MVR ${p.financing.owed} owed; borrowing cost MVR ${p.financing.interestLastYear} last year.` : "No borrowing."}
      </p>
      <Notes notes={p.notes} />
    </Card>
  );
}

function Notes({ notes }) {
  const { companyId, can } = useCompany();
  const qc = useQueryClient();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [note, setNote] = useState("");
  if (!can("record") && !can("manage_settings")) return null;
  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <h3 className="text-[13px] font-semibold">What you have told it</h3>
      {notes.length > 0 && (
        <ul className="text-[14px] mt-1 space-y-1">
          {notes.map((n) => (
            <li key={n.topic}>
              <span className="font-medium">{n.topic}:</span> {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="grid sm:grid-cols-[160px_1fr_auto] gap-2 mt-2">
        <select aria-label="About" value={topic} onChange={(e) => setTopic(e.target.value)} className={FIELD}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input aria-label="What it should know" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Correct it, or tell it something the books cannot" className={FIELD} />
        <Button
          variant="outline"
          disabled={!note.trim()}
          onClick={async () => {
            await apiClient.put("/cfo/notes", { topic, note });
            setNote("");
            qc.invalidateQueries({ queryKey: ["cfo", companyId] });
          }}
        >
          Tell it
        </Button>
      </div>
    </div>
  );
}

function Settings({ data }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [hour, setHour] = useState(String(data.subscription?.send_hour ?? 7));
  const [email, setEmail] = useState(data.subscription ? data.subscription.email : false);
  return (
    <Card padding="lg">
      <CardTitle>The brief by email</CardTitle>
      <p className="text-[13px] text-[var(--ink-muted)] mt-1">Sent to you each morning at the hour you choose, Maldives time.</p>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <label className="flex items-center gap-2 text-[14px]">
          <input id="cfo-email" type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4" /> Email it to me at
        </label>
        <select id="cfo-hour" aria-label="Hour" value={hour} onChange={(e) => setHour(e.target.value)} className={FIELD.replace("w-full", "w-28")}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={async () => {
            await apiClient.put("/cfo/subscription", { sendHour: Number(hour), email });
            qc.invalidateQueries({ queryKey: ["cfo", companyId] });
            toast.success(email ? `Emailed at ${String(hour).padStart(2, "0")}:00` : "Not emailed", email ? "Starting tomorrow morning." : "It is still here every morning.");
          }}
        >
          Save
        </Button>
      </div>
      {!data.written && (
        <p className="text-[13px] text-[var(--ink-muted)] mt-4">
          A written summary and advice from Claude appear at the top of the brief once a Claude API key is set on the server. Everything else works without it.
        </p>
      )}
    </Card>
  );
}
