import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, FileText, ListPlus, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useBillMutations } from "@/hooks/useBills";
import { billsApi } from "@/api/bills";
import { bankApi } from "@/api/bank";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/UIContext";
import { useOutbox } from "@/context/OutboxContext";
import { usePhone } from "@/lib/phone";
import { useUndo } from "@/context/UndoContext";
import { today } from "@/lib/utils";
import { prepareForReading } from "@/lib/image";
import { TagPicker } from "@/components/ui/TagPicker";
import { Basket, FlowButtons, ItemPicker, ItemsTaxNote, PartyPicker, TermsPicker, dueFrom, taxFromItems } from "@/components/forms/Pickers";
import { useNavigate } from "react-router-dom";
import { taxApi } from "@/api/tax";

/**
 * Getting a bill in.
 *
 * The shape of this follows one rule from the build plan: getting the bill in
 * must never be blocked by a question. The person holding it is often standing
 * on a site. So the form asks for what is on the paper — who, how much, when —
 * and the one thing that cannot be guessed afterwards.
 *
 * That one thing is how the tax was quoted. The same printed MVR 4,250.50 is
 * MVR 3,935.65 plus 314.85 when the price includes tax, and MVR 4,590.54 when
 * the tax goes on top. Reading it the wrong way overstates the claim by 8%, so
 * the app refuses to guess. "I am not sure" is a real answer and keeps the
 * bill out of the books until someone decides, rather than quietly picking one.
 *
 * Recording and posting are separate acts. This records.
 */

const TAX_CHOICES = [
  {
    value: "inclusive",
    label: "Included in the price",
    hint: "The total on the bill already has GST in it. Most suppliers here.",
  },
  {
    value: "exclusive",
    label: "Added on top",
    hint: "GST is charged on top of the figure shown.",
  },
  {
    value: "none_unregistered",
    label: "No GST charged",
    hint: "The supplier is not registered, so there is nothing to claim back.",
  },
  { value: "zero_rated", label: "Zero-rated", hint: "Taxable at 0%: rice, flour, diesel and the like." },
  { value: "exempt", label: "Exempt", hint: "Outside GST: rent, electricity, water." },
  {
    value: "unknown",
    label: "I am not sure",
    hint: "It waits for someone to decide. Nothing is guessed.",
  },
];

export function RecordBill({ open, onClose, start }) {
  const { record, post } = useBillMutations();
  const toast = useToast();
  const outbox = useOutbox();
  const { companyId, can } = useCompany();
  const { data: contactList } = useQuery({ queryKey: ["contacts", companyId], queryFn: () => apiClient.get("/contacts").then((r) => r.data), enabled: Boolean(companyId) });
  // The phone gets larger fields and a bar that stays on screen; the desk a card. This is the one
  // screen both registers share, so it carries both and picks.
  const board = usePhone();
  const { offer } = useUndo();
  const inputClass = board ? BOARD_INPUT : DESK_INPUT;

  // A field the reader doubted wears the yellow; everything else stays ink on
  // white. Two yellow fields would be a defect, not emphasis.
  const fieldClass = (name) =>
    atRisk === name ? `${inputClass} on-yellow bg-[var(--accent)] text-[var(--on-accent)]` : inputClass;

  const cameraButton = useRef(null);

  const [form, setForm] = useState(blank());
  const [party, setParty] = useState(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [terms, setTerms] = useState(null);
  const [keepTerms, setKeepTerms] = useState(false);
  const [err, setErr] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [reading, setReading] = useState(false);
  const [listening, setListening] = useState(null); // the recorder, while it runs
  const [questions, setQuestions] = useState([]);
  const [readIt, setReadIt] = useState(false);
  const [blanks, setBlanks] = useState([]);
  // Everything attached to this bill. A supplier invoice is often more than
  // one page, and a delivery note photographed beside it belongs to the same
  // record. The first is what gets read; all of them get kept.
  const [files, setFiles] = useState([]);
  const [supplierFacts, setSupplierFacts] = useState(null);
  // The charges read off the paper (or what a voice note said it was for),
  // for the adviser to say what each one is.
  const [readLines, setReadLines] = useState(null);
  const [sure, setSure] = useState([]);
  // Typed in item by item, as on an invoice: who, the items, GST, terms, the
  // rest, then recorded. The amount is worked out from the items.
  const [flow, setFlow] = useState(null);
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  const { data: stockItems } = useQuery({ queryKey: ["stock", companyId], queryFn: () => apiClient.get("/stock").then((r) => r.data), select: (d) => d.items, enabled: Boolean(companyId) && open });
  const { data: taxNow } = useQuery({ queryKey: ["tax", companyId, form.issueDate], queryFn: () => taxApi.overview(form.issueDate), enabled: Boolean(companyId) && open && items.length > 0 });
  const rateBp = taxNow?.rates.find((r) => r.code === taxNow.defaultRate)?.bp ?? 0;
  // Whole laari, per line, as the server splits it.
  const cents = (x) => Math.round(Number(String(x).replace(/,/g, "")) * 100) || 0;
  const priced = items.map((l) => {
    const line = Math.round(cents(l.rate) * Number(l.quantity));
    const inTax = form.gstTreatment === "exclusive" ? Math.round((line * rateBp) / 10000) : 0;
    const net = form.gstTreatment === "inclusive" ? line - Math.round((line * rateBp) / (10000 + rateBp)) : line;
    return { ...l, line, gross: line + inTax, net };
  });
  // The stored item, not the one picked: its GST class may have been worked out since.
  const fromItems = taxFromItems(items.map((l) => (stockItems || []).find((i) => i.id === l.item.id) || l.item), form.gstTreatment, "inclusive");
  const itemsGross = priced.reduce((a, l) => a + l.gross, 0);
  const itemsLine = priced.reduce((a, l) => a + l.line, 0);
  const laariShown = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
   * The button that commits names the money.
   *
   * "Record it" asks a thumb to commit to a word. This says what is about to
   * happen and to how much, and when something is missing it says that
   * instead — so the loudest thing on the sheet is either the blocker or the
   * commitment, never a detail.
   */
  /**
   * Yellow Follows The Risk.
   *
   * The one yellow field on this sheet lands on whatever is most uncertain
   * about the money, ranked by what it costs the owner if it is wrong: a
   * suspected duplicate first, because paying a supplier twice and claiming
   * the input tax twice is the most expensive mistake this flow can make;
   * then the amount; then how the tax was quoted, which is an 8% error;
   * then who it is from; then the bill number.
   *
   * When nothing is uncertain the yellow moves to the button that commits, so
   * the loudest thing on screen is always either the doubt or the commitment,
   * never a detail.
   */
  const RISK_ORDER = ["amount", "gstTreatment", "supplierName", "billNo"];
  const atRisk = duplicates.length
    ? "duplicate"
    : RISK_ORDER.find((field) => questions.some((q) => q.field === field)) || null;

  const amountNow = Number(String(form.amount).replace(/,/g, ""));
  const commitment = !form.supplierName.trim()
    ? "Who is it from?"
    : !(amountNow > 0)
      ? "Add the amount"
      : `Record ${form.currency || "MVR"} ${formatAmount(form.amount)}`;
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

  function blank() {
    return {
      supplierName: "",
      amount: "",
      billNo: "",
      issueDate: today(),
      dueDate: "",
      gstTreatment: "inclusive",
      currency: "", // our own
      fxRate: "",
      tags: { projectId: null, dimensionIds: [] },
    };
  }

  /** A supplier chosen from the picker, or typed as a new one: their usual terms follow. */
  function chooseParty(p) {
    setParty(p);
    setForm((f) => ({ ...f, supplierName: p.name, ...(p.termsDays != null ? { dueDate: dueFrom(f.issueDate, p.termsDays) || f.dueDate } : {}) }));
    if (p.termsDays != null) setTerms(p.termsDays);
    setKeepTerms(false);
    setFlow((x) => (x === "who" ? "items" : x));
  }
  const setIssued = (e) => {
    const issueDate = e.target.value;
    setForm((f) => ({ ...f, issueDate, dueDate: terms != null && terms !== "date" ? dueFrom(issueDate, terms) || f.dueDate : f.dueDate }));
  };

  // A bill in another currency is offered the latest rate somebody recorded on
  // or before its date. Only offered: the rate on the bank's advice is the one
  // that belongs on it, and once recorded it never changes.
  useEffect(() => {
    if (!form.currency) return;
    let live = true;
    bankApi
      .rate(form.currency, form.issueDate)
      .then((r) => live && r.latest && setForm((f) => (f.fxRate ? f : { ...f, fxRate: r.latest.rate })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [form.currency, form.issueDate]);

  useEffect(() => {
    if (open) {
      setForm(blank());
      setParty(null);
      setPartyOpen(false);
      setTerms(null);
      setKeepTerms(false);
      setErr("");
      setDuplicates([]);
      setQuestions([]);
      setSure([]);
      setReadIt(false);
      setBlanks([]);
      setFiles([]);
      setSupplierFacts(null);
      setReadLines(null);
      setFlow(null);
      setItems([]);
    }
  }, [open]);

  /**
   * Takes whatever arrives — a photograph, a picture already on the phone, a
   * PDF that came by email — and lets the app fill in what it can read.
   *
   * What comes back is put in the form rather than recorded, so the person
   * sees what was read off their own paper before any of it becomes a record.
   * Anything the reading was unsure about is listed underneath, because the
   * rule is to ask only about what is genuinely doubtful and handle the rest.
   */
  /**
   * What the reader found, put in front of the person. Identical whether it
   * was read off paper or heard: the fields fill, what it was sure of is
   * marked, what it could not make out is said plainly, and nothing is
   * recorded until somebody presses the button.
   */
  function applyReading(result) {
    const extracted = result.read || {};
    const name = result.supplier?.name || extracted.supplierName;

    setForm((f) => ({
      ...f,
      supplierName: name || f.supplierName,
      amount: extracted.grossAmount || f.amount,
      billNo: extracted.billNo || f.billNo,
      issueDate: extracted.issueDate || f.issueDate,
      gstTreatment: extracted.gstTreatment || f.gstTreatment,
    }));
    // A scanned or spoken name becomes the matching supplier when there is
    // one — the server already tried by id; the contact list is checked here
    // too, for their usual terms and in case a heard name matches by spelling.
    // No match: a new supplier by that name, decided when it saves.
    if (name) {
      const known =
        (result.supplier?.id && contactList?.contacts.find((c) => c.id === result.supplier.id)) ||
        contactList?.contacts.find((c) => c.supplier && c.name.toLowerCase() === name.toLowerCase());
      setParty(known ? { id: known.id, name: known.name, termsDays: known.termsDays ?? null, email: known.email || null } : { id: result.supplier?.id || null, name });
      if (known?.termsDays != null) {
        setTerms(known.termsDays);
        setForm((f) => ({ ...f, dueDate: dueFrom(f.issueDate, known.termsDays) || f.dueDate }));
      }
    }
    setQuestions(result.questions || []);
    // Everything the reader filled and was not asked about. A field arrives
    // checked rather than blank, because making one field always unchecked
    // turns the review into a ritual tap and teaches somebody to clear it
    // without reading — which is worse than no review at all.
    const asked = new Set((result.questions || []).map((q) => q.field));
    setSure(
      [
        extracted.supplierName || result.supplier?.name ? "supplierName" : null,
        extracted.grossAmount ? "amount" : null,
        extracted.billNo ? "billNo" : null,
        extracted.issueDate ? "issueDate" : null,
        extracted.gstTreatment && extracted.gstTreatment !== "unknown" ? "gstTreatment" : null,
      ].filter((field) => field && !asked.has(field))
    );
    // Whatever the reading said about the supplier travels with the bill, so
    // the supplier record fills itself in over time rather than anybody typing.
    setSupplierFacts({
      tin: extracted.supplierTin || undefined,
      gst_number: extracted.supplierGstNumber || undefined,
      address: extracted.supplierAddress || undefined,
      phone: extracted.supplierPhone || undefined,
      email: extracted.supplierEmail || undefined,
      bank_account: extracted.supplierBankAccount || undefined,
      // The other way the same supplier spelt itself on this page, so it is
      // recognised next time it arrives written that way.
      also_seen_as: extracted.supplierAlsoSeenAs || undefined,
    });
    const lines = extracted.lines?.length
      ? extracted.lines
      : extracted.description
        ? [{ description: extracted.description, amount: extracted.grossAmount || "" }]
        : null;
    setReadLines(lines);
    setReadIt(true);
    setBlanks(
      [
        ["the supplier", extracted.supplierName],
        ["the amount", extracted.grossAmount],
        ["the bill number", extracted.billNo],
        ["the date", extracted.issueDate],
      ]
        .filter(([, v]) => !v)
        .map(([label]) => label)
    );
  }

  /**
   * A bill said out loud. In bright sun a photograph takes three tries and
   * speaking takes one, and a supervisor with a bill in one hand has only the
   * other. The recording is read and thrown away; nothing is kept but what
   * the person confirms.
   */
  async function onSay() {
    if (listening) {
      listening.stop();
      return;
    }
    setErr("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErr("This phone will not let the app use the microphone. Allow it in the browser's settings, or type it in.");
      return;
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(null);
      const note = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (note.size < 1000) {
        setErr("That was too short to make out. Hold the button, say it, then stop.");
        return;
      }
      setReading(true);
      setQuestions([]);
      try {
        applyReading(await billsApi.listen(note));
      } catch (ex) {
        setErr(ex.message || "That could not be made out. Say it again, or type it in.");
      } finally {
        setReading(false);
      }
    };
    recorder.start();
    setListening(recorder);
  }

  // Opened from the Record sheet with a photograph already taken, or asked
  // to listen: carry straight on, rather than asking the same question again.
  const started = useRef(null);
  useEffect(() => {
    if (!open || !start || started.current === start) return;
    started.current = start;
    if (start.files?.length) onFiles({ target: { files: start.files, value: "" } });
    else if (start.say) onSay();
  });

  async function onFiles(e) {
    const picked = Array.from(e.target.files || []);
    // Clear the input so picking the same file twice still fires a change.
    e.target.value = "";
    if (!picked.length) return;

    // Straighten and shrink before anything else. A phone stores a portrait
    // photograph as a landscape image with a note saying "turn this", and a
    // reader that ignores the note gets sideways text — which comes back as a
    // few fields filled and the rest blank.
    const prepared = [];
    for (const one of picked) {
      const { file } = await prepareForReading(one);
      prepared.push(file);
    }

    const all = [...files, ...prepared];
    setFiles(all);

    // Read what was just added, not whatever was added first. Adding a
    // clearer picture after a poor one used to re-read the poor one.
    const toRead = prepared[0];
    if (!navigator.onLine) {
      // Nothing to apologise for: the photograph is kept and the bill will
      // send itself. Reading it is the only part that needs a connection.
      setErr(
        "No signal, so it cannot be read just now. Type what is on the bill and it will be sent when you are back."
      );
      setReadIt(false);
      return;
    }

    setReading(true);
    setErr("");
    setQuestions([]);
    try {
      applyReading(await billsApi.scan(toRead));
    } catch (ex) {
      setErr(ex.message || "That could not be read. Type it in instead.");
    } finally {
      setReading(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e) {
    e.preventDefault();
    submit();
  }

  async function submit() {
    setErr("");
    const typed = items.length > 0;
    const amount = typed ? (itemsGross / 100).toFixed(2) : String(form.amount).replace(/,/g, "");

    if (!form.supplierName.trim()) return setErr("Who is the bill from?");
    if (form.currency && !(Number(form.fxRate) > 0)) {
      setErr(`What rate did the bank use for ${form.currency}? MVR for 1 ${form.currency}.`);
      return;
    }
    if (!(Number(amount) > 0)) {
      return setErr("How much is it for?");
    }

    // The bill's identity, decided here rather than by the server. A send
    // that times out has an unknowable outcome — the server may have recorded
    // it and lost the reply — so the retry has to be able to say "this is the
    // same bill". Without this, falling back to the queue after a timeout is
    // how one cost becomes two.
    const payload = {
      clientRef: crypto.randomUUID(),
      counterpartyId: party?.id || null,
      supplierName: form.supplierName.trim(),
      amount,
      billNo: form.billNo.trim() || null,
      issueDate: form.issueDate || null,
      dueDate: form.dueDate || null,
      gstTreatment: form.gstTreatment,
      currency: form.currency || null,
      fxRate: form.currency ? form.fxRate.trim() : null,
      // No rate sent: the server uses the one in force on the bill date, from
      // the tax engine, and keeps it on the bill.
      supplier: supplierFacts || undefined,
      lines: typed ? priced.map((l) => ({ description: l.item.name, quantity: l.quantity, amount: (l.gross / 100).toFixed(2) })) : readLines || undefined,
      projectId: form.tags?.projectId || null,
      dimensionIds: form.tags?.dimensionIds?.length ? form.tags.dimensionIds : null,
    };

    // ponytail: a bill held for want of signal keeps its items as lines only; the stock is said on the bill later.
    // No signal: hold it on the phone and send it when there is. The bill is
    // never lost for want of a connection, which is what the landing page has
    // been promising.
    if (!navigator.onLine) {
      await outbox.queue({ payload, files });
      toast.success(
        `Held on this phone · ${form.supplierName.trim()}`,
        "No signal. It sends itself the moment you are back."
      );
      onClose();
      return;
    }

    try {
      // Whatever the photograph told us about the supplier travels with it:
      // the record fills itself in over time rather than anybody typing it.
      const result = await record.mutateAsync(payload);
      if (keepTerms && party?.id && typeof terms === "number") await apiClient.patch(`/contacts/${party.id}`, { paymentTermsDays: terms }).catch(() => {});

      // File the paper against the bill now that the bill exists, every page
      // in the order it was added. This happens even when a duplicate was
      // found, because the paper belongs to the record either way and whoever
      // sorts the duplicate out will want to see both documents.
      //
      // A failure here does not lose the bill. The bill is recorded and the
      // paper can be added again, which is better than rolling back work
      // somebody has already done.
      // Counted stock on it is received with the bill, before tax, so the
      // items on hand go up when it goes in the books.
      const counted = typed ? priced.filter((l) => l.item.counted) : [];
      if (counted.length) {
        await apiClient
          .put(`/bills/${result.bill.id}/stock`, { lines: counted.map((l) => ({ itemId: l.item.id, quantity: l.quantity, amount: (l.net / 100).toFixed(2) })) })
          .catch((ex) => toast.error("Recorded, but not the stock", ex.message));
      }

      let paperKept = true;
      for (const file of files) {
        try {
          await billsApi.attach(result.bill.id, file);
        } catch {
          paperKept = false;
        }
      }

      // A duplicate is worth stopping for, but not worth losing the bill over:
      // it is already recorded, and this says so rather than discarding it.
      if (result.duplicates?.length) {
        setDuplicates(result.duplicates);
        return;
      }

      /**
       * On the board, confirming finishes the job.
       *
       * The goal is a bill in the books three taps later, by whoever is
       * holding it. Recording and then going somewhere else to post is four
       * taps and two decisions, and the second one gets forgotten — which is
       * how a drawer of unposted bills happens. The ten-second undo is what
       * makes one commitment safe, and it is a real reversal, not a delay.
       *
       * The desk keeps the two steps. An accountant is reviewing what other
       * people recorded, and that is a different act from recording it.
       */
      // Site staff send the bill in; putting it in the books is somebody
      // else's job, so for them recording is the whole of it.
      if (board && !can("record")) {
        toast.success(
          `Sent · ${form.supplierName.trim()}`,
          "Someone in the office checks it and puts it in the books."
        );
        onClose();
        return;
      }

      if (board) {
        try {
          const entry = await post.mutateAsync(result.bill.id);
          offer({
            billId: result.bill.id,
            entryId: entry.entryId,
            entryNo: entry.entryNo,
            total: entry.total,
            who: form.supplierName.trim(),
          });
          if (!paperKept) {
            toast.error(
              "The paper did not save",
              "The figures are in the books. Add the photograph again from the bill."
            );
          }
          onClose();
          return;
        } catch (ex) {
          // Recorded but not posted is a real, honest state — not a failure to
          // hide. Say which of the two happened and what is still needed.
          toast.error(
            `Recorded, but not in the books: ${form.supplierName.trim()}`,
            ex.message || "Something is missing before it can be posted."
          );
          onClose();
          return;
        }
      }

      toast.success(
        `Recorded ${result.bill.gross} from ${form.supplierName.trim()}`,
        !paperKept
          ? "The figures are saved, but the paper was not. Add it again from the bill."
          : form.gstTreatment === "unknown"
            ? "It is waiting for someone to say how its tax was quoted."
            : "Check it, then put it in the books."
      );
      onClose();
      if (typed) navigate(`/bills/${result.bill.id}`);
    } catch (ex) {
      // A request that never reached the server is the same as having no
      // signal: hold it rather than making somebody photograph it again.
      const neverArrived = !ex?.status || ex.status >= 500;
      if (neverArrived) {
        await outbox.queue({ payload, files });
        toast.success(
          `Held on this phone · ${form.supplierName.trim()}`,
          "The connection dropped. It sends itself when it comes back."
        );
        onClose();
        return;
      }
      setErr(ex.message || "Could not record the bill");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={onSubmit}
      title="Record a bill"
      description="What is on the paper. You can correct any of it afterwards."
      initialFocus={cameraButton}
      variant={board ? "sheet" : "card"}
    >
      {/* Two ways in, because they are genuinely different jobs and one input
          cannot do both. `capture` tells a phone to open the camera straight
          away, which is right when the bill is in your hand — and it is also
          why, with only that input, a bill already sitting in the gallery or
          arriving as a PDF by email could not be attached at all.
          The second input deliberately has no `capture`, so the phone offers
          the gallery, the files app, and whatever else it has. */}
      <div className="mb-5">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFiles}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={onFiles}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            type="button"
            ref={cameraButton}
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={reading}
            className={board ? "h-[52px] rounded-2xl" : "h-12"}
          >
            {reading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {reading ? "Reading it…" : "Photograph it"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => libraryInputRef.current?.click()}
            disabled={reading}
            className={board ? "h-[52px] rounded-2xl" : "h-12"}
          >
            <Paperclip size={16} />
            Choose a file
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSay}
            disabled={reading}
            className={
              (board ? "h-[52px] rounded-2xl" : "h-12") +
              (listening ? " on-yellow bg-[var(--accent)] text-[var(--on-accent)]" : "")
            }
          >
            {listening ? <Square size={15} /> : <Mic size={16} />}
            {listening ? "Stop and read it" : "Say it"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => (party ? setFlow("items") : (setFlow("who"), setPartyOpen(true)))}
            disabled={reading}
            data-testid="bill-enter-items"
            className={(board ? "h-[52px] rounded-2xl" : "h-12") + " sm:col-span-3"}
          >
            <ListPlus size={16} />
            {items.length ? `Items · ${form.currency || "MVR"} ${laariShown(itemsGross)}` : "Enter items"}
          </Button>
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 text-[13px] text-[var(--ink)]"
              >
                <FileText size={14} className="shrink-0 text-[var(--ink-muted)]" />
                <span className="truncate">{f.name}</span>
                <span className="text-[var(--ink-muted)] tabular shrink-0">
                  {Math.round(f.size / 1024)} KB
                </span>
                {i === 0 && files.length > 1 && (
                  <span className="text-[12px] uppercase tracking-wider text-[var(--ink-muted)] shrink-0">
                    read from this one
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((_, n) => n !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="ml-auto h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[13px] text-[var(--ink-muted)] mt-2 leading-snug">
          {readIt
            ? blanks.length
              ? `Read what it could. It could not make out ${blanks.join(", ")} — fill those in below.`
              : "Read off the first page. Check it against the paper — anything wrong, just change it."
            : "A photo, a picture already on the phone, a PDF, or say it out loud in Dhivehi or English. Several pages are fine. Nothing is recorded until you say so."}
        </p>
      </div>

      {questions.length > 0 && (
        <div role="status" className="mb-5 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {questions.length === 1 ? "One thing to check" : `${questions.length} things to check`}
          </p>
          <p className="text-[13px] text-[var(--ink-muted)] mt-1 leading-snug">
            The one in yellow is the one that costs most if it is wrong. The rest are
            below it.
          </p>
          <ul className="mt-2 space-y-2">
            {questions.map((q) => (
              <li key={q.field} className="text-[13px] leading-snug">
                <span className="text-[var(--ink)]">{q.asks}</span>{" "}
                <span className="text-[var(--ink-muted)]">{q.because}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <Field label="Who is it from?" read={sure.includes("supplierName")}>
          <div className={atRisk === "supplierName" ? "on-yellow rounded-2xl ring-2 ring-[var(--accent)]" : undefined}>
            <PartyPicker kind="supplier" value={party} onChange={chooseParty} open={partyOpen} setOpen={setPartyOpen} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How much?" htmlFor="bill-amount" read={sure.includes("amount")}>
            <input
              id="bill-amount"
              value={items.length ? laariShown(itemsGross) : form.amount}
              onChange={set("amount")}
              readOnly={items.length > 0}
              inputMode="decimal"
              placeholder="4,250.50"
              className={`${fieldClass("amount")} tabular`}
            />
          </Field>
          <Field label="Dated" htmlFor="bill-date" read={sure.includes("issueDate")}>
            <input
              id="bill-date"
              type="date"
              value={form.issueDate}
              onChange={setIssued}
              className={`${inputClass} tabular`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="In" htmlFor="bill-currency">
            <select
              id="bill-currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value, fxRate: "" }))}
              className={inputClass}
            >
              <option value="">MVR</option>
              {["USD", "EUR", "GBP", "AED", "INR", "CNY", "SGD", "JPY"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {form.currency && (
            <Field
              label={`MVR for 1 ${form.currency}`}
              htmlFor="bill-rate"
              hint={amountNow > 0 && Number(form.fxRate) > 0 ? `MVR ${formatAmount((amountNow * Number(form.fxRate)).toFixed(2))} in the books.` : undefined}
            >
              <input
                id="bill-rate"
                value={form.fxRate}
                onChange={set("fxRate")}
                inputMode="decimal"
                placeholder="15.42"
                className={`${inputClass} tabular`}
              />
            </Field>
          )}
        </div>

        <Field
          label="Bill number"
          htmlFor="bill-no"
          read={sure.includes("billNo")}
          hint="Worth having: it is how a supplier billing twice gets caught."
        >
          <input
            id="bill-no"
            value={form.billNo}
            onChange={set("billNo")}
            placeholder="INV-8841"
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field label="On which terms?">
          <TermsPicker
            issued={form.issueDate}
            terms={terms}
            due={form.dueDate}
            party={party}
            keep={keepTerms}
            onKeep={can("record") ? setKeepTerms : null}
            onChange={({ terms: t, due }) => (setTerms(t), setForm((f) => ({ ...f, dueDate: due || "" })))}
          />
        </Field>

        <TagPicker value={form.tags} onChange={(tags) => setForm((x) => ({ ...x, tags }))} fieldClass={inputClass} />

        <fieldset>
          <legend className="text-sm font-medium text-[var(--ink)] mb-2 flex items-center gap-1.5">
            How was the GST quoted?
            {sure.includes("gstTreatment") && (
              <span className="inline-flex items-center gap-1 text-[12px] font-normal text-[var(--success)]">
                <Check size={13} aria-hidden="true" />
                read off the bill
              </span>
            )}
          </legend>
          <div className="space-y-1.5">
            {TAX_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                  board ? "rounded-2xl border" : "rounded-[var(--radius-control)] border"
                } ${
                  form.gstTreatment !== choice.value
                    ? "border-[var(--border)] hover:bg-[var(--surface-2)]"
                    : atRisk === "gstTreatment"
                      ? // The option that is set carries the yellow while the
                        // tax is what is in doubt, so "what it is now" stays
                        // visible while somebody picks.
                        "on-yellow border-[var(--ink)] bg-[var(--accent)] text-[var(--on-accent)]"
                      : "border-[var(--ink)] bg-[var(--surface-2)]"
                }`}
              >
                <input
                  type="radio"
                  name="gstTreatment"
                  value={choice.value}
                  checked={form.gstTreatment === choice.value}
                  onChange={set("gstTreatment")}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--ink)]">
                    {choice.label}
                  </span>
                  <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5 leading-snug">
                    {choice.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {duplicates.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-control)] bg-[var(--accent-soft)] p-4"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--accent-strong)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            You may have this one already
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((d) => (
              <li key={d.billId} className="text-[13px] text-[var(--ink)] leading-snug">
                {d.because}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2.5 leading-snug">
            It has been recorded either way, so nothing is lost. It will not go into the books
            until someone sorts out which one is right.
          </p>
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Right, I will look
            </Button>
          </div>
        </div>
      )}

      {err && (
        <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
          {err}
        </p>
      )}

      {duplicates.length === 0 && (
        /* On the board this stays on screen. The sheet is longer than a phone
           and the commitment was below the fold, which asks somebody holding a
           bill to go looking for the thing they came to do. */
        <div
          className={
            board
              ? "sticky -bottom-6 -mx-5 -mb-6 mt-6 flex items-center gap-2 bg-[var(--surface)] px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-14px_rgb(0_0_0/0.25)]"
              : "flex items-center justify-end gap-2 mt-6"
          }
        >
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className={board ? "rounded-2xl h-[52px]" : undefined}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            // One yellow field. While something on this sheet is in doubt, the
            // doubt wears it and the button does not.
            variant={atRisk ? "outline" : "accent"}
            disabled={record.isPending}
            className={
              board
                ? "rounded-2xl h-[52px] flex-1"
                : undefined
            }
          >
            {record.isPending && <Loader2 size={14} className="animate-spin" />}
            {commitment}
          </Button>
        </div>
      )}

      <ItemPicker
        open={flow === "items"}
        setOpen={(v) => setFlow((x) => (v ? "items" : x === "items" ? null : x))}
        side="purchase"
        items={(stockItems || []).filter((it) => !it.archived && it.buys !== false)}
        onAdd={(item, l) => setItems((all) => [...all, { item, quantity: l.quantity, uom: l.uom, rate: l.rate }])}
        basket={
          <Basket
            lines={priced.map((l, i) => ({ key: i, label: l.item.name, detail: `${l.quantity} ${l.uom} × ${laariShown(cents(l.rate))}`, amount: laariShown(l.line) }))}
            onRemove={(i) => setItems((all) => all.filter((_, j) => j !== i))}
            onNext={() => (setForm((f) => ({ ...f, gstTreatment: fromItems.treatment })), setFlow("tax"))}
            nextLabel={`${items.length} ${items.length === 1 ? "item" : "items"} · MVR ${laariShown(itemsLine)} · Next: GST`}
          />
        }
      />

      <Modal open={flow === "tax"} onClose={() => setFlow(null)} title="How was the GST quoted?" variant={board ? "sheet" : "card"}>
        <div role="radiogroup" aria-label="GST" className="grid gap-2">
          {TAX_CHOICES.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={form.gstTreatment === c.value} onClick={() => setForm((f) => ({ ...f, gstTreatment: c.value }))}
              className={`rounded-2xl border p-3 text-left ${form.gstTreatment === c.value ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--border)] hover:border-[var(--ink)]"}`}>
              <span className="block text-[15px] font-semibold">{c.label}</span>
              <span className={`block text-[13px] ${form.gstTreatment === c.value ? "opacity-75" : "text-[var(--ink-muted)]"}`}>{c.hint}</span>
            </button>
          ))}
        </div>
        <ItemsTaxNote from={fromItems} doc="bill" />
        <p className="mt-4 flex justify-between text-[15px] font-semibold tabular border-t border-[var(--ink)] pt-2">
          <span>The bill comes to</span>
          <span>MVR {laariShown(itemsGross)}</span>
        </p>
        <FlowButtons back={() => setFlow("items")} next={() => setFlow("terms")} label="Next: terms" />
      </Modal>

      <Modal open={flow === "terms"} onClose={() => setFlow(null)} title="When is it due?" variant={board ? "sheet" : "card"}>
        <TermsPicker
          issued={form.issueDate}
          terms={terms}
          due={form.dueDate}
          party={party}
          keep={keepTerms}
          onKeep={can("record") ? setKeepTerms : null}
          onChange={({ terms: t, due }) => (setTerms(t), setForm((f) => ({ ...f, dueDate: due || "" })))}
        />
        <FlowButtons back={() => setFlow("tax")} next={() => setFlow("more")} label={form.dueDate ? "Next" : "Skip"} />
      </Modal>

      <Modal open={flow === "more"} onClose={() => setFlow(null)} title="The bill itself" description="As printed on it. The number is how a bill sent twice gets caught." variant={board ? "sheet" : "card"}>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 min-w-0">
            <span className="text-[13px] font-medium">Bill number</span>
            <input id="flow-bill-no" value={form.billNo} onChange={set("billNo")} placeholder="INV-8841" className={`${inputClass} tabular`} />
          </label>
          <label className="grid gap-1.5 min-w-0">
            <span className="text-[13px] font-medium">Dated</span>
            <input type="date" value={form.issueDate} onChange={setIssued} className={`${inputClass} tabular`} />
          </label>
        </div>
        {err && (
          <p role="alert" className="text-[13px] text-[var(--danger)] mt-4">
            {err}
          </p>
        )}
        <FlowButtons back={() => setFlow("terms")} next={() => (setFlow(null), submit())} busy={record.isPending} disabled={!party || !items.length} label={`Record MVR ${laariShown(itemsGross)}`} testid="flow-create" />
      </Modal>
    </Modal>
  );
}

const FIELD =
  "w-full px-4 bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none";

const DESK_INPUT =
  `${FIELD} h-11 rounded-[var(--radius-control)] border border-[var(--border)] text-[15px] focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15`;

// Taller and larger on a phone: a field there is aimed at with a thumb and
// read at arm's length. Rounded and soft-edged, like the rest of the phone.
const BOARD_INPUT =
  `${FIELD} h-[52px] min-w-0 rounded-2xl border border-[var(--border)] text-[17px] focus:border-[var(--ink)] focus:ring-[3px] focus:ring-[var(--ink)]/15`;

function Field({ label, htmlFor, hint, children, read }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-[var(--ink)] mb-1.5 flex items-center gap-1.5"
      >
        {label}
        {/* Read off the paper and not in doubt. Saying so is the difference
            between a review and a form. */}
        {read && (
          <span className="inline-flex items-center gap-1 text-[12px] font-normal text-[var(--success)]">
            <Check size={13} aria-hidden="true" />
            read off the bill
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-[13px] text-[var(--ink-muted)] mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

/** Groups what the person typed, without changing what they typed. */
function formatAmount(raw) {
  const clean = String(raw).replace(/,/g, "").trim();
  const n = Number(clean);
  if (!Number.isFinite(n)) return clean;
  const [whole, fraction = ""] = clean.split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
