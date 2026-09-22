import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

/**
 * A password reset link an administrator handed over. It says whose it is,
 * takes a new password once, ends every other session, and signs them in.
 */
export default function Reset() {
  const { token } = useParams();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ["reset", token],
    queryFn: () => apiClient.get(`/auth/reset/${token}`).then((r) => r.data),
    retry: false,
  });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) return setErr("Use at least eight characters.");
    if (password !== again) return setErr("The two do not match.");
    setBusy(true);
    try {
      await apiClient.post(`/auth/reset/${token}`, { password });
      await refresh();
      nav("/dashboard");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const FIELD =
    "w-full h-12 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[16px] outline-none focus:border-[var(--ink)]";

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-[30px] font-bold tracking-tight">A new password</h1>
        {isLoading ? (
          <p className="mt-3 text-[var(--ink-muted)]">Reading the link…</p>
        ) : error ? (
          <p className="mt-3" role="alert">
            {error.message || "That link has been used or has run out. Ask your administrator for a new one."}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <p className="text-[15px] text-[var(--ink-muted)]">For {data.name}. Every other place you are signed in will be signed out.</p>
            <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className={FIELD} />
            <input id="reset-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="The same again" className={FIELD} />
            {err && (
              <p role="alert" className="text-[14px] text-[var(--danger)]">
                {err}
              </p>
            )}
            <button type="submit" disabled={busy} className="w-full h-12 rounded-[var(--radius-control)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold inline-flex items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Set it and sign in
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
