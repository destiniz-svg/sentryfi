import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, Dices, Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { formatDate } from "@/lib/utils";

/**
 * Counting stock, blind. A full count of a place, a cycle count of what is due
 * there, or a spot check of a few items picked at random and counted by
 * someone other than the place's person in charge.
 */

const FIELD =
  "w-full h-11 px-4 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15";
const KINDS = [
  ["full", "Count a place", "Every item at one place: the quarter or year-end stocktake.", ClipboardCheck],
  ["cycle", "Cycle count", "The items due at a place: valuable ones monthly, the rest less often.", RefreshCw],
  ["spot", "Spot check", "A few items picked at random, counted by someone other than the person in charge.", Dices],
];
const STATUS = { counting: "Counting", submitted: "Waiting for approval", posted: "Done", cancelled: "Cancelled" };

export default function Counts() {
  const { companyId, can } = useCompany();
  const [starting, setStarting] = useState(null); // a kind
  const { data, isLoading } = useQuery({
    queryKey: ["stock", companyId, "counts"],
    queryFn: () => apiClient.get("/counts").then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const list = data?.counts || [];
  const open = list.filter((c) => c.status === "counting" || c.status === "submitted");
  const done = list.filter((c) => c.status === "posted" || c.status === "cancelled");
  const dueTotal = Object.values(data?.due || {}).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader title="Counts" description="Counting what is really there, blind: nobody sees what the books say until the count is in." />
      {can("record") && (
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          {KINDS.map(([k, title, line, Icon]) => (
            <button key={k} type="button" onClick={() => setStarting(k)} className="text-left rounded-2xl bg-[var(--surface)] lift p-4 hover:bg-[var(--surface-2)] flex items-start gap-3 min-h-11" data-testid={`start-${k}`}>
              <span className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center text-[var(--ink-muted)]" aria-hidden="true">
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{title}</span>
                <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5">{line}</span>
                {k === "cycle" && dueTotal > 0 && <span className="inline-block mt-1.5 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] text-[12px] font-semibold px-2 py-0.5">{dueTotal} due</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <div className="grid gap-6">
          <Section title="Open" rows={open} empty="No count is open." />
          <Section title="Finished" rows={done} empty="No counts yet." />
        </div>
      )}

      {starting && <Start kind={starting} places={data?.places || []} people={data?.people || []} due={data?.due || {}} onClose={() => setStarting(null)} />}
    </div>
  );
}

function Section({ title, rows, empty }) {
  return (
    <section aria-labelledby={`counts-${title}`}>
      <h2 id={`counts-${title}`} className="text-[17px] font-semibold mb-2.5">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-muted)]">{empty}</p>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {rows.map((c) => (
              <Link key={c.id} to={`/counts/${c.id}`} className="flex items-center gap-3 px-4 py-3 min-h-11 hover:bg-[var(--surface-2)]" data-testid="count-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {c.kindName} · {c.place}
                  </span>
                  <span className="block text-[13px] text-[var(--ink-muted)]">
                    {c.counter} · {c.counted} of {c.lines} counted · started {formatDate(c.createdAt)}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${c.status === "submitted" ? "bg-[var(--warning)]/15 text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"}`}>{STATUS[c.status]}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

/** Where, and who counts. A spot check is not counted by the place's person in charge. */
function Start({ kind, places, people, due, onClose }) {
  const nav = useNavigate();
  const [placeId, setPlaceId] = useState(places[0]?.id || "");
  const [counterId, setCounterId] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const place = places.find((p) => (p.id || "") === placeId);
  const who = kind === "spot" ? people.filter((u) => u.id !== place?.inChargeId) : people;
  const [title, line] = KINDS.find(([k]) => k === kind).slice(1, 3);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await apiClient.post("/counts", { kind, placeId: placeId || null, counterId, note: note || null });
      nav(`/counts/${r.data.id}`);
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} as="form" onSubmit={onSubmit} title={title} description={line}>
      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Where</span>
          <select id="count-start-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={FIELD}>
            {places.map((p) => (
              <option key={p.id || "main"} value={p.id || ""}>
                {p.name}
                {kind === "cycle" ? ` (${due[p.id || "main"] || 0} due)` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Who counts</span>
          <select id="count-start-counter" value={counterId} onChange={(e) => setCounterId(e.target.value)} className={FIELD}>
            <option value="">Choose someone</option>
            {who.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {kind === "spot" && place?.inCharge && <span className="block text-[13px] text-[var(--ink-muted)] mt-1.5">{place.inCharge} looks after {place.name}, so someone else counts.</span>}
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">Note (optional)</span>
          <input id="count-start-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quarter-end stocktake" className={FIELD} />
        </label>
        <p className="text-[13px] text-[var(--ink-muted)]">The counter sees each item and its unit, never what the books say, until they submit.</p>
      </div>
      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || !counterId}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Start the count
        </Button>
      </div>
    </Modal>
  );
}
