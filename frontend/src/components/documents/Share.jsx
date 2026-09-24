import { useState } from "react";
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/UIContext";

/**
 * Sending a document: a private link, then however it is sent. Copy it,
 * WhatsApp it (to the customer's number when there is one), hand it to the
 * phone's own share sheet (Viber, Telegram, Messages), or email it from here.
 *
 * A customer's invoice, quote, proforma or retainer opens on their page, at
 * that document, where they can accept it, ask about it and see how to pay.
 * Anything else opens on its own, read-only.
 */

const ON_PAGE = ["invoice", "quote", "proforma", "retainer"];
const FIELD = "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)]";

/** Digits of a phone number as WhatsApp takes them: a Maldivian seven-digit number gets 960 in front. */
function waNumber(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 7 ? `960${d}` : d;
}

export function ShareDocument({ kind, id, number, to, onClose }) {
  const toast = useToast();
  const [made, setMade] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState(to?.email || "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function make() {
    setBusy(true);
    try {
      const r = await apiClient.post(`/share/${kind}/${id}`, { how: "link" });
      setMade(r.data);
      return r.data;
    } catch (ex) {
      toast.error("No link made", ex.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const link = async () => made || (await make());

  async function copy() {
    const m = await link();
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy", "Select the link and copy it by hand.");
    }
  }
  async function whatsapp() {
    const m = await link();
    if (!m) return;
    window.open(`https://wa.me/${waNumber(to?.phone)}?text=${encodeURIComponent(`${m.text}\n${m.url}`)}`, "_blank", "noopener");
  }
  async function native() {
    const m = await link();
    if (!m) return;
    try {
      await navigator.share({ title: number, text: m.text, url: m.url });
    } catch {
      /* closed without sharing */
    }
  }
  async function send(e) {
    e.preventDefault();
    setSending(true);
    try {
      const r = await apiClient.post(`/share/${kind}/${id}`, { how: "email", to: email.trim() || undefined, note: note.trim() || undefined });
      setMade(r.data);
      toast.success(`${number} sent to ${r.data.to}`, "Replies come to your company's address.");
      onClose();
    } catch (ex) {
      toast.error("Not sent", ex.message);
    } finally {
      setSending(false);
    }
  }

  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Modal
      open
      onClose={onClose}
      title={`Send ${number}`}
      description={
        ON_PAGE.includes(kind)
          ? `A private link to ${to?.name || "the customer"}'s page, open at this document: they can ${kind === "invoice" ? "see what is still to pay" : "accept it"} and ask about it there.`
          : `A private link to this document alone, for ${to?.name || "whoever you send it to"}. They can print it or save it as a PDF.`
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="share-ways">
        <Button variant="outline" onClick={copy} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="outline" onClick={whatsapp} disabled={busy}>
          <MessageCircle size={15} /> WhatsApp
        </Button>
        {canNative && (
          <Button variant="outline" onClick={native} disabled={busy}>
            <Share2 size={15} /> Viber, more…
          </Button>
        )}
      </div>
      {made && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2">
          <Link2 size={14} className="shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
          <input readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label="The link" className="flex-1 min-w-0 bg-transparent text-[13px] tabular outline-none" />
        </div>
      )}
      <form onSubmit={send} className="mt-5 pt-4 border-t border-[var(--border)] grid gap-2">
        <span className="text-sm font-medium">Or email it</span>
        <input type="email" aria-label="Email to" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="accounts@customer.mv" className={FIELD} />
        <textarea aria-label="A note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder="A note (optional)" className={`${FIELD} h-auto min-h-[64px] py-2.5`} />
        <Button type="submit" variant="accent" disabled={sending || !email.trim()}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={15} />} {email.trim() ? `Email to ${email.trim()}` : "Add their email"}
        </Button>
      </form>
    </Modal>
  );
}
