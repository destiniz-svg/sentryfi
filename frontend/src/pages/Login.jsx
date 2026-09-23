import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Fingerprint } from "lucide-react";
import {
  AuthShell,
  AuthField,
  AuthPrimaryButton,
  AuthErrorBanner,
} from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import { useAuth } from "@/context/AuthContext";
import { startAuthentication } from "@simplewebauthn/browser";
import { apiClient } from "@/api/client";
import { passkeysWork } from "@/components/settings/DevicesSection";



export default function Login() {
  const { login, refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Face ID or a fingerprint: the phone proves it holds the key it made when
  // it was added in Settings. Nothing to type, nothing to phish.
  async function onPasskey() {
    setErr("");
    setLoading(true);
    try {
      const optionsJSON = (await apiClient.post("/passkeys/login/options")).data;
      const response = await startAuthentication({ optionsJSON });
      await apiClient.post("/passkeys/login", { response });
      await refresh();
      nav("/dashboard");
    } catch (e) {
      if (e?.name !== "NotAllowedError") setErr(e.message || "That did not work. Sign in with your password.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(form);
      nav("/dashboard");
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline={
        <>
          Every bill, recorded within minutes of arriving.
        </>
      }
      subhead="Whoever is holding the bill photographs it. The books stay right while you get on with the job, and the tax return is ready before the deadline rather than after it."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-12">
          <AILogo size={48} />
        </div>

        <h1 className="font-display text-[34px] font-semibold tracking-tight text-[var(--ink)] leading-[1.05]">
          Welcome back
        </h1>
        <p className="text-[var(--ink-muted)] mt-2 text-[15px]">
          Sign in to Altura's books.
        </p>

        <form onSubmit={onSubmit} className="mt-9 space-y-4">
          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="you@example.com"
          />

          <AuthField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="••••••••"

          />

          <AuthErrorBanner>{err}</AuthErrorBanner>

          <div className="pt-1">
            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={15} />
                </>
              )}
            </AuthPrimaryButton>
            {passkeysWork() && (
              <button
                type="button"
                onClick={onPasskey}
                disabled={loading}
                className="w-full mt-2 h-12 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] font-medium inline-flex items-center justify-center gap-2"
              >
                <Fingerprint size={17} aria-hidden="true" /> Sign in with Face ID or fingerprint
              </button>
            )}
          </div>

          <p className="text-[14px]">
            <Link to="/forgot" className="text-[var(--accent-strong)] font-semibold hover:underline">
              Forgot your password?
            </Link>
          </p>
        </form>

        <div className="text-sm text-[var(--ink-muted)] text-center mt-8">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-[var(--accent-strong)] font-semibold hover:underline"
          >
            Create one
          </Link>
        </div>
      </motion.div>
    </AuthShell>
  );
}
