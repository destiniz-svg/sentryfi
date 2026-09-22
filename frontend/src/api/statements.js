import { apiClient } from "./client";

export const statementsApi = {
  trialBalance: (asAt) => apiClient.get("/statements/trial-balance", { params: { asAt } }).then((r) => r.data),
  profitAndLoss: (from, to) => apiClient.get("/statements/profit-and-loss", { params: { from, to, compare: 1 } }).then((r) => r.data),
  balanceSheet: (asAt) => apiClient.get("/statements/balance-sheet", { params: { asAt, compare: 1 } }).then((r) => r.data),
};
