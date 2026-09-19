import { useEffect, useState } from "react";
import { Plus, Package, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { CardLink } from "@/components/ui/CardLink";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useItems, useItemMutations } from "@/hooks/useFeatures";
import { formatMoney } from "@/lib/utils";

export default function Items() {
  const { data: items, isLoading } = useItems();
  const [modal, setModal] = useState(null); // null | {} | item
  const { remove } = useItemMutations();

  async function onDelete(e, item) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await remove.mutateAsync(item.id);
  }

  return (
    <div>
      <PageHeader
        title="Items & Services"
        description="Reusable products and services you can drop into any invoice."
        actions={
          <Button variant="accent" onClick={() => setModal({})}>
            <Plus size={16} /> Add Item
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-3xl" />
          ))}
        </div>
      ) : !items?.length ? (
        <EmptyState
          icon={Package}
          title="No items yet"
          description="Save your common services and their rates to speed up invoicing."
          action={
            <Button variant="accent" onClick={() => setModal({})}>
              <Plus size={16} /> Add Item
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} padding="lg" className="relative group cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardLink
                    onClick={() => setModal(item)}
                    label={`${item.name}, edit this item`}
                    className="block text-left font-semibold text-[var(--ink)] truncate"
                  >
                    {item.name}
                  </CardLink>
                  {item.description && (
                    <p className="text-xs text-[var(--ink-muted)] mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
                {/* Above the stretched target, so these stay separately clickable
                    and separately reachable. Delete is the only one that needs a
                    button of its own: opening the card already edits it. */}
                <div className="relative z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => onDelete(e, item)}
                    aria-label={`Delete ${item.name}`}
                    className="h-11 w-11 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-1 mt-4">
                <span className="font-display text-xl font-semibold tabular text-[var(--accent-strong)]">
                  {formatMoney(item.rate)}
                </span>
                {item.unit && <span className="text-xs text-[var(--ink-muted)]">/ {item.unit}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ItemModal open={!!modal} item={modal?.id ? modal : null} onClose={() => setModal(null)} />
    </div>
  );
}

const EMPTY = { name: "", description: "", rate: 0, unit: "" };

function ItemModal({ open, item, onClose }) {
  const isEdit = !!item;
  const { create, update } = useItemMutations();
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(item ? { name: item.name, description: item.description || "", rate: item.rate, unit: item.unit || "" } : EMPTY);
      setErr("");
    }
  }, [open, item]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setErr("Name is required");
    setSaving(true);
    setErr("");
    try {
      const payload = { ...form, rate: Number(form.rate) || 0 };
      if (isEdit) await update.mutateAsync({ id: item.id, payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (ex) {
      setErr(ex.message || "Couldn't save item");
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
      size="md"
      title={isEdit ? "Edit item" : "Add item"}
    >
            <div className="space-y-3">
              <Field label="Name *">
                <Input value={form.name} onChange={set("name")} placeholder="Frontend development" />
              </Field>
              <Field label="Description">
                <Input value={form.description} onChange={set("description")} placeholder="Short description" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rate">
                  <Input type="number" min="0" step="0.01" value={form.rate} onChange={set("rate")} className="tabular" />
                </Field>
                <Field label="Unit">
                  <Input value={form.unit} onChange={set("unit")} placeholder="hour / project" />
                </Field>
              </div>
            </div>
            {err && <p role="alert" className="text-sm text-[var(--danger)] mt-3">{err}</p>}
            <div className="flex items-center justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isEdit ? "Save" : "Add item"}
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
