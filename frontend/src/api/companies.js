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

  /** Who is in it, open invitations, and the last changes. */
  people: () => apiClient.get("/companies/current/people").then((r) => r.data),

  /** In at once if they have a login; otherwise a join token to send them. */
  addPerson: (body) => apiClient.post("/companies/current/people", body).then((r) => r.data),
  removeRole: (userId, role) => apiClient.delete(`/companies/current/people/${userId}/roles/${role}`).then((r) => r.data),
  withdrawInvite: (id) => apiClient.delete(`/companies/current/invites/${id}`).then((r) => r.data),
};
