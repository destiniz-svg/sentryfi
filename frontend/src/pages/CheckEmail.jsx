import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

/**
 * Signed up, address not yet confirmed. Nothing else opens until it is, so
 * nobody can take an address that is not theirs.
 */
export default function CheckEmail() {
  const { user, refresh, logout } = useAuth();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await apiClient.post("/auth/verify/resend");
      setNote("Sent again. It can take a minute or two.");
    } catch (ex) {
      setNote(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <Mail size={32} className="text-[var(--ink-muted)]" aria-hidden="true" />
        <h1 className="mt-4 font-display text-[30px] font-bold tracking-tight">Check your email</h1>
        <p className="mt-3 text-[15px]">
          We sent a link to <strong className="break-all">{user.email}</strong>. Tap it to confirm the address is yours, and your books
          open.
        </p>
        <p className="mt-2 text-[14px] text-[var(--ink-muted)]">Not there? Look in spam. The link works for three days.</p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="w-full h-12 rounded-[var(--radius-control)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold"
          >
            I've confirmed it
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="w-full h-12 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] font-medium inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={15} className="animate-spin" />} Send the link again
          </button>
        </div>
        {note && (
          <p className="mt-3 text-[14px]" role="status">
            {note}
          </p>
        )}
        <p className="mt-6 text-[14px] text-[var(--ink-muted)]">
          Wrong address?{" "}
          <button type="button" onClick={logout} className="text-[var(--accent-strong)] font-semibold hover:underline">
            Sign out and start again
          </button>
        </p>
      </div>
    </main>
  );
}
