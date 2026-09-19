import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { billsApi } from "@/api/bills";
import { useCompany } from "@/context/CompanyContext";
import { hold, send, waiting } from "@/lib/queue";

/**
 * What is still on the phone.
 *
 * Sends when the connection comes back, when the app is opened, and when the
 * tab is looked at again — because on a site the signal returns while the
 * phone is in a pocket, and nobody should have to remember to come back and
 * press something.
 */

const OutboxContext = createContext(null);

export function OutboxProvider({ children }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const refresh = useCallback(async () => {
    const all = await waiting();
    setItems(all.filter((i) => !companyId || i.companyId === companyId));
  }, [companyId]);

  const flush = useCallback(async () => {
    if (!companyId || sending || !navigator.onLine) return undefined;
    setSending(true);
    try {
      const result = await send({
        companyId,
        record: billsApi.record,
        attach: billsApi.attach,
        put: billsApi.post,
      });
      if (result.sent > 0) {
        queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
        queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
        queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
      }
      await refresh();
      return result;
    } finally {
      setSending(false);
    }
  }, [companyId, sending, queryClient, refresh]);

  const queue = useCallback(
    async ({ payload, files }) => {
      const ref = await hold({ companyId, payload, files });
      await refresh();
      // Try immediately: "offline" is often a request that failed rather than
      // a connection that is genuinely down.
      flush();
      return ref;
    },
    [companyId, refresh, flush]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    // The signal comes back while the phone is in a pocket, so the app has to
    // notice on its own rather than waiting to be opened.
    const look = () => {
      if (document.visibilityState === "visible") flush();
    };

    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", look);
    };
  }, [flush]);

  const value = useMemo(
    () => ({ items, count: items.length, sending, online, queue, flush, refresh }),
    [items, sending, online, queue, flush, refresh]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox must be used inside OutboxProvider");
  return ctx;
}
