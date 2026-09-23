import { useState } from "react";
import { Copy, Loader2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";

/**
 * Customer links: a private page each customer opens, without an account, to
 * see their invoices and what they owe, and how to pay. Made here, copied into
 * WhatsApp or an email, and turned off here.
 */
export function CustomerLinks({ onClose }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["portal-links", companyId], queryFn: () => apiClient.get("/portal-links").then((r) => r.data) });
  const { data: parties } = useQuery({ queryKey: ["orders", companyId, "options"], queryFn: () => apiClient.get("/orders/options").then((r) => r.data) });
  const [who, setWho] = useState("");
  const [made, setMade] = useState(null);
  const [details, setDetails] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["portal-links", companyId] });
  const customers = (parties?.parties || []).filter((p) => (p.kind || []).includes("customer"));
  const shown = details ?? data?.paymentDetails ?? "";

  async function make() {
    const r = await apiClient.post("/portal-links", { counterpartyId: who });
    const url = `${window.location.origin}/portal/${r.data.token}`;
    setMade({ url, customer: customers.find((c) => c.id === who)?.name });
    refresh();
  }
  async function copy(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", "Paste it into WhatsApp or an email to them.");
    } catch {
      toast.error("Not copied", "Select the link and copy it.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Customer links" description="A private page for each customer: their invoices, what they owe, and how to pay you. No account needed.">
      {!data ? (
        <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />
      ) : (
        <div className="grid gap-5">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">How customers pay you</span>
            <textarea
              id="portal-details"
              rows={3}
              value={shown}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={"Bank of Maldives\nAccount 7730000000000\nName: Your company Pvt Ltd"}
              className={`${FIELD} h-auto py-2.5`}
            />
            {details !== null && details !== data.paymentDetails && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  await apiClient.put("/portal-links/payment-details", { paymentDetails: details });
                  refresh();
                  setDetails(null);
                  toast.success("Saved", "Every customer's page shows it.");
                }}
              >
                Save
              </Button>
            )}
          </label>

          <div>
            <span className="text-sm font-medium block mb-1.5">A link for</span>
            <div className="flex gap-2">
              <select id="portal-customer" value={who} onChange={(e) => setWho(e.target.value)} className={`${FIELD} flex-1 min-w-0`}>
                <option value="">Pick a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button variant="accent" disabled={!who} onClick={make}>
                Make the link
              </Button>
            </div>
            {made && (
              <div className="mt-3 rounded-xl border border-[var(--border)] p-3" data-testid="portal-made">
                <div className="text-[13px] text-[var(--ink-muted)]">For {made.customer}. Anyone with it sees their invoices, so send it only to them.</div>
                <div className="flex gap-2 mt-2">
                  <input readOnly value={made.url} aria-label="The link" className={`${FIELD} flex-1 min-w-0 text-[13px]`} onFocus={(e) => e.target.select()} />
                  <Button variant="outline" onClick={() => copy(made.url)}>
                    <Copy size={14} /> Copy
                  </Button>
                </div>
              </div>
            )}
          </div>

          {data.links.length > 0 && (
            <div>
              <span className="text-sm font-medium block mb-1.5">Links given out</span>
              <ul className="divide-y divide-[var(--border)] text-[14px]">
                {data.links.map((l) => (
                  <li key={l.id} className="py-2 flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      {l.customer}
                      <span className="block text-[12px] text-[var(--ink-muted)]">
                        Made {formatDate(l.createdAt)} · {l.lastSeenAt ? `last opened ${formatDate(l.lastSeenAt)}` : "not opened yet"}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Turn off ${l.customer}'s link`}
                      onClick={async () => {
                        await apiClient.delete(`/portal-links/${l.id}`);
                        refresh();
                        toast.success("Turned off", "That link no longer opens.");
                      }}
                      className="h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)] text-[var(--ink-muted)]"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
