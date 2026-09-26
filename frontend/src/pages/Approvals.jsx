import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { FIELD } from "@/lib/shipments";

/**
 * Everything waiting for this person's approval, in one place: purchase
 * orders over their orderer's limit, expense claims, and bills over the limit
 * of whoever recorded them. Approved here, each carries on where it was.
 *
 * Anything can be passed to someone who can approve it: a link (copied, or
 * sent on WhatsApp) that opens this page at the item. Approving still needs
 * them signed in as themselves; the link only takes them there.
 */

/** Passing an item to someone to approve: a link to it here, copied or sent on WhatsApp. */
function AskSomeone({ it }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/approvals?open=${it.kind}:${it.id}`;
  const text = `Please approve: ${KIND[it.kind].toLowerCase()} ${it.title}, ${it.amount}`;
  return (
    <span className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        title="Copy a link to this"
        onClick={async () => {
          await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Ask someone"}
      </Button>
      <Button variant="ghost" size="sm" aria-label="Ask on WhatsApp" title="Ask on WhatsApp" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank", "noopener")}>
        <MessageCircle size={13} />
      </Button>
    </span>
  );
}

/** How far above its order a bill's price may be before it is held here; changed by whoever manages settings. */
function PriceTolerance({ percent, canChange }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { companyId } = useCompany();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(percent);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.put("/approvals/price-tolerance", { percent: value });
      toast.success(`Bills more than ${r.data.priceTolerance}% above their order now wait here`);
      qc.invalidateQueries({ queryKey: ["approvals", companyId] });
      setEditing(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="text-[14px] text-[var(--ink-muted)] mb-4 flex flex-wrap items-center gap-x-2" data-testid="price-tolerance">
        <span>
          A bill priced more than <span className="text-[var(--ink)] font-medium tabular">{percent}%</span> above its order waits here until someone accepts it with a reason, or sends it back.
        </span>
        {canChange && (
          <button type="button" onClick={() => setEditing(true)} className="underline text-[var(--ink)] min-h-11">
            Change
          </button>
        )}
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 mb-4">
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">Hold bills priced above their order by more than (%)</span>
        <input id="price-tolerance" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${FIELD} w-40 tabular`} autoFocus />
      </label>
      <Button type="submit" variant="accent" disabled={busy || value.trim() === ""}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        Save
      </Button>
      <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {err && (
        <p role="alert" className="w-full text-[13px] text-[var(--danger)]">
          {err}
        </p>
      )}
    </form>
  );
}

const KIND = { order: "Purchase order", claim: "Expense claim", bill: "Bill over a limit", match: "Bill priced above its order" };

export default function Approvals() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [why, setWhy] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["approvals", companyId], queryFn: () => apiClient.get("/approvals").then((r) => r.data), enabled: Boolean(companyId) });
  // Opened from a link someone sent: that item, found and lit.
  const [open] = useState(() => new URLSearchParams(window.location.search).get("open"));
  useEffect(() => {
    if (!open || !data) return;
    const t = setTimeout(() => document.getElementById(`approve-${open.replace(":", "-")}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 200);
    return () => clearTimeout(t);
  }, [open, data]);
  const refresh = () => {
    for (const k of ["approvals", "attention", "orders", "claims", "bills", "figures"]) qc.invalidateQueries({ queryKey: [k, companyId] });
  };

  async function act(item, how) {
    setBusy(item.id + how);
    try {
      if (item.kind === "match" && how === "reject") await apiClient.delete(`/bills/${item.id}`, { data: { reason: why } });
      else if (item.kind === "match") await apiClient.post(`/bills/${item.id}/match/accept`, { note: why });
      else if (how === "reject") await apiClient.post(`/claims/${item.id}/reject`, { why });
      else if (item.kind === "order") await apiClient.post(`/orders/${item.id}/approve`);
      else if (item.kind === "claim") await apiClient.post(`/claims/${item.id}/approve`);
      else await apiClient.post(`/bills/${item.id}/post`);
      refresh();
      setRejecting(null);
      setAccepting(null);
      setWhy("");
      toast.success(how === "reject" ? "Sent back" : item.kind === "match" ? "Accepted" : "Approved", how === "reject" ? (item.kind === "match" ? "The bill is voided, with your reason." : "They see why, and can put it right.") : item.kind === "match" ? "The higher price stands, with your reason. It can go in the books now." : item.kind === "bill" ? "It is in the books." : item.kind === "claim" ? "It is owed to them, and paid in the next payment run." : "Deliveries can be received against it.");
    } catch (ex) {
      toast.error("Not yet", ex.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Approvals" description={`What waits for you${data?.limit ? `, up to your limit of MVR ${data.limit}` : ""}.`} />
      {data?.priceTolerance && <PriceTolerance percent={data.priceTolerance} canChange={can("manage_settings")} />}
      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !data?.items.length ? (
        <Card padding="lg">
          <p className="text-[16px] font-semibold">Nothing waits for you</p>
          <p className="text-[14px] text-[var(--ink-muted)] mt-1.5">Orders, claims and bills over someone's limit come here for you to approve.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]" data-testid="approvals">
            {data.items.map((it) => (
              <li key={it.kind + it.id} id={`approve-${it.kind}-${it.id}`} className={`px-5 py-4 transition-colors ${open === `${it.kind}:${it.id}` ? "bg-[var(--accent-soft)]" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[12px] text-[var(--ink-muted)] uppercase tracking-wider font-semibold">{KIND[it.kind]}</div>
                    <Link to={it.href} className="text-[15px] font-semibold hover:underline">
                      {it.title}
                    </Link>
                    <div className="text-[13px] text-[var(--ink-muted)]">
                      From {it.by || "someone"}
                      {it.lines ? ` · ${it.lines.map((l) => `${l.description} ${l.amount}`).join(", ")}` : ""}
                      {it.detail ? ` · ${it.detail}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <AskSomeone it={it} />
                    <Money amount={it.amount} className="text-[16px] font-semibold" />
                    {it.mine ? (
                      <Badge tone="neutral">Yours: someone else approves it</Badge>
                    ) : !it.within ? (
                      <Badge tone="neutral">Over your limit</Badge>
                    ) : (
                      <>
                        {(it.kind === "claim" || it.kind === "match") && (
                          <Button variant="ghost" size="sm" onClick={() => (setAccepting(null), setRejecting(rejecting === it.id ? null : it.id))}>
                            Send back
                          </Button>
                        )}
                        <Button variant="accent" size="sm" disabled={busy === it.id + "ok"} onClick={() => (it.kind === "match" ? (setRejecting(null), setAccepting(accepting === it.id ? null : it.id)) : act(it, "ok"))}>
                          {busy === it.id + "ok" && <Loader2 size={13} className="animate-spin" />}
                          {it.kind === "bill" ? "Approve and put in the books" : it.kind === "match" ? "Accept the price" : "Approve"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {rejecting === it.id && (
                  <div className="flex gap-2 mt-3">
                    <input aria-label="Why it is sent back" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why, so they can put it right" className={`${FIELD} flex-1 min-w-0`} />
                    <Button variant="outline" disabled={why.trim().length < 3 || busy === it.id + "reject"} onClick={() => act(it, "reject")}>
                      Send it back
                    </Button>
                  </div>
                )}
                {accepting === it.id && (
                  <div className="flex gap-2 mt-3">
                    <input aria-label="Why the higher price is right" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why the higher price is right" className={`${FIELD} flex-1 min-w-0`} />
                    <Button variant="accent" disabled={why.trim().length < 3 || busy === it.id + "ok"} onClick={() => act(it, "ok")}>
                      Accept it
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
