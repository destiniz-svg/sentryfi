import { useState } from "react";
import { Loader2, Share2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { companiesApi } from "@/api/companies";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * Who is in these books, and what each of them may do.
 *
 * Roles are in plain words, because the person choosing is the owner, not an
 * IT department. Someone with a Sentryfi login is added at once; anyone else
 * gets a link to send however they like, which lets them set their own
 * password. Nobody chooses a password for somebody else.
 */

export const ROLE_TEXT = {
  administrator: { label: "Administrator", does: "Everything, including people and settings" },
  accountant: { label: "Accountant", does: "Records, corrects and closes the books" },
  manager: { label: "Manager", does: "Records bills and invoices" },
  approver: { label: "Approver", does: "Approves what others record" },
  viewer: { label: "Viewer", does: "Reads the figures, changes nothing" },
  auditor: { label: "Auditor", does: "Reads everything, including the trail" },
  site_staff: { label: "Site staff", does: "Photographs bills, and nothing else" },
  cash_holder: { label: "Cash holder", does: "Holds a cash box: spends from it and counts it" },
  procurement: { label: "Procurement", does: "Orders and receives" },
};

const CHANGE_TEXT = {
  added: "added as",
  removed: "no longer",
  invited: "invited as",
  invite_withdrawn: "invitation withdrawn:",
  joined: "joined as",
};

const SELECT =
  "h-11 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]";

const when = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PeopleSection() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["people", companyId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: companiesApi.people, enabled: Boolean(companyId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("site_staff");
  const [link, setLink] = useState(null);
  const [err, setErr] = useState("");

  const add = useMutation({ mutationFn: companiesApi.addPerson, onSuccess: refresh });
  const remove = useMutation({ mutationFn: ({ userId, role }) => companiesApi.removeRole(userId, role), onSuccess: refresh });
  const withdraw = useMutation({ mutationFn: companiesApi.withdrawInvite, onSuccess: refresh });

  const manage = can("manage_people");
  const admins = data?.members.filter((m) => m.roles.includes("administrator")).length || 0;

  async function onAdd(e) {
    e.preventDefault();
    setErr("");
    setLink(null);
    try {
      const r = await add.mutateAsync({ email: email.trim(), role });
      if (r.added) toast.success(`${r.name} is in`, `As ${ROLE_TEXT[role].label.toLowerCase()}. They see it next time they open Sentryfi.`);
      else setLink({ url: `${window.location.origin}/join/${r.token}`, email: email.trim() });
      setEmail("");
    } catch (ex) {
      setErr(ex.message || "They could not be added.");
    }
  }

  async function share() {
    const text = `Join our books on Sentryfi: ${link.url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Sentryfi", text });
      else {
        await navigator.clipboard.writeText(link.url);
        toast.success("Link copied", "Paste it into WhatsApp or an email.");
      }
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  async function act(fn, done) {
    try {
      await fn();
      toast.success(done);
    } catch (ex) {
      toast.error("That did not work", ex.message);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center py-16 justify-center text-[var(--ink-muted)]">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base">People</CardTitle>
            <CardDescription className="mt-1">Everyone who can open these books, and what each may do.</CardDescription>
          </div>
        </CardHeader>
        <ul className="divide-y divide-[var(--border)]" data-testid="people-list">
          {data.members.map((m) => (
            <li key={m.user_id} className="py-3">
              <div className="text-[15px] font-medium">
                {m.name}
                {m.user_id === data.you.id && <span className="text-[var(--ink-muted)] font-normal"> · you</span>}
              </div>
              <div className="text-[13px] text-[var(--ink-muted)] break-all">{m.email}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {m.roles.map((r) => (
                  <span
                    key={r}
                    title={ROLE_TEXT[r]?.does}
                    className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-[var(--border)] text-[13px]"
                  >
                    {ROLE_TEXT[r]?.label || r}
                    {manage && !(r === "administrator" && admins <= 1) && (
                      <button
                        type="button"
                        aria-label={`Take ${ROLE_TEXT[r]?.label || r} away from ${m.name}`}
                        onClick={() => act(() => remove.mutateAsync({ userId: m.user_id, role: r }), `${m.name} is no longer ${ROLE_TEXT[r]?.label.toLowerCase()}`)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface-2)]"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {data.invites.map((i) => (
            <li key={i.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] break-all">{i.email}</div>
                <div className="text-[13px] text-[var(--ink-muted)]">
                  Invited as {ROLE_TEXT[i.role]?.label.toLowerCase()} · link works until {when(i.expires_at)}
                </div>
              </div>
              {manage && (
                <Button variant="outline" onClick={() => act(() => withdraw.mutateAsync(i.id), "Invitation withdrawn")}>
                  Withdraw
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {manage && (
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base">Add someone</CardTitle>
              <CardDescription className="mt-1">
                If they already use Sentryfi they are in straight away. Otherwise you get a link to send them.
              </CardDescription>
            </div>
          </CardHeader>
          <form onSubmit={onAdd} className="space-y-4">
            <div>
              <label htmlFor="person-email" className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block">
                Their email
              </label>
              <Input id="person-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hassan@example.com" />
            </div>
            <div>
              <label htmlFor="person-role" className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block">
                What they may do
              </label>
              <select id="person-role" value={role} onChange={(e) => setRole(e.target.value)} className={SELECT}>
                {Object.entries(ROLE_TEXT).map(([value, r]) => (
                  <option key={value} value={value}>
                    {r.label}: {r.does}
                  </option>
                ))}
              </select>
            </div>
            {err && (
              <p role="alert" className="text-[13px] text-[var(--danger)]">
                {err}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={add.isPending || !email.trim()}>
                {add.isPending && <Loader2 size={14} className="animate-spin" />}
                Add
              </Button>
            </div>
          </form>

          {link && (
            <div className="mt-5 pt-5 border-t border-[var(--border)] space-y-3" data-testid="invite-link">
              <p className="text-[14px]">
                Send this to <strong className="break-all">{link.email}</strong>. It works once, for seven days.
              </p>
              <Input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Join link" className="tabular" />
              <Button type="button" variant="accent" onClick={share}>
                <Share2 size={15} /> Send the link
              </Button>
            </div>
          )}
        </Card>
      )}

      {data.changes.length > 0 && (
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base">Changes</CardTitle>
              <CardDescription className="mt-1">Who was given what, and by whom. Kept for good.</CardDescription>
            </div>
          </CardHeader>
          <ul className="space-y-2 text-[13px]" data-testid="people-changes">
            {data.changes.map((c, n) => (
              <li key={n}>
                <span className="text-[var(--ink-muted)] tabular">{when(c.at)}</span> · {c.email} {CHANGE_TEXT[c.change]}{" "}
                {ROLE_TEXT[c.role]?.label.toLowerCase()}
                {c.by_name && <span className="text-[var(--ink-muted)]"> · by {c.by_name}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
