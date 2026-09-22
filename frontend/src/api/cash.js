import { apiClient } from "./client";

export const cashApi = {
  boxes: () => apiClient.get("/cash").then((r) => r.data.boxes),

  /** What a handful of cash can be spent on, in plain words. */
  kinds: () => apiClient.get("/cash/kinds").then((r) => r.data.kinds),

  open: (payload) => apiClient.post("/cash", payload).then((r) => r.data.box),

  /** Money out of the tin. Posted as it is recorded. */
  spend: (boxId, payload) => apiClient.post(`/cash/${boxId}/spend`, payload).then((r) => r.data),

  /** What is in the tin, against what the books say. */
  count: (boxId, payload) => apiClient.post(`/cash/${boxId}/count`, payload).then((r) => r.data),

  history: (boxId) => apiClient.get(`/cash/${boxId}/history`).then((r) => r.data),

  askFor: (boxId, payload) => apiClient.post(`/cash/${boxId}/topup`, payload).then((r) => r.data),

  /** Who holds a tin, and what it is meant to hold. */
  change: (boxId, payload) => apiClient.patch(`/cash/${boxId}`, payload).then((r) => r.data),

  /** Money handed to a tin: its float, or putting back what was spent. */
  giveTo: (boxId, payload) => apiClient.post(`/cash/${boxId}/give`, payload).then((r) => r.data),

  give: (topupId, given) =>
    apiClient.post(`/cash/topups/${topupId}/give`, given ? { given } : {}).then((r) => r.data),
};
