import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Paperclip, Upload, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * The papers behind a record: drawings with a quote, a timesheet with an
 * invoice, a spec with a purchase order, a bill of lading with a shipment, a
 * contract with a person. Dropped or picked, kept once by their contents, and
 * never deleted: taking one off hides it here and keeps it in the archive.
 *
 * On a document that is sent, a paper can be shown to the other side: it
 * appears with the document on the customer's page or the supplier's link.
 */

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.doc,.docx,.txt";
const SIDE = { purchase_order: "the supplier", default: "the customer" };
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const Icon = ({ type }) => {
  const C = /image/.test(type) ? ImageIcon : /sheet|excel|csv/.test(type) ? FileSpreadsheet : FileText;
  return <C size={16} aria-hidden="true" />;
};

/** Opens a file in a new tab through the signed-in session. */
export async function openFile(url) {
  const r = await apiClient.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(r.data);
  window.open(href, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function Attachments({ kind, id, title = "Attachments", compact = false }) {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const key = ["attachments", companyId, kind, id];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/attachments/doc/${kind}/${id}`).then((r) => r.data), enabled: Boolean(companyId && id) });
  const list = data?.attachments || [];
  const record = can("record");
  const side = SIDE[kind] || SIDE.default;

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await apiClient.post(`/attachments/doc/${kind}/${id}`, form, { headers: { "Content-Type": "multipart/form-data" } });
      }
      qc.invalidateQueries({ queryKey: key });
      toast.success(files.length === 1 ? `${files[0].name} attached` : `${files.length} files attached`, "Kept with it for good; take one off if it was a mistake.");
    } catch (ex) {
      toast.error("Not attached", ex.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function change(a, body, said) {
    try {
      await apiClient.patch(`/attachments/${a.id}`, body);
      qc.invalidateQueries({ queryKey: key });
      if (said) toast.success(said);
    } catch (ex) {
      toast.error("Not changed", ex.message);
    }
  }

  if (!list.length && !record) return null;
  return (
    <section
      className={`${compact ? "" : "mt-6"} rounded-2xl border ${over ? "border-[var(--ink)] bg-[var(--surface-2)]" : "border-[var(--border)] bg-[var(--surface)]"} p-5 print:hidden transition-colors`}
      aria-label={title}
      data-testid="attachments"
      onDragOver={(e) => {
        if (!record) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (record) upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Paperclip size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {list.length > 0 && <span className="text-[13px] text-[var(--ink-muted)]">· {list.length}</span>}
        {record && (
          <>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload([...e.target.files])} aria-label="Attach a file" />
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="ml-auto h-9 px-3.5 rounded-full border border-[var(--border)] text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-[var(--surface-2)] disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Attach
            </button>
          </>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">Drop a PDF, photo, Excel or Word file here, or press Attach. Up to 10 MB each.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {list.map((a) => (
            <li key={a.id} className="py-2.5 flex items-center gap-3">
              <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]">
                <Icon type={a.contentType} />
              </span>
              <button type="button" onClick={() => openFile(`/attachments/${a.id}/file`).catch((ex) => toast.error("Not opened", ex.message))} className="min-w-0 flex-1 text-left group">
                <span className="block text-[14px] truncate group-hover:underline">{a.filename}</span>
                <span className="block text-[12px] text-[var(--ink-muted)]">
                  {size(a.size)} · {formatDate(a.at)}
                  {a.by ? ` · ${a.by}` : ""}
                  {a.shared ? ` · ${side} sees it` : ""}
                </span>
              </button>
              {record && data?.shareable && (
                <button
                  type="button"
                  onClick={() => change(a, { shared: !a.shared }, a.shared ? `Hidden from ${side}` : `${side[0].toUpperCase()}${side.slice(1)} sees it with the document`)}
                  title={a.shared ? `Stop showing it to ${side}` : `Show it to ${side} with the document`}
                  aria-pressed={a.shared}
                  className={`h-8 px-2.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1 border ${a.shared ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
                >
                  {a.shared ? <Eye size={13} /> : <EyeOff size={13} />} <span className="hidden sm:inline">{a.shared ? "Shared" : "Share"}</span>
                </button>
              )}
              {record && (
                <button
                  type="button"
                  onClick={() => window.confirm(`Take ${a.filename} off? It stays in the archive; it just stops showing here.`) && change(a, { hidden: true }, `${a.filename} taken off`)}
                  aria-label={`Take ${a.filename} off`}
                  title="Take it off"
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Papers shown with a document on a public page (the customer's page or a link). */
export function SharedFiles({ files, base }) {
  if (!files?.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" data-testid="shared-files">
      <div className="text-[13px] font-medium flex items-center gap-1.5">
        <Paperclip size={14} aria-hidden="true" /> Attached
      </div>
      <ul className="mt-1.5 space-y-1">
        {files.map((f) => (
          <li key={f.id}>
            <a href={`/api${base}/${f.id}`} target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#0F4C5C] underline underline-offset-2 inline-flex items-center gap-1.5">
              <Icon type={f.contentType} /> {f.filename} <span className="text-[12px] text-[var(--ink-muted)] no-underline">({size(f.size)})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
