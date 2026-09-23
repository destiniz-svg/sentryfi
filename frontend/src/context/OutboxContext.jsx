import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { billsApi } from "@/api/bills";
import { useCompany } from "@/context/CompanyContext";
import { hold, mine, send, waiting, holdSend, waitingSends, sendAll, dropSend } from "@/lib/queue";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

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
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [sends, setSends] = useState([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const refresh = useCallback(async () => {
    const [all, other] = await Promise.all([waiting(), waitingSends()]);
    setItems(companyId && userId ? mine(all, { companyId, userId }) : []);
    setSends(companyId && userId ? mine(other, { companyId, userId }) : []);
  }, [companyId, userId]);

  const flush = useCallback(async () => {
    if (!companyId || !userId || sending || !navigator.onLine) return undefined;
    setSending(true);
    try {
      const result = await send({
        companyId,
        userId,
        record: billsApi.record,
        attach: billsApi.attach,
        put: billsApi.post,
      });
      const others = await sendAll({
        companyId,
        userId,
        go: (item) => apiClient.request({ method: item.method, url: item.url, data: item.body, headers: { "Idempotency-Key": item.ref, "X-Company-Id": item.companyId } }),
      });
      // What was sent may show on any screen: read everything again.
      if (others.sent > 0) queryClient.invalidateQueries();
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
  }, [companyId, userId, sending, queryClient, refresh]);

  const queue = useCallback(
    async ({ payload, files }) => {
      const ref = await hold({ companyId, userId, payload, files });
      await refresh();
      // Try immediately: "offline" is often a request that failed rather than
      // a connection that is genuinely down.
      flush();
      return ref;
    },
    [companyId, userId, refresh, flush]
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

  /**
   * Send a write now, or keep it on the phone if there is no signal. Either
   * way it carries one key, so however often it is sent it happens once.
   * Returns { data } when the server answered, { queued: true } when kept.
   * A refusal (bad input, not allowed) is thrown as usual: that is not signal.
   */
  const sendOrKeep = useCallback(
    async ({ method = "post", url, body, label }) => {
      const ref = crypto.randomUUID();
      const keep = async () => {
        await holdSend({ ref, companyId, userId, method, url, body, label });
        await refresh();
        return { queued: true };
      };
      if (!navigator.onLine) return keep();
      try {
        const r = await apiClient.request({ method, url, data: body, headers: { "Idempotency-Key": ref } });
        return { data: r.data };
      } catch (err) {
        if (err?.status) throw err;
        return keep();
      }
    },
    [companyId, userId, refresh]
  );

  const discard = useCallback(
    async (ref) => {
      await dropSend(ref);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({ items, sends, count: items.length + sends.length, sending, online, queue, flush, refresh, sendOrKeep, discard }),
    [items, sends, sending, online, queue, flush, refresh, sendOrKeep, discard]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox must be used inside OutboxProvider");
  return ctx;
}

/**
 * A write from a field screen, shaped like useMutation: sent now with its own
 * key, or kept on the phone when there is no signal. make(arg) says what to
 * send: { url, body, label }. Resolves to the server's answer, or to
 * { queued: true } when it was kept.
 */
export function useSendOrKeep(make) {
  const { sendOrKeep } = useOutbox();
  const [isPending, setPending] = useState(false);
  const mutateAsync = async (arg) => {
    setPending(true);
    try {
      const r = await sendOrKeep(make(arg));
      return r.queued ? { queued: true } : r.data;
    } finally {
      setPending(false);
    }
  };
  return { mutateAsync, isPending };
}
