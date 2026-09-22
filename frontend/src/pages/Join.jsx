import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthShell, AuthField, AuthPrimaryButton, AuthErrorBanner } from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import { apiClient } from "@/api/client";
import { ROLE_TEXT } from "@/components/settings/PeopleSection";

/**
 * Where a join link lands.
 *
 * Someone new sets their name and a password; someone who already signs in to
 * Sentryfi enters their password to add this company to the ones they keep.
 * Either way they arrive in the company's books, signed in.
 */
export default function Join() {
  const { token } = useParams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: invite, error, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => apiClient.get(`/invites/${token}`).then((r) => r.data),
    retry: false,
  });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/invites/${token}/accept`, { name: name.trim() || null, password });
      try {
        window.localStorage.setItem("sentryfi.company", data.companyId);
      } catch {
        // The first company is chosen anyway if this cannot be remembered.
      }
      // A full load, so every screen starts from the new session and company.
      window.location.assign("/dashboard");
    } catch (ex) {
      setErr(ex.message || "That did not work.");
      setBusy(false);
    }
  }

  return (
    <AuthShell headline={<>Every bill, recorded within minutes of arriving.</>} subhead="Someone has asked you to help keep their books.">
      <div className="mb-12">
        <AILogo size={48} />
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-[var(--ink-muted)]">
          <Loader2 size={15} className="animate-spin" /> Reading the invitation.
        </p>
      ) : error ? (
        <>
          <h1 className="font-display text-[34px] font-semibold tracking-tight leading-[1.05]">That link does not work</h1>
          <p role="alert" className="text-[var(--ink-muted)] mt-3 text-[15px]">
            {error.message}
          </p>
          <Link to="/login" className="inline-block mt-8 font-semibold underline underline-offset-2">
            Sign in instead
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-[34px] font-semibold tracking-tight leading-[1.05]">Join {invite.company}</h1>
          <p className="text-[var(--ink-muted)] mt-2 text-[15px]">
            As {ROLE_TEXT[invite.role]?.label.toLowerCase() || invite.role}: {ROLE_TEXT[invite.role]?.does.toLowerCase()}
          </p>

          <form onSubmit={onSubmit} className="mt-9 space-y-4">
            <p className="text-[15px]">
              Signing in as <strong>{invite.email}</strong>
            </p>
            {!invite.hasAccount && (
              <AuthField label="Your name" autoComplete="name" value={name} onChange={setName} placeholder="Hassan Ali" />
            )}
            <AuthField
              label={invite.hasAccount ? "Your Sentryfi password" : "Choose a password"}
              type="password"
              autoComplete={invite.hasAccount ? "current-password" : "new-password"}
              value={password}
              onChange={setPassword}
              placeholder={invite.hasAccount ? "••••••••" : "At least 8 characters"}
            />
            <AuthErrorBanner>{err}</AuthErrorBanner>
            <div className="pt-1">
              <AuthPrimaryButton type="submit" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <>Join <ArrowRight size={15} /></>}
              </AuthPrimaryButton>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
