import { apiClient } from "./client";

export const bankApi = {
  /** Bank accounts and open cash boxes, with what the books say is in each. */
  places: () => apiClient.get("/bank").then((r) => r.data.places),

  open: (name) => apiClient.post("/bank", { name }).then((r) => r.data.account),

  /** clientRef makes a resend land on the first attempt instead of moving the money twice. */
  transfer: (payload) => apiClient.post("/bank/transfer", payload).then((r) => r.data),
};
