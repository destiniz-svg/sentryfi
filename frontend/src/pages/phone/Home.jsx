import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useOutbox } from "@/context/OutboxContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";

/**
 * Home, on the board: the expense manager, for site staff and cash holders.
 * Everyone who reads the books gets the main app (pages/mobile/Home.jsx).
 */
export default function SendHome() {
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
