import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { companiesApi } from "@/api/companies";
import { cashApi } from "@/api/cash";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TagPicker } from "@/components/ui/TagPicker";
import { remembered } from "@/lib/kept";
import { useSendOrKeep } from "@/context/OutboxContext";
import { WaitingToSend } from "@/components/bills/WaitingToSend";

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

/**
 * Which tin this phone is holding.
 *
 * Kept per company, and only as a convenience: a phone with storage blocked
 * simply falls back to the first box. It matters because the screen resets on
 * every reload otherwise, and a supervisor who reopens the app and records a
 * spend would put it in somebody else's tin without noticing — which is worse
 * than not recording it, because the figure looks right in both places and is
 * wrong in both.
 */
const HELD = (companyId) => `sentryfi.cashbox.${companyId}`;

function rememberBox(companyId, boxId) {
  try {
    window.localStorage.setItem(HELD(companyId), boxId);
  } catch {
    // Private windows and blocked site data both throw. Not remembering is a
    // small inconvenience; throwing on a cash screen is not.
  }
}

function boxHeld(companyId) {
  try {
    return window.localStorage.getItem(HELD(companyId));
  } catch {
    return null;
  }
}

const FIELD =
  "w-full h-[52px] px-4 bg-[var(--surface)] text-[var(--ink)] text-[17px] border-2 border-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]";

export default function PhoneCash() {
  const { companyId, can } = useCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [doing, setDoing] = useState(null); // "spend" | "count" | "ask" | "open"
  const [picked, setPickedState] = useState(() => boxHeld(companyId));

  const setPicked = (id) => {
    setPickedState(id);
    if (companyId && id) rememberBox(companyId, id);
  };

  const { data: boxes, isPending } = useQuery({
    queryKey: ["cash", companyId],
    queryFn: remembered(`cash:${companyId}`, cashApi.boxes),
    enabled: Boolean(companyId),
  });

  // A company has more than one site, so it has more than one tin. Showing
  // only the first one made the second one unreachable and, worse, made the
  // screen quietly wrong about whose money it was describing.
  const box = boxes?.find((b) => b.id === picked) || boxes?.[0] || null;
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
          ? box.paidByHolder
            ? `${box.yours ? "You" : box.holder || "The holder"} paid ${box.paidByHolder} out of pocket`
            : box.handed?.length
            ? "Cash waiting to be confirmed"
            : box.toReimburse
            ? `${box.toReimburse} to reimburse`
            : box.overdrawn
            ? "More has gone out than went in"
            : box.lastCounted
              ? `Last counted ${when(box.lastCounted)}`
              : "Never counted"
          : "No cash box yet"
      }
      sync={box?.askedFor ? `${box.askedFor} asked for` : ""}
      onSnap={() => setDoing("spend")}
    >
      <WaitingToSend className="mx-5 mt-4" />
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
          {can("manage_cash") ? (
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
          {box.yours && box.handed?.map((h) => <Handed key={h.id} handed={h} onDone={refresh} toast={toast} />)}
          {!box.yours && box.handed?.length > 0 && (
            <p className="px-5 pt-4 text-[15px]">
              {box.handed.map((h) => h.amount).join(" and ")} handed over, waiting for {box.holder || "the holder"} to confirm.
            </p>
          )}

          {(box.float || box.toReimburse) && (
            <div className="px-5 pt-4 grid grid-cols-2 gap-3" data-testid="tin-float">
              <div>
                <div className="phone-section-h">Float</div>
                <div className="tabular text-[20px] font-semibold mt-1">{box.float || "Not set"}</div>
              </div>
              <div>
                <div className="phone-section-h">To reimburse</div>
                <div className="tabular text-[20px] font-semibold mt-1">{box.toReimburse || "Nothing"}</div>
              </div>
              <p className="col-span-2 text-[13px]" style={{ color: "var(--ink-muted)" }}>
                {box.paidByHolder
                  ? `The tin is below zero: ${box.paidByHolder} was paid out of pocket, and the office owes it back along with the float.`
                  : box.toReimburse
                    ? "What was spent from the tin. The office puts it back to bring the tin up to its float."
                    : box.handed?.length
                      ? "The rest is on its way, once it is confirmed."
                      : "The tin is full."}
                {box.holder && !box.yours ? ` Held by ${box.holder}.` : ""}
              </p>
            </div>
          )}

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

          {boxes.length > 1 && (
            <>
              <div className="phone-section">
                <span className="phone-section-h">Other tins</span>
              </div>
              <div className="phone-rule">
                {boxes
                  .filter((b) => b.id !== box.id)
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="phone-row"
                      onClick={() => setPicked(b.id)}
                    >
                      <div className="phone-row-date">Tin</div>
                      <div className="min-w-0">
                        <div className="phone-row-who">{b.name}</div>
                        <div className="phone-row-what">
                          {b.holder || (b.lastCounted ? `Counted ${when(b.lastCounted)}` : "Never counted")}
                        </div>
                      </div>
                      <div className={`phone-row-amount${b.overdrawn ? " is-out" : ""}`}>
                        {b.inBox}
                      </div>
                    </button>
                  ))}
              </div>
            </>
          )}

          {can("manage_cash") && (
            <div className="px-5 pt-5 pb-2">
              <button type="button" className="phone-do" onClick={() => setDoing("open")}>
                Open another cash box
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
        onOpened={setPicked}
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
    queryFn: remembered(`cashHistory:${boxId}`, () => cashApi.history(boxId)),
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
/**
 * Cash handed to this person, waiting for them to say they have it: the
 * signature on a petty cash voucher. Until they do, it is not in their tin.
 */
function Handed({ handed, onDone, toast }) {
  const [different, setDifferent] = useState(false);
  const [received, setReceived] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const send = useSendOrKeep((body) => ({ url: `/cash/topups/${handed.id}/receive`, body: body || {}, label: `Received MVR ${body?.received || handed.amount} into the tin` }));

  async function confirm(body) {
    setErr("");
    try {
      const r = await send.mutateAsync(body);
      if (r.queued) {
        toast.success("Kept on this phone", "Your confirmation is saved. It goes into the books by itself when there is signal.");
        return onDone();
      }
      toast.success(
        `${r.received} is in your tin`,
        r.received === r.given ? "Thank you." : `The office handed over ${r.given}; the difference is recorded.`
      );
      onDone();
    } catch (ex) {
      setErr(ex.message || "That did not work.");
    }
  }

  return (
    <div className="mx-5 mt-4 p-4 border-2 border-[var(--ink)] on-yellow bg-[var(--accent)]" data-testid="handed">
      <div className="font-display text-[22px] font-bold leading-tight">MVR {handed.amount} handed to you</div>
      <p className="text-[14px] mt-1">Did you receive it? It is in your tin once you say so.</p>
      {!different ? (
        <div className="flex flex-col gap-2 mt-3">
          <button type="button" className="phone-do" disabled={send.isPending} onClick={() => confirm({})}>
            Yes, I received {handed.amount}
          </button>
          <button type="button" className="phone-do" onClick={() => setDifferent(true)}>
            I got a different amount
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-3">
          <input
            aria-label="What you received"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            inputMode="decimal"
            placeholder="What you received"
            className={FIELD}
          />
          <input
            aria-label="Why it was different"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why it was different"
            className={FIELD}
          />
          <button
            type="button"
            className="phone-do"
            disabled={send.isPending || !received.trim() || !reason.trim()}
            onClick={() => confirm({ received: received.trim(), reason: reason.trim() })}
          >
            Confirm {received.trim() || "it"}
          </button>
        </div>
      )}
      {err && (
        <p role="alert" className="text-[13px] mt-2" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      )}
    </div>
  );
}

function OpenSheet({ open, onClose, onDone, onOpened, toast }) {
  const { companyId } = useCompany();
  const [name, setName] = useState("");
  const [holderId, setHolderId] = useState("");
  const [float, setFloat] = useState("");
  const [err, setErr] = useState("");
  const send = useMutation({ mutationFn: cashApi.open });
  const { data: people } = useQuery({
    queryKey: ["people", companyId],
    queryFn: companiesApi.people,
    enabled: open && Boolean(companyId),
  });

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (name.trim().length < 2) return setErr("What is this tin called?");
    try {
      const box = await send.mutateAsync({ name: name.trim(), holderId: holderId || null, float: float.trim() || null });
      toast.success(`${box.name} is open`, "Nothing is in it yet. Ask for a top-up to put money in.");
      setName("");
      onDone();
      // Show the tin that was just opened. Opening one and staying on another
      // reads as nothing having happened.
      if (onOpened) onOpened(box.id);
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
      <label className="block mt-4">
        <span className="text-sm font-medium block mb-1.5">Who holds it?</span>
        <select id="cash-box-holder" value={holderId} onChange={(e) => setHolderId(e.target.value)} className={FIELD}>
          <option value="">Me</option>
          {(people?.members || []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block mt-4">
        <span className="text-sm font-medium block mb-1.5">Float: what it holds when full</span>
        <input id="cash-box-float" value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" placeholder="5,000.00" className={`${FIELD} tabular`} />
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
  const [tags, setTags] = useState({ projectId: null, dimensionIds: [] });
  const [err, setErr] = useState("");

  const { data: kinds } = useQuery({
    queryKey: ["cashKinds", companyId],
    queryFn: remembered(`cashKinds:${companyId}`, cashApi.kinds),
    enabled: open,
  });

  const send = useSendOrKeep((payload) => ({ url: `/cash/${box.id}/spend`, body: payload, label: `MVR ${group(payload.amount)} out of ${box.name || "the tin"}: ${payload.what}` }));

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
      const result = await send.mutateAsync({ amount: clean, what: what.trim(), accountId: chosen, projectId: tags.projectId || null, dimensionIds: tags.dimensionIds.length ? tags.dimensionIds : null });
      if (result.queued) {
        toast.success("Kept on this phone", "The spend is saved. It goes into the books by itself when there is signal.");
        setAmount("");
        setWhat("");
        onDone();
        return onClose();
      }
      toast.success(
        `Out of the tin · MVR ${result.amount}`,
        result.overdrawn
          ? `More than the tin had: you paid ${result.leftInBox.replace(/^-/, "")} out of your own pocket. The office owes it back to you.`
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
        <TagPicker value={tags} onChange={setTags} fieldClass={FIELD} />
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

  const send = useSendOrKeep((payload) => ({ url: `/cash/${box.id}/count`, body: payload, label: `Counted MVR ${group(payload.counted)} in ${box.name || "the tin"}` }));
  const clean = String(counted).replace(/,/g, "");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(clean) >= 0) || counted === "") return setErr("How much is in the tin?");

    try {
      const result = await send.mutateAsync({ counted: clean, reason: reason.trim() || null });
      if (result.queued) {
        toast.success("Kept on this phone", "The count is saved. It goes into the books by itself when there is signal.");
        setCounted("");
        setReason("");
        setAsked(false);
        onDone();
        return onClose();
      }
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

        {(asked || !navigator.onLine) && (
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
  const send = useSendOrKeep((payload) => ({ url: `/cash/${box.id}/topup`, body: payload, label: `Asked for MVR ${group(payload.amount)} for ${box.name || "the tin"}` }));
  const clean = String(amount).replace(/,/g, "");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!(Number(clean) > 0)) return setErr("How much is needed?");
    try {
      const result = await send.mutateAsync({ amount: clean, note: note.trim() || null });
      if (result.queued) {
        toast.success("Kept on this phone", "The request is saved. It goes into the books by itself when there is signal.");
        setAmount("");
        setNote("");
        onDone();
        return onClose();
      }
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
