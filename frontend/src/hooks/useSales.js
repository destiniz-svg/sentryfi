import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "@/api/sales";
import { useCompany } from "@/context/CompanyContext";

/**
 * Invoices are per company, so the company is part of every cache key — the
 * same reason as bills: switching company must never show the previous one's
 * money, even for the moment before a refetch.
 */
export function useSales() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales", companyId],
    queryFn: salesApi.list,
    enabled: Boolean(companyId),
  });
}

export function useAged() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["sales-aged", companyId],
    queryFn: salesApi.aged,
    enabled: Boolean(companyId),
  });
}

export function useSalesMutations() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();

  // Every one of these writes to the ledger or changes what is owed, so every
  // figure that reads either is stale the moment one succeeds.
  const invalidate = () => {
    // "sales-next" too: the suggested number was cached from the first time the
    // editor opened, so the second invoice in a row was offered the number the
    // first had just taken, and was refused.
    for (const key of ["sales", "sales-aged", "sales-next", "figures", "attention"]) {
      queryClient.invalidateQueries({ queryKey: [key, companyId] });
    }
  };

  return {
    raise: useMutation({ mutationFn: salesApi.raise, onSuccess: invalidate }),
    post: useMutation({ mutationFn: salesApi.post, onSuccess: invalidate }),
    receive: useMutation({ mutationFn: salesApi.receive, onSuccess: invalidate }),
    discard: useMutation({
      mutationFn: ({ id, reason }) => salesApi.discard(id, reason),
      onSuccess: invalidate,
    }),
    credit: useMutation({
      mutationFn: ({ id, ...payload }) => salesApi.credit(id, payload),
      onSuccess: invalidate,
    }),
  };
}
