
import { apiClient } from "./client";

export const dashboardApi = {
  // ── Real API (uncomment when backend is ready) ──
  get: () => apiClient.get("/dashboard").then((r) => r.data),
};
