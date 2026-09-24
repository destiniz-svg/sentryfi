import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Printer } from "lucide-react";
import { PayslipView } from "@/pages/Payslip";
import { SharedFiles } from "@/components/documents/Attachments";
import { apiClient } from "@/api/client";
import { FittedPaper } from "@/components/documents/DocumentPaper";
import { PrintCopy } from "@/components/documents/PrintCopy";
import { compose, templateWith, KIND_LABEL } from "@/lib/documents";

/**
 * One document from a private link: a purchase order to a supplier (which
 * they can confirm here), a delivery note, a credit note, a receipt, a
 * statement, or a person's payslip, drawn exactly as the company sent it.
 * No account needed; printable.
 */
export default function Shared() {
  const { token } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ["shared", token], queryFn: () => apiClient.get(`/shared/${token}`).then((r) => r.data), retry: false });
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  if (!isLoading && data?.kind === "payslip") {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-end mb-4">
            <button type="button" onClick={() => window.print()} className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px] print:hidden">
              <Printer size={15} /> Print or PDF
            </button>
          </div>
          <PayslipView p={data.payslip} />
          <p className="mt-6 text-[12px] text-[var(--ink-muted)] print:hidden">Your payslip, from {data.payslip.company.name}. This link is for you alone; please do not share it.</p>
        </div>
      </main>
    );
  }
  if (isLoading) return <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--ink-muted)]">Opening…</main>;
  if (error)
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <p role="alert" className="max-w-sm text-[15px]">{error.message || "This link has been turned off, or is not complete. Ask for a new one."}</p>
      </main>
    );
  const verifyUrl = data.issuedCopy ? `${window.location.origin}/v/${data.issuedCopy.sha256}` : null;
  const model = compose({ data: data.data, brand: data.brand, template: data.template, size: templateWith(data.template).size === "a5" ? "a5" : "a4", verifyUrl });
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[13px] uppercase tracking-[0.12em] font-display font-bold text-[var(--ink-muted)]">{data.brand?.name || data.brand?.legalName}</div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight mt-1">
              {KIND_LABEL[data.kind]} {data.data.number}
            </h1>
          </div>
          <button type="button" onClick={() => setPrinting(true)} className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--surface)] inline-flex items-center gap-2 text-[14px]">
            <Printer size={15} /> Print or PDF
          </button>
        </div>
        <div className="rounded-2xl bg-[var(--surface-2)] p-2 sm:p-4" data-testid="shared-paper">
          <FittedPaper model={model} />
        </div>
        <SharedFiles files={data.files} base={`/shared/${token}/files`} />
        {data.kind === "purchase_order" && <Confirm token={token} done={data.confirmation} />}
        <p className="mt-6 text-[12px] text-[var(--ink-muted)]">Sent by {data.brand?.legalName || data.brand?.name} from Sentryfi. This link is for you; please do not share it.</p>
      </div>
      {printing && <PrintCopy model={model} />}
    </main>
  );
}

/** A supplier's yes to a purchase order: who, when it will come, and anything to say. */
function Confirm({ token, done }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", expectedOn: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const FIELD = "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)]";
  if (done) {
    return (
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex items-start gap-3" data-testid="po-confirmed">
        <Check size={18} className="text-[var(--success)] mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[15px]">
          Confirmed by {done.by} on {new Date(done.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {done.expected ? `, to arrive by ${new Date(done.expected + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}.
          {done.note ? <span className="block text-[14px] text-[var(--ink-muted)] mt-1">{done.note}</span> : null}
        </p>
      </section>
    );
  }
  async function go(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiClient.post(`/shared/${token}/confirm`, { name: f.name, expectedOn: f.expectedOn || null, note: f.note || null });
      qc.invalidateQueries({ queryKey: ["shared", token] });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={go} className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 grid gap-3" data-testid="po-confirm">
      <div>
        <h2 className="text-[16px] font-semibold">Confirm this order</h2>
        <p className="text-[14px] text-[var(--ink-muted)] mt-0.5">Let them know you have it, and when it will come.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input aria-label="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name" className={FIELD} />
        <label className="grid gap-1">
          <span className="text-[13px] text-[var(--ink-muted)]">Delivery by (optional)</span>
          <input type="date" aria-label="Delivery by" value={f.expectedOn} onChange={(e) => setF({ ...f, expectedOn: e.target.value })} className={FIELD} />
        </label>
      </div>
      <input aria-label="A note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="A note (optional): part now, the rest next week" className={FIELD} />
      {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
      <div>
        <button type="submit" disabled={busy || f.name.trim().length < 2} className="h-11 px-5 rounded-full bg-[var(--ink)] text-[var(--bg)] text-[14px] font-medium inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirm the order
        </button>
      </div>
    </form>
  );
}
