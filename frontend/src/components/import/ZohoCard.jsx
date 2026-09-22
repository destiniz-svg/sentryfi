import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link2, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Zoho Books, connected directly.
 *
 * Connecting sends the person to Zoho to say yes, read-only, and back. Once
 * connected, pick the dates and look: the same preview as a file, and the same
 * "bring in" that a person presses.
 */

const FIELD = "h-11 px-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[14px] tabular";

const lastYear = () => {
  const y = new Date().getUTCFullYear() - 1;
  return [`${y}-01-01`, `${y}-12-31`];
};

export function ZohoCard({ onLook, busy }) {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [[from, to], setRange] = useState(lastYear);

  const { data, isLoading } = useQuery({
    queryKey: ["zoho", companyId],
    queryFn: () => apiClient.get("/zoho").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["zoho", companyId] });

  // Back from Zoho: say how it went once, then clear it from the address.
  useEffect(() => {
    const said = params.get("zoho");
    if (!said) return;
    if (said === "connected") toast.success("Zoho Books is connected", "Read-only. Pick the dates to look at.");
    else toast.error("Zoho is not connected", params.get("why") || "Zoho said no.");
    setParams({}, { replace: true });
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useMutation({
    mutationFn: () => apiClient.post("/zoho/connect").then((r) => r.data),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (ex) => toast.error("Cannot connect yet", ex.message),
  });
  const pickOrg = useMutation({
    mutationFn: (o) => apiClient.post("/zoho/organization", o),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => apiClient.delete("/zoho"),
    onSuccess: () => {
      refresh();
      toast.success("Zoho Books is disconnected", "Its sign-in is deleted here. Anything already brought in stays.");
    },
  });

  if (isLoading || !data) return null;
  const admin = can("manage_settings");

  return (
    <Card padding="lg" className="mb-4" data-testid="zoho-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <Link2 size={16} /> Zoho Books, directly
        </div>
        {data.connected && admin && (
          <button type="button" onClick={() => disconnect.mutate()} className="text-[13px] underline underline-offset-2 text-[var(--ink-muted)] h-11">
            Disconnect
          </button>
        )}
      </div>

      {!data.configured ? (
        <p className="text-[14px] text-[var(--ink-muted)] mt-2">
          Not set up on the server yet. It needs a Zoho API client; until then, use a CSV export below.
        </p>
      ) : !data.connected ? (
        <div className="mt-2">
          <p className="text-[14px] text-[var(--ink-muted)] mb-3">
            Sign in to Zoho and allow read-only access. Nothing is brought in until you have looked and said yes.
          </p>
          {admin ? (
            <Button variant="accent" disabled={connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending && <Loader2 size={14} className="animate-spin" />} Connect Zoho Books
            </Button>
          ) : (
            <p className="text-[14px]">An administrator connects it.</p>
          )}
        </div>
      ) : data.error ? (
        <p role="alert" className="text-[14px] text-[var(--danger)] mt-2">
          {data.error} Disconnect and connect again.
        </p>
      ) : !data.organization ? (
        <div className="mt-2">
          <p className="text-[14px] mb-2">Which Zoho organisation holds these books?</p>
          <div className="flex flex-wrap gap-2">
            {data.organizations.map((o) => (
              <Button key={o.id} variant="outline" onClick={() => pickOrg.mutate(o)}>
                {o.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-[14px] mb-3">
            Connected to <strong>{data.organization.name}</strong>. Read-only.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">From</span>
              <input id="zoho-from" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} className={FIELD} />
            </label>
            <label className="block">
              <span className="text-sm font-medium block mb-1.5">To</span>
              <input id="zoho-to" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} className={FIELD} />
            </label>
            <Button variant="accent" disabled={busy || !from || !to || from > to} onClick={() => onLook(from, to)}>
              {busy && <Loader2 size={14} className="animate-spin" />} Look at these dates in Zoho
            </Button>
          </div>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">
            A year can take a few minutes: Zoho allows 100 requests a minute, and every account is read.
          </p>
        </div>
      )}
    </Card>
  );
}
