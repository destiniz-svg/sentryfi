import { apiClient } from "./client";

export const billsApi = {
  list: () => apiClient.get("/bills").then((r) => r.data.bills),

  /**
   * Records a bill without posting it. Returns the bill and anything that
   * looks like a duplicate, so the person can be told before it matters.
   */
  record: (payload) => apiClient.post("/bills", payload).then((r) => r.data),

  /** Puts a recorded bill into the books. */
  post: (id) => apiClient.post(`/bills/${id}/post`).then((r) => r.data),

  /** Voided, never deleted. */
  void: (id, reason) =>
    apiClient.delete(`/bills/${id}`, { data: { reason } }).then((r) => r.data),
};
