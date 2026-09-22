import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";

/**
 * The companies whose books this person keeps, and opening another.
 *
 * Each company's books are walled off from every other's in the database, so
 * switching changes which books every screen reads and writes. A new company
 * starts with the same small chart the first one did, and with you as its
 * administrator.
 */
export function CompaniesSection() {
  const { companies, companyId, choose, open } = useCompany();
  const toast = useToast();
  const [name, setName] = useState("");
  const [gst, setGst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onOpen(e) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("What is the company called?");
    setErr("");
    setBusy(true);
    try {
      const c = await open({ name: name.trim(), gstNumber: gst.trim() || undefined, gstRegistered: Boolean(gst.trim()) });
      toast.success(`${c.name} is open`, "You are now in its books. Everything you do here is in these books until you switch back.");
      setName("");
      setGst("");
    } catch (ex) {
      setErr(ex.message || "Those books could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base">Your companies</CardTitle>
            <CardDescription className="mt-1">Each has its own books. Nothing crosses from one to another.</CardDescription>
          </div>
        </CardHeader>
        <ul className="divide-y divide-[var(--border)]" data-testid="company-list">
          {companies.map((c) => {
            const here = c.id === companyId;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[15px] font-medium">{c.name}</span>
                {here ? (
                  <span className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-muted)]">
                    <Check size={14} /> You are here
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      choose(c.id);
                      toast.success(`Now in ${c.name}`, "Every screen shows these books until you switch again.");
                    }}
                  >
                    Switch to {c.name}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base">Open another company</CardTitle>
            <CardDescription className="mt-1">Its own books, with you as administrator. You switch into it straight away.</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={onOpen} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">Company name</span>
            <Input id="new-company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enricher Holdings Pvt Ltd" />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">GST number, if registered</span>
            <Input id="new-company-gst" value={gst} onChange={(e) => setGst(e.target.value)} placeholder="1234567GST501" className="tabular" />
          </label>
          {err && (
            <p role="alert" className="sm:col-span-2 text-[13px] text-[var(--danger)]">
              {err}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="accent" disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Open {name.trim() || "the company"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
