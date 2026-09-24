import { useState } from "react";
import { useCompany } from "@/context/CompanyContext";
import { PhoneShell } from "@/components/phone/PhoneShell";
import { RecordBill } from "@/components/bills/RecordBill";

/**
 * A desk page shown to site staff: inside their phone board, so the inbox and
 * a conversation they were brought into feel like the rest of their app, with
 * the camera one press away. Everyone else gets the page as it is.
 */
export function FieldFrame({ figure, position = "", children }) {
  const { can } = useCompany();
  const [snapping, setSnapping] = useState(false);
  if (can("read")) return children;
  return (
    <PhoneShell heading="From the office" unit="" figure={figure} position={position} sync="" onSnap={() => setSnapping(true)}>
      <div className="px-5 pt-4 pb-8">{children}</div>
      <RecordBill open={snapping} onClose={() => setSnapping(false)} />
    </PhoneShell>
  );
}
