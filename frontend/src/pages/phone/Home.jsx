import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useOutbox } from "@/context/OutboxContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";

/**
 * Home, on the board.
 *
 * The band carries the figure that matters now. It is meant to be cash and
 * bank, and it says so once a statement has been imported. Until then there is
 * no cash figure that is true, so the band carries what is true instead — what
 * is owed — and the line underneath says why. A yellow band with an invented
 * balance on it would be the worst possible use of the one yellow field.
 *
 * Everything below comes from journal lines. Nothing on this screen is read
 * from the purchased product's tables, and no accounting word reaches it.
 */

export default function PhoneHome() {
  const { can } = useCompany();
  return can("read") ? <BooksHome /> : <SendHome />;
}

/**
 * Home for someone whose job is to send bills in, not to read the books:
 * site staff. The camera, and nothing that would only say "not allowed".
 */
function SendHome() {
  const { companyId, can } = useCompany();
  const { count } = useOutbox();
  const [snapping, setSnapping] = useState(false);
  const { data: tins } = useQuery({
    queryKey: ["cash", companyId],
    queryFn: () => apiClient.get("/cash").then((r) => r.data.boxes),
    enabled: Boolean(companyId) && can("spend_cash"),
  });
  const waiting = (tins || []).filter((t) => t.yours).flatMap((t) => t.handed || []);
  return (
    <PhoneShell
      heading="Send a bill"
      unit=""
      figure="Snap it"
      position="The office puts it in the books"
      sync={count > 0 ? `${count} waiting` : "Up to date"}
      onSnap={() => setSnapping(true)}
    >
      {waiting.length > 0 && (
        <Link
          to="/cash"
          className="block mx-5 mt-4 p-4 border-2 border-[var(--ink)] on-yellow bg-[var(--accent)]"
          data-testid="cash-waiting"
        >
          <div className="font-display text-[22px] font-bold leading-tight">
            MVR {waiting.map((h) => h.amount).join(" + ")} handed to you
          </div>
          <div className="text-[14px] mt-1">Tap to confirm you received it.</div>
        </Link>
      )}
      <div className="px-5 pt-5">
        <div className="border-t pt-4 font-display text-[28px] leading-[1.05] font-bold" style={{ borderColor: "var(--border)" }}>
          Every bill, as it arrives
        </div>
        <p className="mt-2 text-[15px] leading-[1.45]">
          Press the yellow button, photograph the bill, check what was read, and send it. No signal? It waits on this
          phone and sends itself later.
        </p>
      </div>
      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}

function BooksHome() {
  const { companyId } = useCompany();
  const { count } = useOutbox();
  const [snapping, setSnapping] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["figures", companyId],
    queryFn: () => apiClient.get("/figures").then((r) => r.data),
    enabled: Boolean(companyId),
  });

  const f = data || {};
  const cashKnown = Boolean(f.cashIsReal);

  const band = cashKnown
    ? {
        heading: "Cash & bank now",
        figure: f.inBankAndCash,
        position: `${f.entries || 0} in the books`,
      }
    : {
        heading: "Owed to suppliers",
        figure: f.owedToSuppliers || "0.00",
        position: "Bank not connected yet",
      };

  const peak = Math.max(1, ...(f.spendByAccount || []).map((x) => x.raw));

  return (
    <PhoneShell
      heading={isPending ? "Reading the books" : band.heading}
      unit={f.currency || "MVR"}
      figure={isPending ? "—" : band.figure}
      position={isPending ? "" : band.position}
      sync={count > 0 ? `${count} waiting` : "Up to date"}
      onSnap={() => setSnapping(true)}
    >
      {f.entries === 0 ? (
        <div className="px-5 pt-5">
          <div
            className="border-t pt-4 font-display text-[28px] leading-[1.05] font-bold"
            style={{ borderColor: "var(--border)" }}
          >
            Nothing recorded yet
          </div>
          <p className="mt-2 text-[15px] leading-[1.45]">
            Snap your first bill with the yellow button. Three taps: snap it, check what we
            read, record it.
          </p>
        </div>
      ) : (
        <>
          {(f.spendByAccount || []).length > 0 && (
            <>
              <div className="phone-section">
                <span className="phone-section-h">Where it went</span>
              </div>
              <div className="px-5 flex flex-col gap-3 pb-1">
                {f.spendByAccount.slice(0, 4).map((c) => (
                  <Bar key={c.name} label={c.name} amount={c.amount} share={c.raw / peak} />
                ))}
              </div>
            </>
          )}

          <div className="phone-section">
            <span className="phone-section-h">In the books</span>
            <Link to="/bills" className="phone-section-side">
              See all
            </Link>
          </div>

          <div className="phone-rule">
            {(f.recent || []).map((e) => (
              <div key={e.entryNo} className="phone-row">
                <div className="phone-row-date">{shortDate(e.date)}</div>
                <div className="min-w-0">
                  <div className="phone-row-who">{who(e.narrative)}</div>
                  <div className="phone-row-what">Entry {e.entryNo}</div>
                </div>
                <div className="phone-row-amount is-out">−{e.amount}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}

function Bar({ label, amount, share }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[13px] font-bold uppercase tracking-[0.14em] truncate">
          {label}
        </span>
        <span className="tabular text-[15px] font-semibold shrink-0">{amount}</span>
      </div>
      <div className="phone-bar-track">
        <span
          className="phone-bar-fill"
          style={{ width: `${Math.max(3, Math.round(share * 100))}%` }}
        />
      </div>
    </div>
  );
}

/** "Bill from Island Zone · 244" reads as the supplier on a 46px-wide board. */
function who(narrative) {
  if (!narrative) return "Entry";
  return narrative.replace(/^Bill from\s+/i, "").split(" · ")[0];
}

function shortDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`.toUpperCase();
}
