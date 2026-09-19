import { apiClient } from "./client";

export const billsApi = {
  list: () => apiClient.get("/bills").then((r) => r.data.bills),

  /**
   * Reads a photographed bill. Records nothing: the person sees what was read
   * off their paper before any of it becomes a record.
   */
  scan: (file) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post("/bills/scan", form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },

  /**
   * Records a bill without posting it. Returns the bill and anything that
   * looks like a duplicate, so the person can be told before it matters.
   */
  record: (payload) => apiClient.post("/bills", payload).then((r) => r.data),

  /** Keeps the photograph against the bill. */
  attach: (billId, file) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post(`/attachments/bills/${billId}`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },

  /** What paper a bill has. */
  paper: (billId) => apiClient.get(`/attachments/bills/${billId}`).then((r) => r.data.attachments),

  /** Puts a recorded bill into the books. */
  post: (id) => apiClient.post(`/bills/${id}/post`).then((r) => r.data),

  /**
   * Takes a posted bill back out of the books with a second, opposite entry.
   * Both stay in the journal: an entry that disappears is one nobody can audit.
   */
  reverse: (id, reason) =>
    apiClient.post(`/bills/${id}/reverse`, reason ? { reason } : {}).then((r) => r.data),

  /** Voided, never deleted. */
  void: (id, reason) =>
    apiClient.delete(`/bills/${id}`, { data: { reason } }).then((r) => r.data),
};
