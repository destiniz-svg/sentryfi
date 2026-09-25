import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2, ArrowLeft, ArrowDownLeft, ArrowUpRight, Banknote, FileText, Link2, Mail, MessageCircle, Pencil, Phone, Plus, ReceiptText, Share2, Star, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { AgingBar } from "@/components/ui/AgingBar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ShareDocument, waNumber } from "@/components/documents/Share";
import { Conversation } from "@/components/talk/Conversation";
import { Attachments } from "@/components/documents/Attachments";
import { Modal } from "@/components/ui/Modal";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";
import { formatDate, cn } from "@/lib/utils";

/**
 * One customer or supplier, answering what the owner asks before picking up
 * the phone: what do they owe, how late is it, how do they usually pay, and
 * what happened last. The one black card carries the money; the one yellow
 * button is the next thing to do with them (invoice a customer, pay a
 * supplier). WhatsApp comes first among the ways to reach them, because that
 * is how business is done here.
 */

const n = (s) => Number(String(s || "0").replace(/,/g, ""));
const ICON = { returned: Undo2, invoice: FileText, received: ArrowDownLeft, credit: ReceiptText, order: FileText, bill: ReceiptText, paid: ArrowUpRight, advance: Banknote };

export default function Contact() {
  const { id } = useParams();
  const { companyId, can } = useCompany();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("activity");
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(false);
  const key = ["contacts", companyId, id];
  const { data: c, error } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/contacts/${id}`).then((r) => r.data), enabled: Boolean(companyId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts", companyId] });
  // A record merged into another opens the one it was merged into.
  useEffect(() => {
    if (c?.mergedInto) nav(`/contacts/${c.mergedInto}`, { replace: true });
  }, [c?.mergedInto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-[15px] text-[var(--ink-muted)]">{error.message}</p>;
  if (!c || c.mergedInto) return <Skeleton className="h-[70vh] rounded-3xl" />;

  const d = c.details;
  const wa = waNumber(d.phone);
  const owesYou = n(c.money.receivable) > 0;
  const youOwe = n(c.money.payable) > 0;
  // The card leads with the side of the money that is live; a customer by default.
  const supplierFirst = c.supplier && (!c.customer || params.get("side") === "suppliers" || (!owesYou && youOwe));
  const back = supplierFirst ? "/contacts?side=suppliers" : "/contacts?side=customers";

  async function portalLink() {
    try {
      const r = await apiClient.post("/portal-links", { counterpartyId: c.id });
      const url = `${window.location.origin}/portal/${r.data.token}`;
      if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(`Your account with us: invoices, what is owed, and how to pay.\n${url}`)}`, "_blank", "noopener");
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Their page's link is copied", "Paste it into WhatsApp or an email to them.");
      }
    } catch (ex) {
      toast.error("No link made", ex.message);
    }
  }

  return (
    <div className="max-w-[1080px]">
      <Link
        to={back}
        onClick={(e) => {
          if (window.history.state?.idx > 0) {
            e.preventDefault();
            window.history.back();
          }
        }}
        className="inline-flex items-center gap-1.5 h-11 px-3 -ml-3 rounded-full text-[14px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={16} /> {supplierFirst ? "Suppliers" : "Customers"}
      </Link>

      <header className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-[1.1] font-semibold tracking-tight break-words">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {c.customer && <Badge tone="neutral">Customer</Badge>}
            {c.supplier && <Badge tone="neutral">Supplier</Badge>}
            {d.tags.map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
            {c.archived && <Badge tone="warning">Archived</Badge>}
            {d.tin && <span className="text-[13px] text-[var(--ink-muted)] tabular">TIN {d.tin}</span>}
          </div>
        </div>
        {/* Reach them, then the one thing to do next. */}
        <div className="flex flex-wrap items-center gap-2">
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px] font-medium inline-flex items-center gap-2 hover:bg-[var(--surface-2)]">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          {d.phone && (
            <a href={`tel:${d.phone.replace(/\s/g, "")}`} aria-label={`Call ${c.name}`} title="Call" className="h-11 w-11 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center justify-center hover:bg-[var(--surface-2)]">
              <Phone size={16} />
            </a>
          )}
          {d.email && (
            <a href={`mailto:${d.email}`} aria-label={`Email ${c.name}`} title="Email" className="h-11 w-11 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center justify-center hover:bg-[var(--surface-2)]">
              <Mail size={16} />
            </a>
          )}
          {can("record") && (
            <Button variant="outline" size="icon" onClick={() => setEditing(true)} aria-label={`Change ${c.name}`} title="Change details">
              <Pencil size={15} />
            </Button>
          )}
          {can("record") &&
            (supplierFirst ? (
              <Button variant="accent" onClick={() => nav("/payments")}>
                <Banknote size={16} /> {youOwe ? `Pay ${c.money.payable}` : "Payments"}
              </Button>
            ) : (
              <Button variant="accent" onClick={() => nav(`/invoices/new?customer=${encodeURIComponent(c.name)}`)}>
                <Plus size={16} /> New invoice
              </Button>
            ))}
        </div>
      </header>

      {c.doubts.length > 0 && <Doubts c={c} onDone={refresh} />}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <MoneyCard c={c} supplierFirst={supplierFirst} />
        <aside className="rounded-[20px] bg-[var(--surface)] lift p-5 grid content-start gap-4">
          <Fact label="In the last 12 months">
            {c.customer && (
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="text-[var(--ink-muted)]">Invoiced</span>
                <Money amount={c.money.soldYear} className="font-semibold" />
              </div>
            )}
            {c.customer && (
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="text-[var(--ink-muted)]">Received</span>
                <Money amount={c.money.receivedYear} className="font-semibold" />
              </div>
            )}
            {c.supplier && (
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="text-[var(--ink-muted)]">Billed to you</span>
                <Money amount={c.money.boughtYear} className="font-semibold" />
              </div>
            )}
          </Fact>
          {c.customer && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-9 px-3.5 text-[13px]" onClick={() => setStatement(true)}>
                <Share2 size={14} /> Send a statement
              </Button>
              <Button variant="outline" size="sm" className="h-9 px-3.5 text-[13px]" onClick={portalLink}>
                <Link2 size={14} /> {wa ? "WhatsApp their page" : "Copy their page"}
              </Button>
            </div>
          )}
          {d.notes && <p className="text-[14px] leading-relaxed text-[var(--ink-muted)] border-t border-[var(--border)] pt-4 whitespace-pre-line">{d.notes}</p>}
        </aside>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="activity">What happened</TabsTrigger>
          <TabsTrigger value="open">Open{c.open.invoices.length + c.open.bills.length ? ` · ${c.open.invoices.length + c.open.bills.length}` : ""}</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="people">People{c.people.length ? ` · ${c.people.length}` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="mt-4">
          <Activity items={c.activity} />
        </TabsContent>
        <TabsContent value="open" className="mt-4">
          <Open c={c} />
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Details c={c} />
          <Attachments kind="contact" id={c.id} title="Papers: trade licence, contract, TRN certificate" />
          {can("record") && <Merge c={c} onDone={refresh} />}
        </TabsContent>
        <TabsContent value="people" className="mt-4">
          <People c={c} onDone={refresh} />
        </TabsContent>
      </Tabs>

      <Conversation kind="contact" id={c.id} title="Team notes" className="mt-8" />

      {editing && (
        <ContactForm
          contact={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {statement && <ShareDocument kind="statement" id={c.id} number={`${c.name}: statement`} to={{ name: c.name, phone: d.phone, email: d.email }} onClose={() => setStatement(false)} />}
    </div>
  );
}

/** The money, on the one black card: what is owed, how old, and how they pay. */
function MoneyCard({ c, supplierFirst }) {
  const pays = c.pays;
  const late = pays && pays.terms != null ? pays.days - pays.terms : pays?.late;
  return (
    <section className="rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-6 sm:p-7" aria-label="Money">
      {supplierFirst ? (
        <>
          <div className="text-[14px] opacity-70">You owe them</div>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-[15px] opacity-70">MVR</span>
            <Money amount={c.money.payable} className="text-[30px] leading-none font-semibold tracking-[-.02em]" muted="opacity-50" />
          </div>
          <p className="text-[14px] mt-3 opacity-80">
            {c.open.bills.length === 0 ? "No bill of theirs is waiting to be paid." : `${c.open.bills.length} ${c.open.bills.length === 1 ? "bill" : "bills"} waiting to be paid${c.open.bills[0]?.due ? `, the first due ${formatDate(c.open.bills[0].due)}` : ""}.`}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="text-[14px] opacity-70">Owes you</div>
            {c.money.overLimit && <span className="text-[12px] font-semibold text-[var(--accent)]">Over their credit limit of {c.details.creditLimit}</span>}
          </div>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-[15px] opacity-70">MVR</span>
            <Money amount={c.money.receivable} className="text-[30px] leading-none font-semibold tracking-[-.02em]" muted="opacity-50" />
          </div>
          <p className="text-[14px] mt-3">
            {n(c.money.overdue) > 0 ? (
              <span className="text-[var(--down-on-ink)] font-medium">MVR {c.money.overdue} of it is overdue.</span>
            ) : n(c.money.receivable) > 0 ? (
              <span className="opacity-80">Nothing is overdue.</span>
            ) : (
              <span className="opacity-80">They are all paid up.</span>
            )}
          </p>
          {n(c.money.receivable) > 0 && <AgingBar amounts={c.money.aging} laari={c.money.agingLaari} tone="dark" className="mt-5" />}
          <p className="text-[14px] mt-5 pt-4 border-t border-white/10 opacity-90">
            {pays ? (
              <>
                Pays in about <b className="font-semibold">{pays.days} days</b>
                {pays.terms != null ? ` against ${pays.terms}-day terms` : ""}
                {late > 3 ? <span className="text-[var(--accent)]">, usually {late} days late</span> : late < -3 ? ", usually early" : ", on time"}. From {pays.invoices} paid {pays.invoices === 1 ? "invoice" : "invoices"} this year.
              </>
            ) : (
              <span className="opacity-80">How they pay shows here once an invoice of theirs has been paid in full.</span>
            )}
          </p>
          {c.supplier && n(c.money.payable) > 0 && (
            <p className="text-[14px] mt-2 opacity-80">
              You also owe them <Money amount={c.money.payable} className="font-semibold" muted="opacity-60" />.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Fact({ label, children }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-[var(--ink-muted)] mb-2">{label}</div>
      <div className="grid gap-1.5">{children}</div>
    </div>
  );
}

/** A bank account or tax number a bill disagreed with. Nobody pays until someone who approves has checked it. */
function Doubts({ c, onDone }) {
  const { can } = useCompany();
  const toast = useToast();
  const WHAT = { bank_account: "bank account", tin: "TIN", gst_number: "GST number" };
  return (
    <div className="mt-5 rounded-[20px] overflow-hidden bg-[var(--ink-panel)] text-[var(--on-ink-panel)]" role="alert">
      <div className="h-2" style={{ background: "repeating-linear-gradient(135deg, #F2C300 0 8px, #141414 8px 16px)" }} aria-hidden="true" />
      {c.doubts.map((x) => (
        <div key={x.id} className="px-5 py-4 flex flex-wrap items-center gap-3 border-b border-white/10 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[var(--accent)]">
              A {x.from ? <Link to={x.from} className="underline underline-offset-2">bill</Link> : "document"} shows a different {WHAT[x.field] || x.field}: {x.value}
            </div>
            <div className="text-[13px] opacity-75 mt-0.5">
              {x.field === "bank_account" ? "Call them on a number you already had, and confirm it before anything is paid to it. Changed bank details are how invoice fraud works." : "Check which is right before the next return."}
            </div>
          </div>
          {can("approve") && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await apiClient.post(`/contacts/${c.id}/doubts/${x.id}`, { take: false });
                  toast.success("Kept what was on file");
                  onDone();
                }}
                className="h-10 px-4 rounded-full border border-white/25 text-[14px] font-medium hover:bg-white/10"
              >
                Keep the old one
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Use ${x.value} from now on? Only if you have confirmed it with ${c.name}.`)) return;
                  await apiClient.post(`/contacts/${c.id}/doubts/${x.id}`, { take: true });
                  toast.success("Updated", "Payments use the new one from now on.");
                  onDone();
                }}
                className="h-10 px-4 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[14px] font-semibold"
              >
                I confirmed it: use it
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Activity({ items }) {
  if (!items.length) return <p className="text-[15px] text-[var(--ink-muted)] py-6">Nothing yet. Invoices, bills, payments and orders with them appear here as they happen.</p>;
  let month = "";
  return (
    <ol className="rounded-[20px] bg-[var(--surface)] lift overflow-hidden" data-testid="activity">
      {items.map((a) => {
        const m = a.on ? new Date(a.on).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";
        const head = m !== month ? ((month = m), m) : null;
        const Icon = ICON[a.kind] || FileText;
        const money = a.kind === "received" || a.kind === "paid";
        const body = (
          <>
            <span className={cn("h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center", money ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]")}>
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium truncate">{a.what}</span>
              <span className="block text-[13px] text-[var(--ink-muted)]">{a.on ? formatDate(a.on) : ""}</span>
            </span>
            {a.amount && <Money amount={a.kind === "received" ? a.amount : a.kind === "paid" || a.kind === "returned" ? `−${a.amount}` : a.amount} sign={a.kind === "received"} className={cn("text-[15px] font-semibold", a.kind === "received" && "text-[var(--success)]")} />}
          </>
        );
        return (
          <li key={`${a.kind}-${a.id}`}>
            {head && <div className="px-5 pt-4 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] border-t border-[var(--border)] first:border-0">{head}</div>}
            {a.href ? (
              <Link to={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]/60">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Open({ c }) {
  const rows = [
    ...c.open.invoices.map((i) => ({ key: `i${i.id}`, href: `/documents/invoice/${i.id}`, what: `Invoice ${i.number}`, due: i.due, amount: i.outstanding, over: i.daysOver })),
    ...c.open.bills.map((b) => ({ key: `b${b.id}`, href: `/bills/${b.id}`, what: `Bill ${b.number || ""}`.trim(), due: b.due, amount: b.outstanding, over: 0 })),
  ];
  if (!rows.length) return <p className="text-[15px] text-[var(--ink-muted)] py-6">Nothing is open with them: every invoice is paid and every bill settled.</p>;
  return (
    <ul className="rounded-[20px] bg-[var(--surface)] lift divide-y divide-[var(--border)] overflow-hidden">
      {rows.map((r) => (
        <li key={r.key}>
          <Link to={r.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--surface-2)]/60">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{r.what}</span>
              <span className="block text-[13px] text-[var(--ink-muted)]">{r.due ? `Due ${formatDate(r.due)}` : "No due date"}</span>
            </span>
            {r.over > 0 && <Badge tone="danger">{r.over} days over</Badge>}
            <Money amount={r.amount} className="text-[15px] font-semibold w-28 text-right" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Details({ c }) {
  const d = c.details;
  const rows = [
    ["Phone", d.phone],
    ["Email", d.email],
    ["Address", d.address],
    ["TIN", d.tin],
    ["GST number", d.gstNumber],
    ["Pays within", d.paymentTermsDays != null ? `${d.paymentTermsDays} days` : "30 days (the usual)"],
    c.customer && ["Credit limit", d.creditLimit ? `MVR ${d.creditLimit}` : "None set"],
    c.supplier && ["Bank accounts", d.bankAccounts.length ? d.bankAccounts.join(", ") : "None known yet"],
    // Names that came with a merge are listed under Merged in, not twice.
    d.alsoKnownAs?.filter((x) => !d.mergedIn?.includes(x)).length && ["Also written as", d.alsoKnownAs.filter((x) => !d.mergedIn?.includes(x)).join(", ")],
    d.mergedIn?.length && ["Merged in", d.mergedIn.join(", ")],
  ].filter(Boolean);
  return (
    <dl className="rounded-[20px] bg-[var(--surface)] lift divide-y divide-[var(--border)] overflow-hidden">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] gap-3 px-5 py-3.5">
          <dt className="text-[14px] text-[var(--ink-muted)]">{k}</dt>
          <dd className={cn("text-[15px] break-words whitespace-pre-line", !v && "text-[var(--ink-muted)]")}>{v || "Not given"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The people at the business: who signs, who pays. One of them gets the statements and reminders. */
function People({ c, onDone }) {
  const { can } = useCompany();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [p, setP] = useState({ name: "", role: "", phone: "", email: "" });
  async function save(body) {
    try {
      await apiClient.post(`/contacts/${c.id}/people`, body);
      onDone();
      return true;
    } catch (ex) {
      toast.error("Not saved", ex.message);
      return false;
    }
  }
  return (
    <div className="grid gap-3">
      {c.people.length === 0 && !adding && <p className="text-[15px] text-[var(--ink-muted)] py-2">Nobody added yet. At a resort or a ministry, the person who pays is rarely the one who ordered: add both, and mark who gets the statements.</p>}
      {c.people.length > 0 && (
        <ul className="rounded-[20px] bg-[var(--surface)] lift divide-y divide-[var(--border)] overflow-hidden">
          {c.people.map((x) => {
            const w = waNumber(x.phone);
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {x.name}
                    {x.forAccounts && (
                      <Badge tone="accent" className="ml-2 align-middle">
                        Gets statements
                      </Badge>
                    )}
                  </span>
                  <span className="block text-[13px] text-[var(--ink-muted)]">{[x.role, x.phone, x.email].filter(Boolean).join(" · ") || "No details"}</span>
                </span>
                {w && (
                  <a href={`https://wa.me/${w}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${x.name}`} className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                    <MessageCircle size={16} />
                  </a>
                )}
                {can("record") && !x.forAccounts && (
                  <button type="button" onClick={() => save({ ...x, forAccounts: true })} aria-label={`Send statements to ${x.name}`} title="Send statements to them" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                    <Star size={15} />
                  </button>
                )}
                {can("record") && (
                  <button type="button" onClick={() => window.confirm(`Remove ${x.name}?`) && save({ ...x, removed: true })} aria-label={`Remove ${x.name}`} className="h-9 w-9 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {can("record") &&
        (adding ? (
          <form
            className="rounded-[20px] bg-[var(--surface)] lift p-5 grid sm:grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save({ ...p, forAccounts: c.people.length === 0 })) {
                setP({ name: "", role: "", phone: "", email: "" });
                setAdding(false);
              }
            }}
          >
            <input autoFocus aria-label="Name" placeholder="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className={FIELD} required />
            <input aria-label="What they do" placeholder="Accounts, site manager, procurement…" value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} className={FIELD} />
            <input aria-label="Phone or WhatsApp" placeholder="Phone or WhatsApp" inputMode="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} className={FIELD} />
            <input aria-label="Email" placeholder="Email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} className={FIELD} />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!p.name.trim()}>
                Add {p.name.trim() || "them"}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
            <UserPlus size={16} /> Add a person
          </Button>
        ))}
    </div>
  );
}

/**
 * Two records that are one business ("Moonreef Hotels" and "Moon Reef Hotel
 * Pvt Ltd"): fold the other into this one. What each owed adds up here, and
 * the other name is remembered, so the next bill in that name lands here.
 */
function Merge({ c, onDone }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["contacts", companyId], queryFn: () => apiClient.get("/contacts").then((r) => r.data), enabled: open });
  const words = q.trim().toLowerCase();
  const others = useMemo(() => (data?.contacts || []).filter((x) => x.id !== c.id && (!words || x.name.toLowerCase().includes(words) || String(x.phone || "").includes(words))).slice(0, 8), [data, words, c.id]);
  async function fold(x) {
    if (!window.confirm(`Fold ${x.name} into ${c.name}? What they owe and are owed adds up here, their name is remembered as another name for ${c.name}, and ${x.name} is archived. Their bank accounts come across too. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiClient.post(`/contacts/${c.id}/merge`, { otherId: x.id });
      toast.success(`${x.name} merged into ${c.name}`);
      setOpen(false);
      onDone();
    } catch (ex) {
      toast.error("Not merged", ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-medium text-[var(--deep)] underline underline-offset-4">
        Same business as another record? Merge them
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Merge into ${c.name}`} description="Choose the other record for the same business. It is folded into this one; nothing already in the books changes.">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Find the other record" className={FIELD} />
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {others.map((x) => (
              <li key={x.id}>
                <button type="button" disabled={busy} onClick={() => fold(x)} className="w-full text-left flex items-center gap-3 py-3 hover:bg-[var(--surface-2)]/60 rounded-xl px-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium truncate">{x.name}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">{[x.customer && "Customer", x.supplier && "Supplier", x.phone].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Money amount={x.customer ? x.receivable : x.payable} className="text-[14px] font-semibold" />
                </button>
              </li>
            ))}
            {data && !others.length && <li className="py-4 text-[14px] text-[var(--ink-muted)]">No other record matches.</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}
