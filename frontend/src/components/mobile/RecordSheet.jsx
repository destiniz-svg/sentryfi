import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ChevronRight, Mic } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCompany } from "@/context/CompanyContext";
import { ShortcutIcon, ShortcutsEditor, useMyShortcuts } from "@/components/mobile/Shortcuts";

/**
 * Everything that puts money in the books, one tap from anywhere.
 *
 * Opens over wherever the person is rather than taking them somewhere, and
 * nothing it starts is recorded until they confirm. Photographing and saying
 * a bill are always there; below them are each person's own shortcuts, chosen
 * here or in Settings, of those their role is allowed (Settings, People).
 */
export function RecordSheet({ open, onClose, onBill }) {
  const navigate = useNavigate();
  const { can } = useCompany();
  const { chosen } = useMyShortcuts();
  const [editing, setEditing] = useState(false);
  // Anyone who may put a bill in may photograph or say one: the bill routes allow record or capture.
  const bills = can("record") || can("capture");

  const close = () => (setEditing(false), onClose());
  const run = (s) => (close(), s.bill ? onBill(true) : navigate(s.to));

  return (
    <Modal
      open={open}
      onClose={close}
      variant="sheet"
      title={editing ? "Your shortcuts" : "Record"}
      description={editing ? "Photograph and Say it always stay. Choose what sits under them, and in what order." : "Nothing is in the books until you confirm."}
      className="rounded-t-[22px] border-t-0 bg-[var(--bg)]"
    >
      <input
        id="record-camera"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="record-camera"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (!files.length) return;
          close();
          onBill({ files });
        }}
      />

      {editing ? (
        <ShortcutsEditor onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {bills && (
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {/* The camera opens inside the tap itself: a phone only opens it from a person's own touch. */}
              <Tile icon={Camera} name="Photograph a bill" sub="Read, checked by you" onClick={() => document.getElementById("record-camera")?.click()} primary />
              <Tile icon={Mic} name="Say it" sub="Dhivehi or English" onClick={() => (close(), onBill({ say: true }))} />
            </div>
          )}
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Shortcuts</h3>
            <button type="button" onClick={() => setEditing(true)} data-testid="shortcuts-edit-open" className="h-9 px-3 -mr-2 rounded-full text-[14px] font-semibold text-[var(--deep)]">
              Edit
            </button>
          </div>
          {chosen.length ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {chosen.map((s, i) => (
                <button key={s.key} type="button" onClick={() => run(s)} className={`w-full flex items-center gap-3.5 min-h-[60px] px-3.5 py-2 text-left ${i ? "border-t border-[var(--border)]" : ""}`}>
                  <ShortcutIcon s={s} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{s.name}</span>
                    <span className="block text-[13px] text-[var(--ink-muted)] truncate">{s.sub}</span>
                  </span>
                  <ChevronRight size={18} className="text-[var(--ink-muted)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="w-full rounded-2xl border border-dashed border-[var(--border)] p-4 text-[14px] text-[var(--ink-muted)]">
              No shortcuts. Tap to add the ones you use.
            </button>
          )}
          <button type="button" onClick={close} className="w-full mt-3 h-[52px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] font-semibold">
            Cancel
          </button>
        </>
      )}
    </Modal>
  );
}

function Tile({ icon: I, name, sub, onClick, primary }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl p-3.5 text-left min-h-[104px] flex flex-col justify-between ${primary ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface)] border border-[var(--border)]"}`}>
      <I size={24} aria-hidden="true" />
      <span>
        <span className="block text-[16px] font-semibold leading-tight">{name}</span>
        <span className={`block text-[12px] ${primary ? "opacity-75" : "text-[var(--ink-muted)]"}`}>{sub}</span>
      </span>
    </button>
  );
}
