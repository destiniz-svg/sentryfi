import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billsApi } from "@/api/bills";
import { useCompany } from "@/context/CompanyContext";

/**
 * Bills are per company, so the company is part of the cache key. Without it,
 * switching company would show the previous one's bills until something
 * happened to invalidate them — which is the kind of mistake that is very hard
 * to notice and very bad when it happens in a set of books.
 */
export function useBills() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["bills", companyId],
    queryFn: billsApi.list,
    enabled: Boolean(companyId),
  });
}

export function useBillMutations() {
  const queryClient = useQueryClient();
  const { companyId } = useCompany();

  // Posting a bill writes to the ledger, so the figures on every other screen
  // are stale the moment it succeeds.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bills", companyId] });
    queryClient.invalidateQueries({ queryKey: ["figures", companyId] });
    queryClient.invalidateQueries({ queryKey: ["attention", companyId] });
  };

  return {
    record: useMutation({ mutationFn: billsApi.record, onSuccess: invalidate }),
    post: useMutation({ mutationFn: billsApi.post, onSuccess: invalidate }),
    voidBill: useMutation({
      mutationFn: ({ id, reason }) => billsApi.void(id, reason),
      onSuccess: invalidate,
    }),
  };
}
