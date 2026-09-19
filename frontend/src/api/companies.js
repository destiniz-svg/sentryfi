import { apiClient } from "./client";

export const companiesApi = {
  /** The companies this person belongs to, and what they are in each. */
  mine: () => apiClient.get("/companies").then((r) => r.data.companies),

  /** Opens a set of books. Whoever opens them is their administrator. */
  open: (payload) => apiClient.post("/companies", payload).then((r) => r.data),

  /**
   * A company, and what the signed-in person may do in it.
   *
   * Takes the id explicitly rather than relying on the request header, because
   * this is the call that establishes which company is current — it runs
   * before the header has been set, and passing it removes the ordering
   * question entirely.
   */
  current: (companyId) =>
    apiClient
      .get("/companies/current", { params: companyId ? { company: companyId } : undefined })
      .then((r) => r.data),

  /** Who else is in it. */
  people: () => apiClient.get("/companies/current/people").then((r) => r.data),
};
