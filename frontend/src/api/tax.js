import { apiClient } from "./client";

export const taxApi = {
  /** The company's tax pack and each rate in force on a date (today if none). */
  overview: (on) => apiClient.get("/tax", { params: on ? { on } : {} }).then((r) => r.data),

  /** A rate from a date. Earlier documents keep the rate they were computed at. */
  setRate: (payload) => apiClient.post("/tax/rates", payload).then((r) => r.data),
};
