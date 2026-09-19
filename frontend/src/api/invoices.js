import { apiClient } from "./client";

export const invoicesApi = {
  // ── Real API (uncomment when backend is ready) ──
  list: (params = {}) => apiClient.get("/invoices", { params }).then((r) => r.data.invoices),
  get: (id) => apiClient.get(`/invoices/${id}`).then((r) => r.data.invoice),
  create: (payload) => apiClient.post("/invoices", payload).then((r) => r.data.invoice),
  update: (id, payload) => apiClient.patch(`/invoices/${id}`, payload).then((r) => r.data.invoice),
  setStatus: (id, status) => apiClient.patch(`/invoices/${id}/status`, { status }).then((r) => r.data.invoice),
  voidInvoice: (id, reason) =>
    apiClient.delete(`/invoices/${id}`, { data: { reason } }).then((r) => r.data),
};
