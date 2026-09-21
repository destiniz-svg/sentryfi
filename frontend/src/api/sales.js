import { apiClient } from "./client";

export const salesApi = {
  list: () => apiClient.get("/sales").then((r) => r.data.invoices),

  /** Who owes what, and for how long. A ledger query, not a stored list. */
  aged: () => apiClient.get("/sales/aged").then((r) => r.data),

  /** The number the next invoice would carry, in the company's own run. */
  nextNumber: () => apiClient.get("/sales/next-number").then((r) => r.data.invoiceNo),

  /** The bank accounts and cash tins money can land in. */
  moneyAccounts: () => apiClient.get("/sales/money-accounts").then((r) => r.data.accounts),

  /** Records an invoice. Does not put it in the books. */
  raise: (payload) => apiClient.post("/sales", payload).then((r) => r.data),

  post: (id) => apiClient.post(`/sales/${id}/post`).then((r) => r.data),

  /** Money in, applied to the invoices it pays. */
  receive: (payload) => apiClient.post("/sales/receipts", payload).then((r) => r.data),

  credit: (id, payload) => apiClient.post(`/sales/${id}/credit`, payload).then((r) => r.data),
};
