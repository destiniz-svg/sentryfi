import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bell, BellOff, Check, CircleHelp, FileText, Loader2, MessagesSquare, Paperclip, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { openFile } from "@/components/documents/Attachments";

/**
 * The team's conversation on a record. Type @ to bring someone in: they are
 * told, and follow the record from then on. "Ask" makes the comment a
 * question for one person, open until they reply and done when either of
 * them says so. Nothing said is ever deleted: an edit keeps the old words on
 * file, and a comment taken down leaves a line saying who took it down.
 *
 * Only the team sees this. Customers talk on their own thread, from their link.
 */

const when = (at) => {
  const d = new Date(at);
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const STATUS = {
  open: { label: "Waiting for an answer", tone: "bg-[var(--warning)]/14 text-[var(--warning)]" },
  answered: { label: "Answered", tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  done: { label: "Done", tone: "bg-[var(--success-soft)] text-[var(--success)]" },
};
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.doc,.docx,.txt";

/** The words, with each @Name of someone mentioned drawn as a name tag. */
function Words({ body, mentions }) {
  if (!mentions.length) return body;
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`(@(?:${names.map(esc).join("|")}))`, "g"));
  return parts.map((p, i) => (p.startsWith("@") && names.includes(p.slice(1)) ? <b key={i} className="font-semibold text-[var(--accent-strong)]">{p}</b> : p));
}

export function Conversation({ kind, id, title = "Conversation", className = "mt-6" }) {
  const { companyId } = useCompany();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["comments", companyId, kind, id];
  const { data, error } = useQuery({ queryKey: key, queryFn: () => apiClient.get(`/comments/${kind}/${id}`).then((r) => r.data), enabled: Boolean(companyId && id), refetchInterval: 20_000 });
  const { data: people = [] } = useQuery({ queryKey: ["comment-people", companyId, kind, id], queryFn: () => apiClient.get(`/comments/${kind}/${id}/people`).then((r) => r.data.people), enabled: Boolean(companyId && id), staleTime: 60_000 });

  // Opened from a notification: come straight to the conversation.
  const [params] = useSearchParams();
  const here = useRef(null);
  useEffect(() => {
    if (data && params.get("talk")) here.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["notifications", companyId] });
    qc.invalidateQueries({ queryKey: ["asks", companyId] });
    qc.invalidateQueries({ queryKey: ["attention", companyId] });
  };
  async function change(c, body, said) {
    try {
      await apiClient.patch(`/comments/${c.id}`, body);
      refresh();
      if (said) toast.success(said);
    } catch (ex) {
      toast.error("Not changed", ex.message);
    }
  }

  if (error) return null;
  const list = data?.comments || [];
  return (
    <section ref={here} id="conversation" className={`${className} scroll-mt-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 print:hidden`} aria-label={title} data-testid="conversation">
      <div className="flex items-center gap-2 flex-wrap">
        <MessagesSquare size={16} className="text-[var(--ink-muted)]" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {list.length > 0 && <span className="text-[13px] text-[var(--ink-muted)]">· {list.length}</span>}
        {data && (
          <button
            type="button"
            onClick={async () => {
              await apiClient.post(`/comments/${kind}/${id}/follow`, { on: !data.following });
              refresh();
              toast.success(data.following ? "You will not hear about this any more" : "You will hear when anyone writes here");
            }}
            aria-pressed={data.following}
            className="ml-auto h-9 px-3 rounded-full border border-[var(--border)] text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-[var(--surface-2)]"
          >
            {data.following ? <Bell size={14} /> : <BellOff size={14} />} {data.following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {!data ? (
        <div className="h-16" />
      ) : list.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-muted)] mt-2">Only your team sees this. Type @ to bring someone in, or ask someone a question they need to answer.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {list.map((c) => (
            <Comment key={c.id} c={c} onChange={change} />
          ))}
        </ol>
      )}

      {data && <Composer kind={kind} id={id} people={people} onSent={refresh} />}
    </section>
  );
}

function Comment({ c, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body || "");
  if (c.removed) {
    return (
      <li className="flex gap-3 items-center text-[13px] text-[var(--ink-muted)] italic">
        <span className="w-8 shrink-0" />
        {c.by.name}'s comment was taken down by {c.removed.by}, {when(c.removed.at)}.
      </li>
    );
  }
  const party = c.ask && [c.by.id, c.ask.of.id].includes(user?.id);
  return (
    <li className="flex gap-3 group">
      <Avatar name={c.by.name} size={32} className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[14px] font-semibold">{c.by.name}</span>
          <span className="text-[12px] text-[var(--ink-muted)]">
            {when(c.at)}
            {c.edited ? " · edited" : ""}
          </span>
          {c.mine && !editing && (
            <span className="ml-auto flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
              <button type="button" onClick={() => setEditing(true)} aria-label="Edit your comment" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => window.confirm("Take this comment down? A line stays saying you did.") && onChange(c, { removed: true }, "Taken down")} aria-label="Take your comment down" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
                <Trash2 size={13} />
              </button>
            </span>
          )}
        </div>
        {c.ask && (
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[12px]">
            <span className="inline-flex items-center gap-1 font-medium">
              <CircleHelp size={13} aria-hidden="true" /> Asked {c.ask.of.name}
              {c.ask.dueOn ? `, by ${new Date(c.ask.dueOn).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS[c.ask.status].tone}`}>{c.ask.status === "done" && c.ask.doneBy ? `Done · ${c.ask.doneBy}` : STATUS[c.ask.status].label}</span>
            {party &&
              (c.ask.status === "done" ? (
                <button type="button" onClick={() => onChange(c, { done: false }, "Open again")} className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] underline-offset-2 hover:underline">
                  <RotateCcw size={12} /> Open again
                </button>
              ) : (
                <button type="button" onClick={() => onChange(c, { done: true }, "Marked done")} className="inline-flex items-center gap-1 font-medium hover:underline underline-offset-2">
                  <Check size={12} /> Mark done
                </button>
              ))}
          </div>
        )}
        {editing ? (
          <form
            className="mt-1.5 grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await onChange(c, { body: text });
              setEditing(false);
            }}
          >
            <textarea aria-label="Edit your comment" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} className="w-full px-3.5 py-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] resize-y" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!text.trim()}>
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => (setEditing(false), setText(c.body))}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-[15px] whitespace-pre-line break-words mt-0.5">
            <Words body={c.body} mentions={c.mentions} />
          </p>
        )}
        {c.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {c.files.map((f) => (
              <button key={f.id} type="button" onClick={() => openFile(`/comments/files/${f.id}`).catch((ex) => toast.error("Not opened", ex.message))} className="h-9 max-w-full px-3 rounded-full border border-[var(--border)] text-[13px] inline-flex items-center gap-1.5 hover:bg-[var(--surface-2)]">
                <FileText size={13} className="shrink-0" /> <span className="truncate">{f.filename}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** Writing: @ to mention, Ask to make it a question for someone, a paperclip for files. */
function Composer({ kind, id, people, onSent }) {
  const toast = useToast();
  const box = useRef(null);
  const fileInput = useRef(null);
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState([]); // [{id, name}] mentioned by picking
  const [files, setFiles] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askOf, setAskOf] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [outside, setOutside] = useState(null); // { cannotSee, canLetIn } from the server
  const [at, setAt] = useState(null); // { start, query } while typing @name
  const [hi, setHi] = useState(0);

  const matches = useMemo(() => {
    if (!at) return [];
    const q = at.query.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q)).slice(0, 6);
  }, [at, people]);

  function onType(e) {
    const v = e.target.value;
    setBody(v);
    const caret = e.target.selectionStart;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
    setAt(m ? { start: caret - m[2].length - 1, query: m[2] } : null);
    setHi(0);
  }
  function pick(p) {
    const caret = box.current.selectionStart;
    const next = `${body.slice(0, at.start)}@${p.name} ${body.slice(caret)}`;
    setBody(next);
    setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, { id: p.id, name: p.name }]));
    setAt(null);
    requestAnimationFrame(() => {
      const pos = at.start + p.name.length + 2;
      box.current.focus();
      box.current.setSelectionRange(pos, pos);
    });
  }
  function onKey(e) {
    if (at && matches.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setHi((h) => (h + 1) % matches.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setHi((h) => (h - 1 + matches.length) % matches.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(matches[hi]);
      if (e.key === "Escape") return setAt(null);
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
  }

  async function send(e, letIn = []) {
    e?.preventDefault?.();
    setErr("");
    const text = body.trim();
    if (!text) return;
    // Only names still in the words count as mentioned.
    const mentions = picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);
    setBusy(true);
    try {
      const r = await apiClient.post(`/comments/${kind}/${id}`, { body: text, mentions, askOf: asking && askOf ? askOf : null, dueOn: asking && askOf && dueOn ? dueOn : null, letIn });
      let failed = 0;
      for (const f of files) {
        const form = new FormData();
        form.append("file", f);
        await apiClient.post(`/comments/${r.data.id}/files`, form, { headers: { "Content-Type": "multipart/form-data" } }).catch(() => failed++);
      }
      if (failed) toast.error("Some files did not go", "The comment went; attach them again.");
      setBody("");
      setPicked([]);
      setFiles([]);
      setAsking(false);
      setAskOf("");
      setDueOn("");
      setOutside(null);
      onSent();
    } catch (ex) {
      if (ex.status === 409 && ex.details?.cannotSee) setOutside(ex.details);
      else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-5 pt-4 border-t border-[var(--border)] grid gap-2.5">
      <div className="relative">
        <textarea
          ref={box}
          aria-label="Write a comment"
          value={body}
          onChange={onType}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setAt(null), 150)}
          rows={2}
          maxLength={4000}
          placeholder="Write to the team. Type @ to mention someone."
          className="w-full min-h-[48px] px-4 py-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] resize-y"
          role="combobox"
          aria-expanded={Boolean(at && matches.length)}
          aria-controls="mention-list"
          aria-autocomplete="list"
        />
        {at && matches.length > 0 && (
          <ul id="mention-list" role="listbox" aria-label="People" className="absolute z-30 left-2 bottom-full mb-1 w-[min(320px,calc(100%-1rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-hover py-1.5 overflow-hidden">
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} onMouseEnter={() => setHi(i)} className={`w-full text-left px-3 py-2 flex items-center gap-2.5 ${i === hi ? "bg-[var(--surface-2)]" : ""}`}>
                  <Avatar name={p.name} size={28} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium truncate">{p.name}</span>
                    <span className="block text-[12px] text-[var(--ink-muted)] truncate">{p.sees ? p.email : "Cannot open this yet"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="h-8 pl-3 pr-1 rounded-full bg-[var(--surface-2)] text-[13px] inline-flex items-center gap-1.5 max-w-full">
              <FileText size={13} className="shrink-0" /> <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Leave ${f.name} out`} className="h-6 w-6 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface)]">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {asking && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
          <CircleHelp size={15} className="text-[var(--ink-muted)]" aria-hidden="true" />
          <label className="text-[14px]" htmlFor={`ask-of-${id}`}>
            Ask
          </label>
          <select id={`ask-of-${id}`} value={askOf} onChange={(e) => setAskOf(e.target.value)} className="h-9 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px]">
            <option value="">choose someone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="text-[14px]" htmlFor={`ask-due-${id}`}>
            by
          </label>
          <input id={`ask-due-${id}`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="h-9 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[14px]" />
          <span className="text-[12px] text-[var(--ink-muted)] basis-full sm:basis-auto">Open until they reply; either of you marks it done.</span>
        </div>
      )}

      {outside && (
        <div role="alert" className="rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-[14px]">
          <p>
            <b>{outside.cannotSee.map((p) => p.name).join(" and ")}</b> cannot open this.
            {outside.canLetIn ? " Let them into this conversation only? They will see what is said here and what it is about, not the books behind it." : " Only someone who can open it can bring them in."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {outside.canLetIn && (
              <Button type="button" size="sm" disabled={busy} onClick={(e) => send(e, outside.cannotSee.map((p) => p.id))}>
                Let them in and send
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setOutside(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Attach files to the comment" onChange={(e) => (setFiles([...files, ...[...e.target.files].filter((f) => f.size <= 10 * 1024 * 1024)]), (e.target.value = ""))} />
        <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files" className="h-10 w-10 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
          <Paperclip size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            const pos = box.current.selectionStart ?? body.length;
            const lead = pos > 0 && !/\s$/.test(body.slice(0, pos)) ? " @" : "@";
            const next = body.slice(0, pos) + lead + body.slice(pos);
            setBody(next);
            setAt({ start: pos + lead.length - 1, query: "" });
            requestAnimationFrame(() => (box.current.focus(), box.current.setSelectionRange(pos + lead.length, pos + lead.length)));
          }}
          aria-label="Mention someone"
          title="Mention someone"
          className="h-10 w-10 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          <AtSign size={16} />
        </button>
        <button type="button" onClick={() => setAsking((v) => !v)} aria-pressed={asking} className={`h-10 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ${asking ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}>
          <CircleHelp size={15} /> Ask
        </button>
        <Button type="submit" className="ml-auto" disabled={busy || !body.trim() || (asking && !askOf)}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {asking && askOf ? "Ask" : "Send"}
        </Button>
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {err}
        </p>
      )}
    </form>
  );
}
