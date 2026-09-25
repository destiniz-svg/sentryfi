import { useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RecordBill } from "@/components/bills/RecordBill";
import { WaitingToSend } from "@/components/bills/WaitingToSend";
import { BillList } from "@/components/bills/BillList";
import { useBills } from "@/hooks/useBills";
import { useCompany } from "@/context/CompanyContext";

/**
 * What is owed, and what still needs a person.
 *
 * Bills that are in the books and bills that are waiting are shown in one
 * list, because the useful question is "what needs me?" rather than "show me
 * the posted ones". A bill waiting on a decision says which decision, in the
 * row, so the answer never requires opening it.
 */

export default function Bills() {
  const { data: bills, isLoading } = useBills();
  const { can } = useCompany();

  const [recording, setRecording] = useState(false);

  const canRecord = can("record");

  return (
    <div>
      <PageHeader
        title="Bills"
        description="What you owe, and what is still waiting on a decision."
        actions={
          canRecord &&
          bills?.length > 0 && (
            <Button variant="accent" onClick={() => setRecording(true)}>
              <Plus size={16} /> Record a bill
            </Button>
          )
        }
      />

      {/* Above the list, because a bill held on the phone is not in the list
          — and somebody looking for the one they just photographed needs to
          find it here rather than conclude it was lost. */}
      <WaitingToSend />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !bills?.length ? (
        <EmptyState
          icon={Receipt}
          title="Nothing recorded yet"
          description={
            canRecord
              ? "Record the first one. It takes what is on the paper and nothing more."
              : "Nothing has been recorded here yet."
          }
          action={
            canRecord && (
              <Button variant="outline" onClick={() => setRecording(true)}>
                <Plus size={16} /> Record a bill
              </Button>
            )
          }
        />
      ) : (
        <BillList bills={bills} />
      )}

      <RecordBill open={recording} onClose={() => setRecording(false)} />
    </div>
  );
}
