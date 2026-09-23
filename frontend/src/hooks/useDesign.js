import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";

/** The brand kit and one kind of document's template, for drawing it. */
export function useDesign(kind = "invoice") {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["branding", companyId, kind],
    queryFn: async () => {
      const [b, t] = await Promise.all([apiClient.get("/documents/brand"), apiClient.get(`/documents/templates/${kind}`)]);
      return { ...b.data, template: t.data.template };
    },
    enabled: Boolean(companyId),
  });
}
