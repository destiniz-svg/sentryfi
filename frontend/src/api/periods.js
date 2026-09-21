import { apiClient } from "./client";

export const periodsApi = {
  /** The lock date, the acts that made it, the adjustments made into closed months, and what could be closed next. */
  overview: () => apiClient.get("/periods").then((r) => r.data),

  /** What is unfinished up to a month end, so somebody can look before closing. */
  doubts: (through) => apiClient.get("/periods/doubts", { params: { through } }).then((r) => r.data),

  accounts: () => apiClient.get("/periods/accounts").then((r) => r.data.accounts),

  close: (through) => apiClient.post("/periods/close", { through }).then((r) => r.data),
  reopen: (through, reason) => apiClient.post("/periods/reopen", { through, reason }).then((r) => r.data),
  adjust: (payload) => apiClient.post("/periods/adjust", payload).then((r) => r.data),
};
