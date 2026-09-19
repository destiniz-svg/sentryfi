import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useCreateClient, useUpdateClient } from "@/hooks/useClients";

const EMPTY = { name: "", email: "", company: "", phone: "", address: "", notes: "" };

export function ClientFormModal({ open, onClose, client }) {
  const isEdit = !!client;
  const create = useCreateClient();
  const update = useUpdateClient();
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        client
          ? {
              name: client.name || "",
              email: client.email || "",
              company: client.company || "",
              phone: client.phone || "",
              address: client.address || "",
              notes: client.notes || "",
            }
          : EMPTY
      );
      setErr("");
    }
  }, [open, client]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setErr("Name is required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (isEdit) await update.mutateAsync({ id: client.id, payload: form });
      else await create.mutateAsync(form);
      onClose();
    } catch (ex) {
      setErr(ex.message || "Couldn't save client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      size="lg"
      title={isEdit ? "Edit client" : "Add client"}
    >
            <div className="space-y-3">
              <Field label="Name *">
                <Input value={form.name} onChange={set("name")} placeholder="Abcd Inc." />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={set("email")} placeholder="billing@acme.com" />
                </Field>
                <Field label="Company">
                  <Input value={form.company} onChange={set("company")} placeholder="Acme Inc." />
                </Field>
              </div>
              <Field label="Phone">
                <Input value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
              </Field>
              <Field label="Address">
                <Input value={form.address} onChange={set("address")} placeholder="123 Main St, City, State" />
              </Field>
              <Field label="Notes">
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Anything worth remembering..."
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none resize-y focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                />
              </Field>
            </div>

            {err && (
              <p role="alert" className="text-sm text-[var(--danger)] mt-3">
                {err}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isEdit ? "Save changes" : "Add client"}
              </Button>
            </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--ink-muted)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
