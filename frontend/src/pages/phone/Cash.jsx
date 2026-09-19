import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cashApi } from "@/api/cash";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * The tin.
 *
 * A supervisor on a site carries cash and spends it on things that cannot
 * wait. Until now none of that could be recorded, so the books were complete
 * about everything except the money somebody was actually holding.
 *
 * Three things happen here and nothing else: money goes out, the tin gets
 * counted, and somebody asks for more. Each one posts the moment it is done —
 * a cash spend that waits for approval is a cash spend that never gets
 * recorded, because the money has already gone.
 *
 * What is in the box is read from the books, not stored. The tin is already a
 * second record; a third one that could drift from both is the last thing
 * this needs.
 */

const FIELD =
  "w-full h-[52px] px-4 bg-[var(--surface)] text-[var(--ink)] text-[17px] border-2 border-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]";

export default function PhoneCash() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [doing, setDoing] = useState(null); // "spend" | "count" | "ask" | "open"

  const { data: boxes, isPending } = useQuery({
    queryKey: ["cash", companyId],
    queryFn: cashApi.boxes,
    enabled: Boolean(companyId),
  });

  const box = boxes?.[0] || null;
  const mayHandle = can("spend_cash") || can("record");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cash", companyId] });
    queryClient.invalidateQueries({ queryKey: ["cashHistory", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
  };

  return (
    <PhoneShell
      heading={box ? `In the tin: ${box.name}` : "Cash"}
      figure={box ? box.inBox : "0.00"}
      position={
        box
          ? box.overdrawn
            ? "More has gone out than went in"
            : box.lastCounted
              ? `Last counted ${when(box.lastCounted)}`
              : "Never counted"
          : "No cash box yet"
      }
      sync={box?.askedFor ? `${box.askedFor} asked for` : ""}
      onSnap={() => setDoing("spend")}
    >
      {isPending ? (
        <p className="px-5 pt-4 text-[15px]" style={{ color: "var(--ink-muted)" }}>
          Reading the books.
        </p>
      ) : !box ? (
        <div className="px-5 pt-5">
          <div
            className="border-t pt-4 font-display text-[28px] leading-[1.05] font-bold"
            style={{ borderColor: "var(--border)" }}
          >
            No cash box yet
          </div>
          <p className="mt-2 text-[15px] leading-[1.45]">
            A cash box is the tin one person carries on one site. Everything spent out of it
            goes into the books as it happens.
          </p>
          {can("manage_settings") ? (
            <button type="button" className="phone-do mt-4" onClick={() => setDoing("open")}>
              Open a cash box
            </button>
          ) : (
            <p className="mt-3 text-[15px]" style={{ color: "var(--ink-muted)" }}>
              An administrator opens it and says who holds it.
            </p>
          )}
        </div>
      ) : (
        <>
          {mayHandle && (
            <div className="px-5 pt-4 flex flex-col gap-2">
              <button type="button" className="phone-do" onClick={() => setDoing("spend")}>
                Money out of the tin
              </button>
              <button type="button" className="phone-do" onClick={() => setDoing("count")}>
                Count what is in it
              </button>
              <button type="button" className="phone-do" onClick={() => setDoing("ask")}>
                Ask for more
              </button>
            </div>
          )}

          <History boxId={box.id} companyId={companyId} />
        </>
      )}

      <OpenSheet
        open={doing === "open"}
        onClose={() => setDoing(null)}
        onDone={refresh}
        toast={toast}
      />

      {box && (
        <>
          <SpendSheet
            open={doing === "spend"}
            box={box}
            onClose={() => setDoing(null)}
            onDone={refresh}
            toast={toast}
          />
          <CountSheet
            open={doing === "count"}
            box={box}
            onClose={() => setDoing(null)}
            onDone={refresh}
            toast={toast}
          />
          <AskSheet
            open={doing === "ask"}
            box={box}
            onClose={() => setDoing(null)}
            onDone={refresh}
            toast={toast}
          />
        </>
      )}
    </PhoneShell>
  );
}

/** What has left the tin, and every count, on the rule. */
function History({ boxId, companyId }) {
  const { data } = useQuery({
    queryKey: ["cashHistory", companyId, boxId],
    queryFn: () => cashApi.history(boxId),
    enabled: Boolean(boxId),
  });

  const spends = data?.spends || [];
  const counts = data?.counts || [];

  if (!spends.length && !counts.length) {
    return (
      <div className="px-5 pt-6">
        <p className="text-[15px] leading-[1.45]" style={{ color: "var(--ink-muted)" }}>
          Nothing has gone out of this tin yet.
        </p>
      </div>
    );
  }

  return (
    <>
      {counts.length > 0 && (
        <>
          <div className="phone-section">
            <span className="phone-section-h">Counted</span>
          </div>
          <div className="phone-rule">
            {counts.slice(0, 3).map((c) => (
              <div key={c.id} className="phone-row">
                <div className="phone-row-date">{when(c.at)}</div>
                <div className="min-w-0">
                  <div className="phone-row-who">
                    {c.difference
                      ? `${c.short ? "Short" : "Over"} by ${c.difference}`
                      : "Agreed with the books"}
                  </div>
                  <div className="phone-row-what">{c.reason || c.who || ""}</div>
                </div>
                <div className={`phone-row-amount${c.difference ? " is-out" : ""}`}>
                  {c.counted}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="phone-section">
        <span className="phone-section-h">Money out</span>
      </div>
      <div className="phone-rule">
        {spends.map((s) => (
          <div key={s.id} className="phone-row">
            <div className="phone-row-date">{when(s.on)}</div>
            <div className="min-w-0">
              <div className="phone-row-who">{s.what}</div>
              <div className="phone-row-what">
                {[s.kind, s.who].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className={`phone-row-amount ${s.voided ? "is-gone" : "is-out"}`}>
              {s.voided ? s.amount : `−${s.amount}`}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Opening a tin.
 *
 * The name matters more than it looks: a count says which tin it was, and
 * "Cash" is not an answer when there are three sites.
 */
function OpenSheet({ open, onClose, onDone, toast }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const send = useMutation({ mutationFn: cashApi.open });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 2) return setErr("What is this tin called?");
    try {
      const box = await send.mutateAsync({ name: name.trim() });
      toast.success(`${box.name} is open`, "Nothing is in it yet. Ask for a top-up to put money in.");
      setName("");
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be opened.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      variant="sheet"
      title="Open a cash box"
      description="One tin, one site, one person holding it."
    >
      <label className="block">
        <span className="text-sm font-medium block mb-1.5">What is it called?</span>
        <input
          id="cash-box-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hulhumale site"
          className={FIELD}
        />
      </label>
      {err && (
        <p role="alert" className="text-[13px] mt-4" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}
      <SheetActions
        onClose={onClose}
        busy={send.isPending}
        label={name.trim().length < 2 ? "Give it a name" : `Open ${name.trim()}`}
      />
    </Modal>
  );
}

function SpendSheet({ open, box, onClose, onDone, toast }) {
  const { companyId } = useCompany();
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [kindId, setKindId] = useState("");
  const [err, setErr] = useState("");

  const { data: kinds } = useQuery({
    queryKey: ["cashKinds", companyId],
    queryFn: cashApi.kinds,
    enabled: open,
  });

  const send = useMutation({ mutationFn: (payload) => cashApi.spend(box.id, payload) });

  const chosen = kindId || kinds?.[0]?.id || "";
  const clean = String(amount).replace(/,/g, "");
  const commit =
    !(Number(clean) > 0) ? "How much?" : !what.trim() ? "What was it for?" : `Take MVR ${group(clean)}`;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(clean) > 0)) return setErr("How much was spent?");
    if (!what.trim()) return setErr("What was it spent on?");

    try {
      const result = await send.mutateAsync({ amount: clean, what: what.trim(), accountId: chosen });
      toast.success(
        `Out of the tin · MVR ${result.amount}`,
        result.overdrawn
          ? `That is more than the tin had. It now reads ${result.leftInBox} — count it.`
          : `MVR ${result.leftInBox} left. It is in the books as entry ${result.entryNo}.`
      );
      setAmount("");
      setWhat("");
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be recorded.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      variant="sheet"
      title="Money out of the tin"
      description="Recorded straight away. The money has already gone."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How much?</span>
          <input
            id="cash-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="300.00"
            className={`${FIELD} tabular`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What was it for?</span>
          <input
            id="cash-what"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            placeholder="Two loads of sand"
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What kind of spending?</span>
          <select
            id="cash-kind"
            value={chosen}
            onChange={(e) => setKindId(e.target.value)}
            className={FIELD}
          >
            {(kinds || []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && (
        <p role="alert" className="text-[13px] mt-4" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}

      <SheetActions onClose={onClose} busy={send.isPending} label={commit} />
    </Modal>
  );
}

function CountSheet({ open, box, onClose, onDone, toast }) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [asked, setAsked] = useState(false);

  const send = useMutation({ mutationFn: (payload) => cashApi.count(box.id, payload) });
  const clean = String(counted).replace(/,/g, "");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(clean) >= 0) || counted === "") return setErr("How much is in the tin?");

    try {
      const result = await send.mutateAsync({ counted: clean, reason: reason.trim() || null });
      toast.success(
        result.difference ? `${result.short ? "Short" : "Over"} by MVR ${result.difference}` : "It agrees",
        result.said
      );
      setCounted("");
      setReason("");
      setAsked(false);
      onDone();
      onClose();
    } catch (ex) {
      // The server refuses a difference with no reason, and it is right to.
      // Asking here rather than guarding up front means nobody is made to
      // explain a count that turns out to agree.
      setAsked(true);
      setErr(ex.message || "That count could not be recorded.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      variant="sheet"
      title="Count the tin"
      description="Count the notes and coins. Say what is there, not what should be."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What is in it?</span>
          <input
            id="cash-counted"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            inputMode="decimal"
            placeholder="1,250.00"
            className={`${FIELD} tabular`}
          />
        </label>

        {asked && (
          <label className="block">
            <span className="text-sm font-medium block mb-1.5">What happened to the difference?</span>
            <input
              id="cash-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Paid the boat, no receipt"
              className={FIELD}
            />
          </label>
        )}
      </div>

      {err && (
        <p role="alert" className="text-[13px] mt-4" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}

      <SheetActions
        onClose={onClose}
        busy={send.isPending}
        label={counted === "" ? "How much is in it?" : `It holds MVR ${group(clean)}`}
      />
    </Modal>
  );
}

function AskSheet({ open, box, onClose, onDone, toast }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const send = useMutation({ mutationFn: (payload) => cashApi.askFor(box.id, payload) });
  const clean = String(amount).replace(/,/g, "");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(clean) > 0)) return setErr("How much is needed?");
    try {
      const result = await send.mutateAsync({ amount: clean, note: note.trim() || null });
      toast.success(`Asked for MVR ${result.asked}`, "It is not money until somebody gives it.");
      setAmount("");
      setNote("");
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message || "That could not be sent.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      variant="sheet"
      title="Ask for more"
      description="Nothing moves until somebody gives it. This is the asking."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">How much is needed?</span>
          <input
            id="cash-ask"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="5,000.00"
            className={`${FIELD} tabular`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium block mb-1.5">What for?</span>
          <input
            id="cash-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sand and cement this week"
            className={FIELD}
          />
        </label>
      </div>

      {err && (
        <p role="alert" className="text-[13px] mt-4" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}

      <SheetActions
        onClose={onClose}
        busy={send.isPending}
        label={!(Number(clean) > 0) ? "How much?" : `Ask for MVR ${group(clean)}`}
      />
    </Modal>
  );
}

function SheetActions({ onClose, busy, label }) {
  return (
    <div
      className="sticky bottom-0 -mx-5 mt-6 flex items-center gap-2 px-5 py-3"
      style={{ borderTop: "2px solid var(--ink)", background: "var(--surface)" }}
    >
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        className="rounded-none border-2 border-[var(--ink)] h-[52px]"
      >
        Cancel
      </Button>
      <Button type="submit" variant="accent" disabled={busy} className="rounded-none h-[52px] flex-1">
        {label}
      </Button>
    </div>
  );
}

/** Groups what was typed without changing it. */
function group(raw) {
  const clean = String(raw).replace(/,/g, "").trim();
  if (!clean) return "0";
  const [whole, fraction = ""] = clean.split(".");
  const n = Number(whole);
  if (!Number.isFinite(n)) return clean;
  const grouped = n.toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function when(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`.toUpperCase();
}
