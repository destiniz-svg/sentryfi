import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, Receipt, Send, Trash2, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { keep, kept, forget } from "@/lib/expenses";
import { cn, today } from "@/lib/utils";

/**
 * The expense companion: a light app of its own for money a person spent and
 * wants back. Snap the receipt, check what was read, keep it; send what is
 * kept as one claim. The claim goes to whoever approves, and once approved it
 * is in the books, owed back to the person, with nothing typed twice. Receipts
 * wait on the phone (lib/expenses.js) through a day with no signal.
 *
 * Installs as "Sentryfi Expenses" (public/go.webmanifest), apart from the main app.
 */
const BOX = "block rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3.5 pt-2 pb-1.5 focus-within:border-[var(--ink)]";
const INPUT = "w-full bg-transparent outline-none text-[16px] h-7";

export default function Go() {
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const [view, setView] = useState("snap");
  const [list, setList] = useState([]);
  const refresh = async () => setList(await kept({ companyId, userId: user?.id }));

  // Its own name and install card while it is open.
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const was = link?.getAttribute("href");
    link?.setAttribute("href", "/go.webmanifest");
    const title = document.title;
    document.title = "Sentryfi Expenses";
    return () => {
      if (link && was) link.setAttribute("href", was);
      document.title = title;
    };
  }, []);
  useEffect(() => {
    if (companyId && user?.id) refresh();
  }, [companyId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 pt-5 pb-10 max-w-[520px] mx-auto">
      <header className="flex items-center gap-3">
        <span className="h-11 w-11 rounded-full bg-[var(--ink)] text-[var(--accent)] inline-flex items-center justify-center" aria-hidden="true">
          <Receipt size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-6">Expenses</h1>
          <p className="text-[13px] text-[var(--ink-muted)] truncate">{company?.name}</p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-1 p-1 rounded-full bg-[var(--surface)] lift" role="tablist">
        {[
          ["snap", "Snap"],
          ["claim", `This claim${list.length ? ` · ${list.length}` : ""}`],
          ["sent", "Sent"],
        ].map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("h-10 rounded-full text-[14px] font-medium", view === v ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--ink-muted)]")}>
            {l}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {view === "snap" && <Snap onKept={() => refresh().then(() => setView("claim"))} />}
        {view === "claim" && <ThisClaim list={list} refresh={refresh} onSent={() => setView("sent")} />}
        {view === "sent" && <Sent />}
      </div>
    </main>
  );
}

function Snap({ onKept }) {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const toast = useToast();
  const input = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [reading, setReading] = useState(false);
  const [f, setF] = useState({ what: "", amount: "", spentOn: today(), accountId: "", projectId: "" });
  const [open, setOpen] = useState(false);
  const { data: opts } = useQuery({ queryKey: ["claimOptions", companyId], queryFn: () => apiClient.get("/claims/options").then((r) => r.data), enabled: Boolean(companyId) });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const accountId = f.accountId || opts?.accounts?.[0]?.id || "";

  async function read(file) {
    setPhoto(file);
    setOpen(true);
    if (!navigator.onLine) return;
    setReading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiClient.post("/claims/scan", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setF((x) => ({ ...x, what: r.data.merchant || x.what, amount: r.data.amount || x.amount, spentOn: r.data.spentOn || x.spentOn }));
    } catch {
      toast.error("Could not read it", "Type what the receipt says.");
    } finally {
      setReading(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    const amount = String(f.amount).replace(/,/g, "").trim();
    if (!f.what.trim() || !(Number(amount) > 0)) return toast.error("Not kept", "Say what it was for and how much.");
    await keep({ id: crypto.randomUUID(), companyId, userId: user.id, what: f.what.trim(), amount, spentOn: f.spentOn, accountId, projectId: f.projectId || null, photo });
    toast.success("Kept on this phone", "Send it with the rest when you are ready.");
    setPhoto(null);
    setOpen(false);
    setF({ what: "", amount: "", spentOn: today(), accountId: "", projectId: "" });
    onKept();
  }

  if (!open)
    return (
      <div className="space-y-3">
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" data-testid="receipt-file" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        <button type="button" onClick={() => input.current?.click()} className="w-full rounded-[24px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-8 flex flex-col items-center gap-3">
          <span className="h-16 w-16 rounded-full bg-[var(--accent)] text-[var(--on-accent)] inline-flex items-center justify-center" aria-hidden="true">
            <Camera size={28} />
          </span>
          <span className="text-[18px] font-semibold">Snap a receipt</span>
          <span className="text-[13px] opacity-70">What it says is read for you to check.</span>
        </button>
        <button type="button" onClick={() => setOpen(true)} className="w-full h-12 rounded-full bg-[var(--surface)] lift text-[15px] font-medium">
          No receipt? Type it in
        </button>
      </div>
    );

  return (
    <form onSubmit={save} className="rounded-[24px] bg-[var(--surface)] lift p-5 space-y-3">
      {photo && (
        <div className="relative">
          <img src={URL.createObjectURL(photo)} alt="The receipt" className="w-full max-h-56 object-contain rounded-xl bg-[var(--surface-2)]" />
          {reading && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 bg-[var(--surface)]/70 text-[14px] font-medium rounded-xl">
              <Loader2 size={16} className="animate-spin" /> Reading it…
            </span>
          )}
        </div>
      )}
      <label className={BOX}>
        <span className="block text-[12px] text-[var(--ink-muted)]">What it was for</span>
        <input value={f.what} onChange={set("what")} placeholder="Taxi to the site" className={INPUT} aria-label="What it was for" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={BOX}>
          <span className="block text-[12px] text-[var(--ink-muted)]">How much</span>
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="150.00" className={cn(INPUT, "tabular")} aria-label="How much" />
        </label>
        <label className={BOX}>
          <span className="block text-[12px] text-[var(--ink-muted)]">When</span>
          <input type="date" value={f.spentOn} onChange={set("spentOn")} className={INPUT} aria-label="When" />
        </label>
      </div>
      <label className={BOX}>
        <span className="block text-[12px] text-[var(--ink-muted)]">What kind of spending</span>
        <select value={accountId} onChange={set("accountId")} className={cn(INPUT, "appearance-none")} aria-label="What kind of spending">
          {(opts?.accounts || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {opts?.projects?.length > 0 && (
        <label className={BOX}>
          <span className="block text-[12px] text-[var(--ink-muted)]">For a project</span>
          <select value={f.projectId} onChange={set("projectId")} className={cn(INPUT, "appearance-none")} aria-label="For a project">
            <option value="">None</option>
            {opts.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => (setOpen(false), setPhoto(null))} className="h-12 px-5 rounded-full bg-[var(--surface-2)] text-[15px] font-medium">
          <X size={16} className="inline -mt-0.5" /> Not this
        </button>
        <button type="submit" disabled={reading || !accountId} className="h-12 flex-1 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[15px] font-medium disabled:opacity-40" data-testid="keep-expense">
          <Check size={16} className="inline -mt-0.5" /> Keep it
        </button>
      </div>
    </form>
  );
}

function ThisClaim({ list, refresh, onSent }) {
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const total = list.reduce((a, e) => a + Number(e.amount || 0), 0);

  async function send() {
    if (!navigator.onLine) return toast.error("No signal", "They are safe on this phone. Send them when you are back in signal.");
    setSending(true);
    try {
      const r = await apiClient.post("/claims", { note: note.trim() || null, lines: list.map((e) => ({ spentOn: e.spentOn, description: e.what, accountId: e.accountId, projectId: e.projectId, amount: e.amount })) });
      const claimId = r.data.id;
      // The receipts follow the claim; a photo that fails to go does not undo the claim.
      for (const e of list.filter((x) => x.photo)) {
        const fd = new FormData();
        fd.append("file", e.photo, `receipt-${e.spentOn}.jpg`);
        await apiClient.post(`/attachments/claims/${claimId}`, fd, { headers: { "Content-Type": "multipart/form-data" } }).catch(() => {});
      }
      for (const e of list) await forget(e.id);
      await refresh();
      qc.invalidateQueries({ queryKey: ["myClaims", companyId] });
      toast.success(`Sent: ${r.data.number || "your claim"}`, "Whoever approves will look at it. Once approved, it is owed back to you.");
      onSent();
    } catch (err) {
      toast.error("Not sent", err.message);
    } finally {
      setSending(false);
    }
  }

  if (!list.length)
    return <p className="rounded-[20px] bg-[var(--surface)] lift px-5 py-8 text-center text-[15px] text-[var(--ink-muted)]">Nothing kept yet. Snap a receipt and it waits here until you send it.</p>;

  return (
    <div className="space-y-3">
      {list.map((e) => (
        <div key={e.id} className="rounded-[20px] bg-[var(--surface)] lift p-3 flex items-center gap-3" data-testid="kept-expense">
          {e.photo ? <img src={URL.createObjectURL(e.photo)} alt="" className="h-14 w-14 rounded-xl object-cover bg-[var(--surface-2)]" /> : <span className="h-14 w-14 rounded-xl bg-[var(--surface-2)] inline-flex items-center justify-center" aria-hidden="true"><Receipt size={18} /></span>}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium truncate">{e.what}</p>
            <p className="text-[13px] text-[var(--ink-muted)]">{e.spentOn}</p>
          </div>
          <span className="text-[15px] font-semibold tabular">{Number(e.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          <button type="button" onClick={() => forget(e.id).then(refresh)} aria-label={`Remove ${e.what}`} className="h-9 w-9 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <label className={BOX}>
        <span className="block text-[12px] text-[var(--ink-muted)]">A note for whoever approves (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Site visit, 12 to 14 September" className={INPUT} />
      </label>
      <button type="button" onClick={send} disabled={sending} className="w-full h-14 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60" data-testid="send-claim">
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Send {list.length} as a claim · {total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </button>
    </div>
  );
}

const STATUS = { submitted: "Waiting for approval", approved: "Approved, owed to you", part_paid: "Part paid to you", rejected: "Sent back", paid: "Paid to you" };

function Sent() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { data, isLoading } = useQuery({ queryKey: ["myClaims", companyId], queryFn: () => apiClient.get("/claims").then((r) => r.data.claims), enabled: Boolean(companyId) });
  const mine = (data || []).filter((c) => !c.claimantId || c.claimantId === user?.id);
  if (isLoading) return <Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" />;
  if (!mine.length) return <p className="rounded-[20px] bg-[var(--surface)] lift px-5 py-8 text-center text-[15px] text-[var(--ink-muted)]">No claims sent yet.</p>;
  return (
    <ul className="space-y-3" data-testid="sent-claims">
      {mine.map((c) => (
        <li key={c.id} className="rounded-[20px] bg-[var(--surface)] lift px-4 py-3.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{c.number}</p>
            <p className="text-[13px] text-[var(--ink-muted)]">{STATUS[c.status] || c.status}</p>
          </div>
          <span className="text-[15px] font-semibold tabular">{c.total}</span>
        </li>
      ))}
    </ul>
  );
}
