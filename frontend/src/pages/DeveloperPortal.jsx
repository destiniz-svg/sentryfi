import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowRight, Loader2, LogOut } from "lucide-react";
import { ThemeProvider } from "@/context/ThemeContext";
import { UIProvider } from "@/context/UIContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AuthShell, AuthField, AuthPrimaryButton, AuthErrorBanner } from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import CheckEmail from "@/pages/CheckEmail";
import Developer from "@/pages/Developer";

/**
 * The developer portal, dev.sentryfi.app: the whole page on that host. Its own
 * sign-in (the session cookie belongs to this host alone), no company, no
 * onboarding, no app around it: who signed up, their trials, and what was done.
 */

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });

export default function PortalApp() {
  useEffect(() => {
    document.title = "Sentryfi Developer";
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UIProvider>
          <AuthProvider>
            <Portal />
          </AuthProvider>
        </UIProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function Portal() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg)]">
        <Loader2 className="animate-spin text-[var(--ink-muted)]" aria-label="Loading" />
      </div>
    );
  }
  if (!user) return <SignIn />;
  if (user.mustVerify) return <CheckEmail />;
  if (!user.platformAdmin) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg)] px-5">
        <div className="max-w-[420px]">
          <AILogo size={40} />
          <h1 className="mt-6 font-display text-[28px] font-semibold tracking-tight">This is for the people who run Sentryfi.</h1>
          <p className="mt-2 text-[15px] text-[var(--ink-muted)]">{user.email} is not one of them. Your books are at sentryfi.app.</p>
          <div className="mt-6 flex gap-3">
            <a href="https://sentryfi.app" className="h-11 px-5 inline-flex items-center rounded-full bg-[var(--ink)] text-[var(--bg)] text-[14px] font-medium">
              Go to Sentryfi
            </a>
            <button type="button" onClick={logout} className="h-11 px-5 rounded-full border border-[var(--border)] text-[14px] font-medium">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-40 bg-[var(--ink)] text-[var(--bg)]">
        <div className="mx-auto max-w-[1440px] h-14 px-4 sm:px-6 md:px-8 flex items-center gap-3">
          <AILogo size={26} />
          <span className="font-display text-[20px] font-semibold tracking-[-.02em]">Sentryfi</span>
          <span className="h-6 px-2 inline-flex items-center bg-[#F2C300] text-[#141414] font-display text-[12px] font-bold uppercase tracking-[.12em]">Developer</span>
          <span className="ml-auto hidden sm:block text-[13px] opacity-80 truncate">{user.email}</span>
          <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-white/10">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-8 py-6 md:py-8">
        <Developer />
      </main>
    </div>
  );
}

function SignIn() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(form);
    } catch (ex) {
      setErr(ex.message || "That did not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell headline={<>The developer portal.</>} subhead="Who signed up for Sentryfi, where each trial stands, and everything done here, kept with who did it.">
      <div className="mb-12">
        <AILogo size={48} />
      </div>
      <h1 className="font-display text-[34px] font-semibold tracking-tight text-[var(--ink)] leading-[1.05]">Developer sign-in</h1>
      <p className="text-[var(--ink-muted)] mt-2 text-[15px]">For the people who run Sentryfi. Customers sign in at sentryfi.app.</p>
      <form onSubmit={onSubmit} className="mt-9 space-y-4">
        <AuthField label="Email" type="email" autoComplete="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="dev@sentryfi.app" />
        <AuthField label="Password" type="password" autoComplete="current-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
        <AuthErrorBanner>{err}</AuthErrorBanner>
        <div className="pt-1">
          <AuthPrimaryButton type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Signing in
              </>
            ) : (
              <>
                Sign in <ArrowRight size={15} />
              </>
            )}
          </AuthPrimaryButton>
        </div>
      </form>
      <p className="text-sm text-[var(--ink-muted)] mt-8">
        Forgotten the password?{" "}
        <a href="https://sentryfi.app/forgot" className="text-[var(--accent-strong)] font-semibold hover:underline">
          Reset it
        </a>
      </p>
    </AuthShell>
  );
}
