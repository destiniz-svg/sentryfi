import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useOutbox } from "@/context/OutboxContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";
import { laariText } from "@/components/mobile/parts";

/**
 * Owed back: what the person holding a tin has paid out of their own pocket.
 *
 * A tin that runs dry and keeps being spent from goes below zero, and that
 * minus is the holder's own money (routes/cash.js, paidByHolder). It comes
 * back when the office tops the tin up. Nothing here is stored: it is read
 * from the tin's journal lines, the same as the Tin screen.
 */

const laari = (s) => (s ? BigInt(String(s).replace(/[^0-9-]/g, "")) : 0n);

export default function PhoneOwed() {
  const { companyId } = useCompany();
  const { count } = useOutbox();
  const [snapping, setSnapping] = useState(false);
  const { data: tins, isPending } = useQuery({
    queryKey: ["cash", companyId],
    queryFn: () => apiClient.get("/cash").then((r) => r.data.boxes),
    enabled: Boolean(companyId),
  });

  const mine = (tins || []).filter((t) => t.yours);
  const owed = mine.reduce((s, t) => s + laari(t.paidByHolder), 0n);
  const onItsWay = mine.flatMap((t) => t.handed || []);

  return (
    <PhoneShell
      heading="Owed back to you"
      figure={isPending ? "—" : laariText(owed)}
      position={isPending ? "" : owed > 0n ? "Paid from your own pocket" : "You are not out of pocket"}
      sync={count > 0 ? `${count} waiting` : "Up to date"}
      onSnap={() => setSnapping(true)}
    >
      {onItsWay.length > 0 && (
        <Link to="/cash" className="block mx-5 mt-4 p-4 border-2 border-[var(--ink)] on-yellow bg-[var(--accent)]">
          <div className="font-display text-[22px] font-bold leading-tight">
            MVR {onItsWay.map((h) => h.amount).join(" + ")} is on its way to you
          </div>
          <div className="text-[14px] mt-1">Tap to confirm you received it. It pays back what you are owed first.</div>
        </Link>
      )}

      {mine.length > 0 && (
        <>
          <div className="phone-section">
            <span className="phone-section-h">Your {mine.length === 1 ? "tin" : "tins"}</span>
          </div>
          <div className="phone-rule">
            {mine.map((t) => (
              <Link key={t.id} to="/cash" className="phone-row">
                <div className="min-w-0 col-span-2">
                  <div className="phone-row-who">{t.name}</div>
                  <div className="phone-row-what">
                    {t.paidByHolder ? `${t.inBox} in the tin` : `${t.inBox} in the tin · nothing owed`}
                  </div>
                </div>
                <div className={`phone-row-amount${t.paidByHolder ? " is-out" : ""}`}>{t.paidByHolder || "0.00"}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="px-5 pt-5 pb-2">
        <div className="border-t pt-4 font-display text-[24px] leading-[1.05] font-bold" style={{ borderColor: "var(--border)" }}>
          {mine.length === 0 ? "No tin is in your name" : "How it comes back"}
        </div>
        <p className="mt-2 text-[15px] leading-[1.45]">
          {mine.length === 0
            ? "When the office hands you a cash tin, anything you pay yourself after it runs out shows here."
            : "When the tin runs out and you pay from your own money, keep sending the bills. The tin goes below zero, and that minus is what the office owes you. It is paid back when they top the tin up."}
        </p>
      </div>

      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}
