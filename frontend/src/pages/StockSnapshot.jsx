import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate, today } from "@/lib/utils";

/**
 * The owner's stock snapshot, in the five questions an owner asks and in that
 * order: what came in, what is where, what it is worth, what moved, and what
 * looks wrong. As at any date. Every figure opens onto the moves behind it.
 */

const FIELD =
  "h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";
const daysBefore = (on, n) => new Date(Date.parse(`${on}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const n = (s) => Number(String(s ?? "").replace(/,/g, ""));
// The latest few that came in; the rest on asking, so a busy week does not push everything else down.
const FEW = 5;

const KIND = {
  bought: "Came in", opening: "Already on hand", sold: "Sold", returned: "Came back", counted: "Counted", issued: "Used on a job",
  moved: "Sent", undone: "Bill reversed", landed: "Landing cost", recosted: "Re-costed",
};
const WRONG = { short: "Short", late: "Late", negative: "Below nothing", still: "Not moving", low: "Low", books: "Books", due: "Count due" };

export default function StockSnapshot() {
  const { companyId } = useCompany();
  const nav = useNavigate();
  const [on, setOn] = useState(today());
  const [period, setPeriod] = useState("week");
  const [look, setLook] = useState(null); // { title, q }
  const [allIn, setAllIn] = useState(false);
  const from = period === "week" ? daysBefore(on, 6) : `${on.slice(0, 7)}-01`;

  const { data: s, isLoading } = useQuery({
    queryKey: ["stock", companyId, "snapshot", on, from],
    queryFn: () => apiClient.get("/stock/snapshot", { params: { on, from } }).then((r) => r.data),
    enabled: Boolean(companyId) && Boolean(on),
  });
  const open = (title, q) => setLook({ title, q: { to: on, ...q } });
  const empty = s && n(s.total) === 0 && !s.cameIn.length && !s.moved.sent.length && s.places.every((p) => !p.items.length);
  const span = period === "week" ? "this week" : "this month";

  return (
    <div>
      <PageHeader title="Stock" description="What came in, what is where, what it is worth, what moved, and what looks wrong." />

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">As at</span>
          <input id="snap-on" type="date" value={on} max={today()} onChange={(e) => e.target.value && setOn(e.target.value)} className={FIELD} />
        </label>
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading || !s ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : empty ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">No stock counted yet</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 max-w-prose">
            Once a bill brings in something you keep count of, or you enter what you already had, it shows here: where it is, what it is worth, and what moved.{" "}
            <Link to="/stock" className="underline">
              Go to Items
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-5" data-testid="snapshot">
          {s.wrong.length > 0 && (
            <a href="#looks-wrong" className="flex items-center gap-2.5 min-h-11 rounded-2xl px-4 py-2.5 bg-[var(--warning)]/12 text-[14px] font-medium" data-testid="snapshot-alert">
              <AlertTriangle size={16} className="text-[var(--warning)] shrink-0" aria-hidden="true" />
              {s.wrong.length === 1 ? "One thing looks wrong" : `${s.wrong.length} things look wrong`}
              <ChevronRight size={16} className="ml-auto text-[var(--ink-muted)]" aria-hidden="true" />
            </a>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Section n="1" title="What came in" note={`${span}, to ${formatDate(on)}`}>
              {s.cameIn.length === 0 ? (
                <Quiet>Nothing came in {span}.</Quiet>
              ) : (
                <Rows>
                  {(allIn ? s.cameIn : s.cameIn.slice(0, FEW)).map((r, i) => (
                    <Row
                      key={i}
                      onClick={() => open(`${r.item} that came in`, { item: r.itemId, kinds: "bought,opening", from })}
                      main={`${r.quantity} ${r.unit} ${r.item}`}
                      sub={`${r.from || "No supplier"} · into ${r.placeName} · ${formatDate(r.on)}`}
                      value={r.value}
                    />
                  ))}
                  {!allIn && s.cameIn.length > FEW && (
                    <button type="button" onClick={() => setAllIn(true)} className="w-full min-h-11 px-4 text-left text-[14px] font-medium underline">
                      Show all {s.cameIn.length}
                    </button>
                  )}
                </Rows>
              )}
            </Section>

            <Section n="3" title="What it is worth" note={`at the end of ${formatDate(on)}`}>
              <button type="button" onClick={() => open("Everything held", {})} className="w-full text-left rounded-2xl p-4 bg-[var(--surface-2)] hover:bg-[var(--border)]/40">
                <span className="block text-[13px] text-[var(--ink-muted)]">All stock, at average cost</span>
                <span className="block text-[28px] font-semibold tabular mt-0.5" data-testid="snapshot-total">
                  <Money amount={s.total} />
                </span>
                <span className={`inline-block mt-2 rounded-full px-2.5 py-1 text-[12px] font-semibold ${s.agrees ? "bg-[var(--success)]/15 text-[var(--success)]" : "bg-[var(--danger)]/15 text-[var(--danger)]"}`}>
                  {s.agrees ? "Agrees with the books" : `Does not agree: the books say ${s.books}`}
                </span>
              </button>
            </Section>
          </div>

          <Section n="2" title="What is where" note="each place, with its quantity and value">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.places.map((p) => (
                <Card key={p.id} padding="none" className="overflow-hidden" data-testid="snapshot-place">
                  <button type="button" onClick={() => open(p.name, { place: p.id })} className="w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[var(--border)] hover:bg-[var(--surface-2)] min-h-11">
                    {p.id === "transit" && <Truck size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold break-words">{p.name}</span>
                      {p.accuracy && (
                        <span className="block text-[12px] text-[var(--ink-muted)]" data-testid="place-accuracy">
                          Counts {p.accuracy.percent}% right ({p.accuracy.within} of {p.accuracy.lines} in 90 days)
                        </span>
                      )}
                    </span>
                    <span className="text-[15px] font-semibold tabular">
                      <Money amount={p.value} />
                    </span>
                  </button>
                  {p.items.length === 0 ? (
                    <p className="px-4 py-3 text-[13px] text-[var(--ink-muted)]">Nothing here.</p>
                  ) : (
                    <Rows>
                      {p.items.map((it) => (
                        <Row key={it.itemId} dense onClick={() => open(`${it.name} at ${p.name}`, { item: it.itemId, place: p.id })} main={it.name} sub={`${it.quantity} ${it.unit}`} value={it.value} />
                      ))}
                    </Rows>
                  )}
                </Card>
              ))}
            </div>
          </Section>

          <Section n="4" title="What moved" note={span}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Figure label="Sold, net of returns" onClick={() => open(`Sold ${span}`, { kinds: "sold,returned", from })} value={s.moved.sold.cost} sub={`${s.moved.sold.quantity} out · sold for ${s.moved.sold.sales}`} />
              <Figure label="Used on jobs" onClick={() => open(`Used on jobs ${span}`, { kinds: "issued", from })} value={s.moved.used.cost} sub={`${s.moved.used.quantity} out · ${s.moved.used.count} ${s.moved.used.count === 1 ? "time" : "times"}`} />
            </div>
            {s.moved.sent.length > 0 && (
              <Card padding="none" className="mt-3 overflow-hidden">
                <Rows>
                  {s.moved.sent.map((t) => (
                    <Row
                      key={t.id}
                      onClick={() => open(`${t.item} sent`, { item: t.itemId, kinds: "moved", from: t.on })}
                      main={`${t.quantity} ${t.unit} ${t.item}`}
                      sub={`${t.from} to ${t.to} · sent ${formatDate(t.on)} · ${t.arrived ? (t.received && t.received !== t.quantity ? `${t.received} arrived` : "arrived") : "on the way"}`}
                    />
                  ))}
                </Rows>
              </Card>
            )}
          </Section>

          <Section n="5" title="What looks wrong" id="looks-wrong">
            {s.wrong.length === 0 ? (
              <Quiet>Nothing looks wrong.</Quiet>
            ) : (
              <Card padding="none" className="overflow-hidden" data-testid="snapshot-wrong">
                <Rows>
                  {s.wrong.map((w, i) => (
                    <Row
                      key={i}
                      onClick={w.kind === "books" ? undefined : w.kind === "due" ? () => nav("/counts") : () => open(WRONG[w.kind], { item: w.itemId, place: w.place, ...(w.kind === "short" ? { kinds: "counted", from } : {}) })}
                      tag={WRONG[w.kind]}
                      main={w.detail}
                    />
                  ))}
                </Rows>
              </Card>
            )}
          </Section>
        </div>
      )}

      {look && <Moves title={look.title} q={look.q} onClose={() => setLook(null)} />}
    </div>
  );
}

function Section({ n: num, title, note, id, children }) {
  return (
    <section id={id} aria-labelledby={`snap-${num}`} className="scroll-mt-24">
      <h2 id={`snap-${num}`} className="text-[17px] font-semibold mb-2.5">
        {title}
        {note && <span className="ml-2 text-[13px] font-normal text-[var(--ink-muted)]">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

const Quiet = ({ children }) => <p className="text-[14px] text-[var(--ink-muted)]">{children}</p>;
const Rows = ({ children }) => <div className="divide-y divide-[var(--border)]">{children}</div>;

/** One line that opens its moves: what, a line under it, and a value on the right. */
function Row({ main, sub, value, tag, dense, onClick }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        {tag && <span className="inline-block mb-1 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-semibold px-2 py-0.5">{tag}</span>}
        <span className={`block ${dense ? "text-[14px]" : "text-[15px] font-medium"} break-words`}>{main}</span>
        {sub && <span className="block text-[13px] text-[var(--ink-muted)] break-words">{sub}</span>}
      </span>
      {value !== undefined && (
        <span className="text-[14px] tabular shrink-0">
          <Money amount={value} />
        </span>
      )}
      {onClick && <ChevronRight size={16} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />}
    </>
  );
  const cls = `w-full text-left flex items-center gap-3 px-4 ${dense ? "py-2" : "py-3"} min-h-11`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:bg-[var(--surface-2)]`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Figure({ label, value, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-2xl bg-[var(--surface)] lift p-4 hover:bg-[var(--surface-2)] min-h-11">
      <span className="block text-[13px] text-[var(--ink-muted)]">{label}</span>
      <span className="block text-[20px] font-semibold tabular mt-0.5">
        <Money amount={value} />
      </span>
      <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5">{sub}</span>
    </button>
  );
}

/** The moves behind a figure, newest first, each with its document or entry. */
function Moves({ title, q, onClose }) {
  const { companyId } = useCompany();
  const params = Object.fromEntries(Object.entries(q).filter(([, v]) => v));
  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId, "moves", params],
    queryFn: () => apiClient.get("/stock/moves", { params }).then((r) => r.data.moves),
    enabled: Boolean(companyId),
  });
  return (
    <Modal open onClose={onClose} title={title} description="The moves behind this figure, newest first.">
      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !data?.length ? (
        <p className="text-[14px] text-[var(--ink-muted)]">No moves.</p>
      ) : (
        <div className="divide-y divide-[var(--border)] -mx-1" data-testid="snapshot-moves">
          {data.map((m, i) => (
            <div key={i} className="px-1 py-2.5 flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">
                  {KIND[m.kind] || m.kind} · <span className="tabular">{m.quantity}</span> {m.unit} {m.item}
                </span>
                <span className="block text-[13px] text-[var(--ink-muted)] break-words">
                  {formatDate(m.on)}
                  {m.kind !== "moved" && ` · ${m.place}`}
                  {m.note && ` · ${m.note}`}
                  {(m.document || m.entryNo) && ` · ${[m.document, m.entryNo && `entry ${m.entryNo}`].filter(Boolean).join(", ")}`}
                </span>
              </span>
              {m.value !== null && (
                <span className="text-[14px] tabular shrink-0">
                  <Money amount={m.value} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
