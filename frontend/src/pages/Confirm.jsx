import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Lock, Paperclip } from "lucide-react";
import { apiClient } from "@/api/client";

/**
 * A customer or supplier answering an auditor's balance confirmation, from a
 * private link, without an account. They see who asks, about what, as at
 * when; on a "blank" request they give their own figure, which is the
 * stronger evidence. The answer goes only to the auditor, once.
 */

const FIELD = "w-full h-12 px-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[16px] outline-none focus:border-[var(--ink)]";
const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Shell({ children }) {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)] px-4 py-8 sm:py-14">
      <div className="max-w-[560px] mx-auto">{children}</div>
    </main>
  );
}

export default function Confirm() {
  const { token } = useParams();
  const { data: c, error, isLoading } = useQuery({ queryKey: ["confirm", token], queryFn: () => apiClient.get(`/confirm/${token}`).then((r) => r.data), retry: false });
  const [f, setF] = useState({ agrees: null, amount: "", note: "", name: "", role: "", file: null, fileName: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (isLoading) return <Shell><p className="text-[var(--ink-muted)]">Opening…</p></Shell>;
  if (error || !c) {
    return (
      <Shell>
        <h1 className="font-display text-[26px] font-bold">This link does not open</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-muted)]">{error?.message || "It may have expired or been replaced by a newer request."} Ask the auditor who wrote to you for a new one.</p>
      </Shell>
    );
  }
  const owe = c.side === "receivable" ? `you owed ${c.company}` : `${c.company} owed you`;
  if (done || c.answered) {
    return (
      <Shell>
        <div className="h-12 w-12 rounded-full bg-[var(--success-soft)] text-[var(--success)] grid place-items-center">
          <Check size={24} />
        </div>
        <h1 className="font-display text-[26px] font-bold mt-4">Thank you</h1>
        <p className="mt-2 text-[15px]">Your reply has gone to {c.auditor}. {c.company} does not see it.</p>
      </Shell>
    );
  }

  const blank = c.form === "blank";
  const needsAmount = blank || f.agrees === false;
  const ready = f.name.trim().length > 1 && (blank ? f.amount.trim() : f.agrees !== null && (f.agrees || f.amount.trim()));

  async function attach(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setErr("Attach a file under 5 MB.");
    const data = await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.readAsDataURL(file);
    });
    setErr("");
    setF((x) => ({ ...x, file: data, fileName: file.name }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiClient.post(`/confirm/${token}`, {
        agrees: blank ? null : f.agrees,
        amount: needsAmount ? f.amount : null,
        note: f.note || null,
        name: f.name,
        role: f.role || null,
        file: f.file,
        fileName: f.fileName || null,
      });
      setDone(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <p className="text-[12px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-muted)]">Balance confirmation · for an audit</p>
      <h1 className="font-display text-[28px] sm:text-[32px] font-bold leading-tight mt-2 text-balance">
        What {owe} on {day(c.asAt)}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed">
        {c.auditor} is auditing the accounts of {c.company} and asks you, {c.party}, to confirm this from your own records.
      </p>
      <p className="mt-3 text-[13.5px] text-[var(--ink-muted)] flex gap-2 items-start">
        <Lock size={15} className="mt-0.5 shrink-0" /> Your reply goes only to the auditor, once. {c.company} authorised this request and does not see your answer.
      </p>

      <form onSubmit={onSubmit} className="mt-7 grid gap-5" data-testid="confirm-form">
        {blank ? (
          <label className="block">
            <span className="text-[15px] font-medium block mb-2">The balance in your records (MVR)</span>
            <input id="confirm-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} autoFocus />
            <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{c.side === "receivable" ? `What you owed ${c.company}, from your side. Nothing owed? Enter 0.` : `What ${c.company} owed you. Nothing owed? Enter 0.`}</span>
          </label>
        ) : (
          <fieldset>
            <legend className="text-[15px] font-medium mb-2">
              Their records show <span className="tabular font-semibold">MVR {c.theirs}</span>. Does this agree with yours?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                [true, "Yes, it agrees"],
                [false, "No, it differs"],
              ].map(([v, label]) => (
                <label key={label} className={`h-12 rounded-2xl border grid place-items-center text-[15px] cursor-pointer ${f.agrees === v ? "border-[var(--ink)] bg-[var(--surface-2)] font-semibold" : "border-[var(--border)]"}`}>
                  <input type="radio" name="agrees" className="sr-only" checked={f.agrees === v} onChange={() => setF({ ...f, agrees: v })} />
                  {label}
                </label>
              ))}
            </div>
            {f.agrees === false && (
              <label className="block mt-4">
                <span className="text-[15px] font-medium block mb-2">The balance in your records (MVR)</span>
                <input id="confirm-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className={`${FIELD} tabular`} />
              </label>
            )}
          </fieldset>
        )}
        <label className="block">
          <span className="text-[15px] font-medium block mb-2">Anything the auditor should know (optional)</span>
          <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} placeholder="An invoice not yet received, a payment in transit…" className={`${FIELD} h-auto py-3`} />
        </label>
        <label className="inline-flex items-center gap-2 text-[14px] cursor-pointer min-h-11">
          <Paperclip size={16} />
          <span className="underline underline-offset-2">{f.fileName || "Attach your statement (PDF or photo, optional)"}</span>
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={attach} className="sr-only" />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[15px] font-medium block mb-2">Your name</span>
            <input id="confirm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" className={FIELD} />
          </label>
          <label className="block">
            <span className="text-[15px] font-medium block mb-2">Your position (optional)</span>
            <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Accounts" className={FIELD} />
          </label>
        </div>
        {err && (
          <p role="alert" className="text-[14px] text-[var(--danger)]">
            {err}
          </p>
        )}
        <button type="submit" disabled={busy || !ready} className="h-12 rounded-full bg-[var(--accent)] text-[var(--ink)] font-semibold text-[16px] disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin" />}
          Send my reply to the auditor
        </button>
      </form>
    </Shell>
  );
}
