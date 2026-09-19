import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { billsApi } from "@/api/bills";
import { useCompany } from "@/context/CompanyContext";

/**
 * The ten seconds after something is put into the books.
 *
 * Posting is irreversible by design — an entry is never edited and never
 * deleted — so the honest version of "undo" is a second, opposite entry with a
 * reason on it. Ten seconds is the window where that reason is genuinely "that
 * was the wrong bill" rather than a change of mind about the books.
 *
 * Why it is held here and not on the screen that posted: the confirm loop ends
 * by returning Home, so the undo has to outlive the sheet that started it. It
 * occupies Home's one strip slot, which is 44px tall and never changes height,
 * and is followed by a six-second notice saying what the undo did.
 */

const UndoContext = createContext(null);
const WINDOW = 10;
const NOTICE = 6;

export function UndoProvider({ children }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const [posted, setPosted] = useState(null); // { billId, entryNo, total, who }
  const [left, setLeft] = useState(0);
  const [notice, setNotice] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const offer = useCallback((entry) => {
    clearTimers();
    setNotice(null);
    setPosted(entry);
    setLeft(WINDOW);
  }, []);

  // The countdown is real: it is what the strip shows, and when it reaches
  // zero the offer is gone rather than quietly still working.
  useEffect(() => {
    if (!posted) return undefined;
    // One timer, counting down and then letting go. Splitting "tick" from
    // "expire" meant the offer sat at zero for a render still accepting taps.
    const t = setTimeout(() => {
      if (left <= 1) setPosted(null);
      else setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [posted, left]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
    queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
  }, [queryClient, companyId]);

  const undo = useCallback(async () => {
    if (!posted || undoing) return;
    setUndoing(true);
    const taken = posted;
    try {
      const result = await billsApi.reverse(taken.billId);
      setPosted(null);
      setNotice(
        `Taken back out. Entry ${taken.entryNo} and its reversal ${result.entryNo} both stay in the journal.`
      );
      refresh();
      const t = setTimeout(() => setNotice(null), NOTICE * 1000);
      timers.current.push(t);
    } catch (err) {
      // A failed undo must not look like a successful one. The entry is still
      // in the books and the strip says so.
      setPosted(null);
      setNotice(err.message || "It could not be taken back out. It is still in the books.");
      const t = setTimeout(() => setNotice(null), NOTICE * 1000);
      timers.current.push(t);
    } finally {
      setUndoing(false);
    }
  }, [posted, undoing, refresh]);

  const value = useMemo(
    () => ({ posted, left, notice, undoing, offer, undo }),
    [posted, left, notice, undoing, offer, undo]
  );

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used inside UndoProvider");
  return ctx;
}
