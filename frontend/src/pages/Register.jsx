import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  AuthShell,
  AuthField,
  AuthPrimaryButton,
  AuthErrorBanner,
} from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import { useAuth } from "@/context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await register(form);
      nav("/dashboard");
    } catch (e) {
      setErr(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline={<>One place the books are kept.</>}
      subhead="Bills, cash boxes, the bank and the tax return, in one set of books that add up. Built for Altura first."
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
          Get started
        </h1>
        <p className="text-[var(--ink-muted)] mt-2 text-[15px]">
          Accounts are for people working on Altura's books. Nothing here
          records real money yet.
        </p>

        <form onSubmit={onSubmit} className="mt-9 space-y-4">
          <AuthField
            label="Full name"
            autoComplete="name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Ada Lovelace"
          />

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
            autoComplete="new-password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="At least 8 characters"
            minLength={8}
          />

          <AuthErrorBanner>{err}</AuthErrorBanner>

          <div className="pt-1">
            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account <ArrowRight size={15} />
                </>
              )}
            </AuthPrimaryButton>
          </div>
        </form>

        <div className="text-sm text-[var(--ink-muted)] text-center mt-8">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[var(--accent-strong)] font-semibold hover:underline"
          >
            Sign in
          </Link>
        </div>

        {/* This said "you agree to our terms" and "we never share your billing
            data with third parties". There are no terms to agree to, and there
            is no billing. Both were the purchased product's, and a promise
            about data nobody holds is worth less than nothing. */}
        <p className="text-[13px] text-[var(--ink-muted)] text-center mt-6 leading-relaxed">
          Your books stay in your own company's records. Nothing is shared with
          anyone outside it.
        </p>
      </motion.div>
    </AuthShell>
  );
}
