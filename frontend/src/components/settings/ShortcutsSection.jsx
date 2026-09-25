import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ShortcutsEditor } from "@/components/mobile/Shortcuts";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { apiClient } from "@/api/client";
import { ROLE_TEXT } from "@/lib/roles";
import { SHORTCUTS, roleMay } from "@/lib/shortcuts";

/** Your own shortcuts, the same editor as on the Record sheet. */
export function MyShortcutsSection() {
  const toast = useToast();
  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Record shortcuts</CardTitle>
          <CardDescription className="mt-1">
            What sits on the phone&apos;s Record button, under Photograph a bill and Say it. Kept on your account, so every phone and tablet you use shows the same.
          </CardDescription>
        </div>
      </CardHeader>
      <ShortcutsEditor onDone={() => toast.success("Shortcuts saved", "They are on your Record button now.")} />
    </Card>
  );
}

/**
 * Which shortcuts each role may put on its Record sheet. A role only ever sees
 * shortcuts its permissions allow; this narrows them further. A role never
 * changed here keeps all of its own.
 */
export function RoleShortcutsSection() {
  const { company, roleCan, companyId } = useCompany();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!roleCan) return null;
  const rules = company?.shortcutRules || {};
  const roles = Object.keys(ROLE_TEXT).filter((r) => roleCan[r] && SHORTCUTS.some((s) => roleMay(roleCan[r], s)));

  async function toggle(role, key) {
    const could = SHORTCUTS.filter((s) => roleMay(roleCan[role], s)).map((s) => s.key);
    const now = rules[role] || could;
    const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
    setBusy(true);
    try {
      await apiClient.put("/companies/current/shortcut-rules", { rules: { ...rules, [role]: next } });
      await qc.invalidateQueries({ queryKey: ["company-context", companyId] });
    } catch (ex) {
      toast.error("Not changed", ex.message);
    }
    setBusy(false);
  }

  return (
    <Card padding="lg" data-testid="role-shortcuts">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Record shortcuts by role</CardTitle>
          <CardDescription className="mt-1">
            Which shortcuts people in each role may put on the phone&apos;s Record button. A role is only offered what its permissions allow; untick to take one away from everyone in it.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-2">
        {roles.map((r) => {
          const could = SHORTCUTS.filter((s) => roleMay(roleCan[r], s));
          const on = (k) => !rules[r] || rules[r].includes(k);
          const count = could.filter((s) => on(s.key)).length;
          return (
            <details key={r} className="group rounded-2xl border border-[var(--border)] px-3.5 py-2.5 open:pb-3.5">
              <summary className="flex items-center gap-3 cursor-pointer list-none min-h-[40px]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{ROLE_TEXT[r].label}</span>
                  <span className="block text-[13px] text-[var(--ink-muted)]">{could.length === 1 ? (count ? "Its 1 shortcut" : "No shortcuts") : count === could.length ? `All ${could.length} shortcuts` : `${count} of ${could.length} shortcuts`}</span>
                </span>
                <span aria-hidden="true" className="text-[var(--ink-muted)] transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="flex flex-wrap gap-2 mt-2.5" role="group" aria-label={`Shortcuts for ${ROLE_TEXT[r].label}`}>
                {could.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on(s.key)}
                    disabled={busy}
                    onClick={() => toggle(r, s.key)}
                    className={`h-9 px-3.5 rounded-full border text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60 ${on(s.key) ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--ink)]"}`}
                  >
                    <s.icon size={14} aria-hidden="true" />
                    {s.name}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
