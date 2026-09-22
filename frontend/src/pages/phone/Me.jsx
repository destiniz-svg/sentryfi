import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { authApi } from "@/api/auth";
import { RecordBill } from "@/components/bills/RecordBill";

/**
 * "More", for someone who works in the field.
 *
 * Settings is the company's: its profile, its people, its tax. Site staff and
 * tin holders have no business there, so their More is only about them: who
 * they are signed in as, which company's books they are feeding, their
 * password, and signing out.
 */

const FIELD =
  "w-full h-[52px] px-4 bg-[var(--surface)] text-[var(--ink)] text-[17px] border-2 border-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]";

export default function Me() {
  const { user, logout } = useAuth();
  const { companies, companyId, choose } = useCompany();
  const toast = useToast();
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [snapping, setSnapping] = useState(false);

  async function onPassword(e) {
    e.preventDefault();
    setErr("");
    if (next.length < 8) return setErr("A new password needs at least eight characters.");
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      toast.success("Password changed");
      setCurrent("");
      setNext("");
    } catch (ex) {
      setErr(ex.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await logout();
    nav("/login");
  }

  const first = (user?.name || "").split(" ")[0] || "You";

  return (
    <PhoneShell heading="Signed in as" unit="" figure={first} position={user?.email || ""} sync="" onSnap={() => setSnapping(true)}>
      {companies.length > 1 && (
        <>
          <div className="phone-section">
            <span className="phone-section-h">Whose books</span>
          </div>
          <div className="px-5 flex flex-col gap-2">
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                className="phone-do"
                aria-pressed={c.id === companyId}
                onClick={() => {
                  choose(c.id);
                  toast.success(`Now in ${c.name}`);
                }}
              >
                {c.id === companyId ? `✓ ${c.name}` : c.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="phone-section">
        <span className="phone-section-h">Password</span>
      </div>
      <form onSubmit={onPassword} className="px-5 flex flex-col gap-3">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Current password</span>
          <input id="me-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">New password</span>
          <input id="me-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={FIELD} />
        </label>
        {err && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--danger)" }}>
            {err}
          </p>
        )}
        <button type="submit" className="phone-do" disabled={busy || !current || !next}>
          {busy ? "Changing it" : "Change password"}
        </button>
      </form>

      <div className="px-5 pt-6 pb-4">
        <button type="button" className="phone-do" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}
