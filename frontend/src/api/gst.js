import { apiClient } from "./client";

/** Saves a file the server built, under the name it gave. */
async function save(path, fallback) {
  const r = await apiClient.get(path, { responseType: "blob" });
  const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] || "")?.[1] || fallback;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.data);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const gstApi = {
  /** "current" is the period whose return is due next. */
  get: (key = "current") => apiClient.get(`/gst/${key}`).then((r) => r.data),
  inputStatement: (key) => save(`/gst/${key}/input.xlsx`, "input-tax-statement.xlsx"),
  outputStatement: (key) => save(`/gst/${key}/output.xlsx`, "output-tax-statement.xlsx"),
  markFiled: (key, reference) => apiClient.post(`/gst/${key}/filed`, { reference }).then((r) => r.data),
  settings: (payload) => apiClient.post("/gst/settings", payload).then((r) => r.data),
};
