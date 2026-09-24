import { useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * The thread under a document: the customer's questions and the company's
 * answers, oldest first. The same drawing on both sides; `me` is who is
 * looking ("customer" on the portal, "company" in the app), so their own
 * messages sit to the right.
 */
export function Questions({ thread = [], me, onSend, askName = false, title = "Questions", empty, placeholder, sendLabel = "Send" }) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await onSend({ body: body.trim(), name: name.trim() || null });
      setBody("");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  const open = thread.some((q) => q.open);
  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 print:hidden" aria-label={title} data-testid="questions">
      <div className="flex items-center gap-2">
        <MessageSquare size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {me === "company" && open && <span className="ml-auto text-[12px] font-semibold text-[var(--warning)]">Waiting for your answer</span>}
      </div>
      {thread.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-muted)] mt-2">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {thread.map((q) => {
            const mine = q.from === me;
            return (
              <li key={q.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--surface-2)]"}`}>
                  <div className={`text-[12px] ${mine ? "opacity-70" : "text-[var(--ink-muted)]"}`}>
                    {q.name} · {new Date(q.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <p className="text-[14px] whitespace-pre-line mt-0.5">{q.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form onSubmit={send} className="mt-4 grid gap-2">
        {askName && (
          <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] sm:max-w-xs" />
        )}
        <div className="flex gap-2 items-end">
          <textarea
            aria-label={placeholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={placeholder}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] resize-y"
          />
          <Button type="submit" variant="outline" disabled={busy || !body.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sendLabel}
          </Button>
        </div>
        {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
      </form>
    </section>
  );
}
