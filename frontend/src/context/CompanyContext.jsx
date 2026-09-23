import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setRequestCompany } from "@/api/client";
import { companiesApi } from "@/api/companies";
import { useAuth } from "@/context/AuthContext";
import { remembered } from "@/lib/kept";

/**
 * Which company the screens are looking at.
 *
 * The books are kept per company and the database decides what exists from
 * which company is asking, so every request has to say. That is done with a
 * header rather than by putting the company in every URL, because it applies
 * to all of them and a URL that forgot it would silently read the wrong set of
 * books.
 *
 * Roles are per company too. The same person can be an administrator in one
 * entity and a viewer in another, so what they may do is re-read when the
 * company changes rather than attached to the user once at sign-in. The
 * answer comes from the server: the screens must not be the thing deciding
 * what someone is allowed to do.
 */

const CompanyContext = createContext(null);
const REMEMBERED = "sentryfi.company";

function remember(id) {
  try {
    window.localStorage.setItem(REMEMBERED, id);
  } catch {
    // Private windows and blocked site data both throw. Not remembering which
    // company was last open is a small loss; crashing is not.
  }
}

function recall() {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState(null);

  const companiesQuery = useQuery({
    queryKey: ["companies", user?.id],
    queryFn: remembered(`companies:${user?.id}`, companiesApi.mine),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const companies = companiesQuery.data;

  // Which one is open: the explicit choice, else the last one used if they are
  // still in it, else the first. Derived rather than stored, so it cannot go
  // stale against the list.
  const companyId = useMemo(() => {
    if (!companies?.length) return null;
    if (chosenId && companies.some((c) => c.id === chosenId)) return chosenId;
    const last = recall();
    if (last && companies.some((c) => c.id === last)) return last;
    return companies[0].id;
  }, [companies, chosenId]);

  // Tell the request layer which company everything is about. Done in an
  // effect rather than during render, because mutating module state while
  // rendering is not safe: React may render twice or abandon a render.
  //
  // The one call that cannot wait for this is the one that establishes the
  // company in the first place, so it passes the id explicitly instead.
  useEffect(() => {
    setRequestCompany(companyId);
    if (companyId) remember(companyId);
  }, [companyId]);

  const contextQuery = useQuery({
    queryKey: ["company-context", companyId],
    queryFn: remembered(`company:${companyId}`, () => companiesApi.current(companyId)),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const choose = useCallback((id) => setChosenId(id), []);

  const open = useCallback(
    async (payload) => {
      const result = await companiesApi.open(payload);
      setChosenId(result.company.id);
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      return result.company;
    },
    [queryClient]
  );

  const ctx = contextQuery.data;

  const value = useMemo(
    () => ({
      companies: companies || [],
      company: ctx?.company || null,
      companyId,
      roles: ctx?.roles || [],
      /** Ask by capability, never by role name. */
      can: (action) => Boolean(ctx?.can?.[action]),
      /** The ordinary first-run state, not an error. */
      needsFirstCompany:
        Boolean(user) && companiesQuery.isSuccess && (companies?.length ?? 0) === 0,
      // A disabled query reports isPending in TanStack v5, so the context
      // query only counts as loading when there is a company for it to load.
      // Without that guard, someone with no companies waits forever on a
      // spinner instead of being asked to open their first set of books —
      // which is precisely the case this whole screen exists for.
      loading:
        Boolean(user) &&
        (companiesQuery.isPending || (Boolean(companyId) && contextQuery.isPending)),
      error: companiesQuery.error?.message || contextQuery.error?.message || "",
      choose,
      open,
      reload: companiesQuery.refetch,
    }),
    [
      companies, ctx, companyId, user, choose, open,
      companiesQuery.isPending, companiesQuery.isSuccess, companiesQuery.error,
      companiesQuery.refetch, contextQuery.isPending, contextQuery.error,
    ]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside CompanyProvider");
  return ctx;
}
