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

const KIND = { order: "Purchase order", claim: "Expense claim", bill: "Bill over a limit" };

export default function Approvals() {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
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
      if (how === "reject") await apiClient.post(`/claims/${item.id}/reject`, { why });
      else if (item.kind === "order") await apiClient.post(`/orders/${item.id}/approve`);
      else if (item.kind === "claim") await apiClient.post(`/claims/${item.id}/approve`);
      else await apiClient.post(`/bills/${item.id}/post`);
      refresh();
      setRejecting(null);
      setWhy("");
      toast.success(how === "reject" ? "Sent back" : "Approved", how === "reject" ? "They see why, and can put it right." : item.kind === "bill" ? "It is in the books." : item.kind === "claim" ? "It is owed to them, and paid in the next payment run." : "Deliveries can be received against it.");
    } catch (ex) {
      toast.error("Not yet", ex.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Approvals" description={`What waits for you${data?.limit ? `, up to your limit of MVR ${data.limit}` : ""}.`} />
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
                        {it.kind === "claim" && (
                          <Button variant="ghost" size="sm" onClick={() => setRejecting(rejecting === it.id ? null : it.id)}>
                            Send back
                          </Button>
                        )}
                        <Button variant="accent" size="sm" disabled={busy === it.id + "ok"} onClick={() => act(it, "ok")}>
                          {busy === it.id + "ok" && <Loader2 size={13} className="animate-spin" />}
                          {it.kind === "bill" ? "Approve and put in the books" : "Approve"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {rejecting === it.id && (
                  <div className="flex gap-2 mt-3">
                    <input aria-label="Why it is sent back" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why, so they can put it right" className={`${FIELD} flex-1 min-w-0`} />
                    <Button variant="outline" disabled={!why.trim() || busy === it.id + "reject"} onClick={() => act(it, "reject")}>
                      Send it back
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
