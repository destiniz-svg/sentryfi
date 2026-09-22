import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/UIContext";

/**
 * Whether the books are safe if this server is lost.
 *
 * Every night the whole database is copied, encrypted, stored away from the
 * database, then fetched back and restored into an empty database to prove
 * it: every seal verified, every total the same. This page shows the last
 * runs, plainly, and can start one now.
 */

const when = (iso) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const size = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

export function BackupsSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => apiClient.get("/backups").then((r) => r.data),
    // While one is running, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.runs?.[0] && !q.state.data.runs[0].finished_at ? 4000 : false),
  });
  const start = useMutation({
    mutationFn: () => apiClient.post("/backups/run").then((r) => r.data),
    onSuccess: () => {
      toast.success("Backing up now", "It takes under a minute. This page updates when it is done.");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["backups"] }), 1500);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center py-16 justify-center text-[var(--ink-muted)]">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  }

  const last = data.runs[0];
  const lastGood = data.runs.find((r) => r.ok);
  const running = last && !last.finished_at;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base">Backups</CardTitle>
            <CardDescription className="mt-1">
              Every night: the whole database, encrypted, kept away from the server, then restored into an empty database
              to prove it comes back whole.
            </CardDescription>
          </div>
        </CardHeader>

        {!data.setUp ? (
          <p role="alert" className="text-[14px] text-[var(--danger)]">
            Backups are not set up on the server. Missing: {data.missing.join(", ")}.
          </p>
        ) : (
          <div className="flex items-start gap-3" data-testid="backup-status">
            {lastGood ? (
              <ShieldCheck className="shrink-0 mt-0.5 text-[var(--success)]" size={22} />
            ) : (
              <ShieldAlert className="shrink-0 mt-0.5 text-[var(--danger)]" size={22} />
            )}
            <div className="text-[15px]">
              {lastGood ? (
                <>
                  <div className="font-semibold">Last backed up and proven {when(lastGood.finished_at)}</div>
                  <div className="text-[var(--ink-muted)] text-[14px] mt-0.5">
                    {lastGood.companies} {lastGood.companies === 1 ? "company" : "companies"},{" "}
                    {Number(lastGood.entries).toLocaleString("en-US")} entries, {size(Number(lastGood.bytes))} encrypted. Restored
                    into an empty database; every seal verified and every total matched.
                  </div>
                </>
              ) : (
                <div className="font-semibold">Not backed up yet.</div>
              )}
              {last && !last.ok && last.finished_at && (
                <div role="alert" className="text-[14px] text-[var(--danger)] mt-2">
                  The last try, {when(last.started_at)}, failed: {last.problem}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <Button onClick={() => start.mutate()} disabled={!data.setUp || running || start.isPending}>
            {(running || start.isPending) && <Loader2 size={14} className="animate-spin" />}
            {running ? "Backing up" : "Back up now"}
          </Button>
        </div>
      </Card>

      {data.runs.length > 0 && (
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base">Recent runs</CardTitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)] text-[14px]" data-testid="backup-runs">
            {data.runs.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <span className="tabular">{when(r.started_at)}</span>
                <span className={r.ok ? "" : r.finished_at ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"}>
                  {!r.finished_at ? "Running" : r.ok ? `Proven · ${size(Number(r.bytes))}` : "Failed"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
