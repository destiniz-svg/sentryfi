import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";
import { FIELD } from "@/lib/shipments";
import { cn } from "@/lib/utils";

/**
 * Keys for your own assistant and other software (backend middleware/apiKey.js).
 *
 * A key acts as you, in this company, and can do less than you: it reads what
 * you read and, if you chose it, makes drafts in your name. It never puts
 * anything in the books. Shown once; turn it off here at any time.
 */
const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://sentryfi.app";

export function AssistantKeys() {
  const { companyId, company, can } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("read");
  const [made, setMade] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["keys", companyId], queryFn: () => apiClient.get("/keys").then((r) => r.data.keys), enabled: Boolean(companyId) });

  async function make(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiClient.post("/keys", { name: name.trim(), scope });
      setMade(r.data);
      setName("");
      qc.invalidateQueries({ queryKey: ["keys", companyId] });
    } catch (err) {
      toast.error("No key made", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(k) {
    try {
      await apiClient.delete(`/keys/${k.id}`);
      qc.invalidateQueries({ queryKey: ["keys", companyId] });
      toast.success(`${k.name} is off`, "Anything using it is refused from now on.");
    } catch (err) {
      toast.error("Still on", err.message);
    }
  }

  const mcp = made && JSON.stringify({ mcpServers: { sentryfi: { type: "http", url: `${ORIGIN}/api/mcp`, headers: { Authorization: `Bearer ${made.token}` } } } }, null, 2);

  return (
    <div className="space-y-4" data-testid="assistant-keys">
      <Card padding="lg">
        <CardTitle>Your assistant, in your books</CardTitle>
        <p className="text-[14px] text-[var(--ink-muted)] mt-1.5 leading-relaxed max-w-[68ch]">
          Give your own AI assistant or other software a key to {company?.name || "this company"}. It acts as you and can do less than you: it reads what you can read, and with a draft key it also drafts bills, invoices and orders in your name. It never puts anything in the books, approves or pays: those stay yours, in Sentryfi. Every write it makes is kept below, and you can turn a key off at any time.
        </p>

        <form onSubmit={make} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] items-end">
          <label className="block">
            <span className="block text-[13px] font-medium mb-1.5">Name it</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude on my laptop" className={FIELD} maxLength={80} />
          </label>
          <div className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] h-11" role="group" aria-label="What it may do">
            {[
              ["read", "Read only"],
              ["draft", "Read and draft"],
            ].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setScope(v)} aria-pressed={scope === v} disabled={v === "draft" && !can("record")} className={cn("px-4 rounded-full text-[14px] font-medium disabled:opacity-40", scope === v ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)]")}>
                {l}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={15} />} Make a key
          </Button>
        </form>

        {made && (
          <div className="mt-5 rounded-2xl bg-[var(--surface-2)] p-4 space-y-4" data-testid="new-key">
            <div>
              <p className="text-[14px] font-semibold">{made.key.name}: copy it now. It is not shown again.</p>
              <CopyBlock text={made.token} label="The key" />
            </div>
            <div>
              <p className="text-[13px] text-[var(--ink-muted)]">For an assistant that speaks MCP (Claude and others), add this server:</p>
              <CopyBlock text={mcp} label="MCP settings" />
            </div>
            <div>
              <p className="text-[13px] text-[var(--ink-muted)]">For other software, the interface is described at</p>
              <CopyBlock text={`${ORIGIN}/api/openapi.json`} label="Where the interface is described" />
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardTitle>Your keys to {company?.name || "this company"}</CardTitle>
        {!data?.length ? (
          <p className="text-[14px] text-[var(--ink-muted)] mt-2">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {data.map((k) => (
              <li key={k.id} className="py-3 flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center" aria-hidden="true">
                  <Bot size={17} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium truncate">{k.name}</p>
                  <p className="text-[12px] text-[var(--ink-muted)]">
                    {k.scope === "draft" ? "Reads and drafts" : "Reads only"} · ends …{k.hint} · {k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "not used yet"} · {k.writes} {k.writes === 1 ? "write" : "writes"}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => turnOff(k)} aria-label={`Turn off ${k.name}`}>
                  <Trash2 size={14} /> Turn off
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CopyBlock({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <pre className="flex-1 min-w-0 overflow-x-auto rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] leading-relaxed" aria-label={label}>
        {text}
      </pre>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
    </div>
  );
}
