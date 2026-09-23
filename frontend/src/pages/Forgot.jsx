import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";

const FIELD =
  "w-full h-12 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[16px] outline-none focus:border-[var(--ink)]";
const BUTTON =
  "w-full h-12 rounded-[var(--radius-control)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold inline-flex items-center justify-center gap-2";

/** Forgot password: asks for the address and emails a link to set a new one. */
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await apiClient.post("/auth/forgot", { email });
      setSent(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-[30px] font-bold tracking-tight">Forgot your password?</h1>
        {sent ? (
          <div className="mt-3 space-y-3 text-[15px]" role="status">
            <p>
              If <strong className="break-all">{email}</strong> has a Sentryfi account, a link to set a new password is on its way. It
              works once, for an hour.
            </p>
            <p className="text-[var(--ink-muted)]">Nothing after a few minutes? Look in spam, or check the address and try again.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <p className="text-[15px] text-[var(--ink-muted)]">Enter the email you sign in with. We will send you a link.</p>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={FIELD}
            />
            {err && (
              <p role="alert" className="text-[14px] text-[var(--danger)]">
                {err}
              </p>
            )}
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy && <Loader2 size={15} className="animate-spin" />} Email me a link
            </button>
          </form>
        )}
        <p className="mt-6 text-[14px]">
          <Link to="/login" className="text-[var(--accent-strong)] font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
