import { apiClient } from "./client";

export const bankApi = {
  /** Bank accounts and open cash boxes, with what the books say is in each. */
  places: () => apiClient.get("/bank").then((r) => r.data.places),

  open: (name, currency) => apiClient.post("/bank", { name, currency: currency || null }).then((r) => r.data.account),

  /** The latest rate recorded on or before a date, offered for the next foreign document. */
  rate: (currency, on) => apiClient.get("/bank/rates", { params: { currency, on } }).then((r) => r.data),
  recordRate: (body) => apiClient.post("/bank/rates", body).then((r) => r.data),

  /** clientRef makes a resend land on the first attempt instead of moving the money twice. */
  transfer: (payload) => apiClient.post("/bank/transfer", payload).then((r) => r.data),

  /** The CSV exactly as the bank sent it, so the parser sees every byte. */
  statement: (accountId, csv) =>
    apiClient
      .post(`/bank/${accountId}/statement`, csv, { headers: { "Content-Type": "text/csv" } })
      .then((r) => r.data),

  /** The questions the bank has raised that the books cannot answer, biggest money first. */
  waiting: (accountId) => apiClient.get(`/bank/${accountId}/waiting`).then((r) => r.data),

  /** The lines behind one question, each with what the books could say about it. */
  waitingLines: (accountId, who, moneyIn) =>
    apiClient.get(`/bank/${accountId}/waiting/lines`, { params: { who, moneyIn } }).then((r) => r.data.lines),

  answered: (accountId) => apiClient.get(`/bank/${accountId}/answered`).then((r) => r.data.lines),

  /** Everything to one payee, answered the same way. Posts one entry per line. */
  postGroup: (accountId, body) => apiClient.post(`/bank/${accountId}/group`, body).then((r) => r.data),
  setAsideGroup: (accountId, body) => apiClient.post(`/bank/${accountId}/group/set-aside`, body).then((r) => r.data),

  link: (lineId, entryId) => apiClient.post(`/bank/lines/${lineId}/link`, { entryId }).then((r) => r.data),
  postLine: (lineId, body) => apiClient.post(`/bank/lines/${lineId}/post`, body).then((r) => r.data),
  receive: (lineId, invoiceId) => apiClient.post(`/bank/lines/${lineId}/receive`, { invoiceId }).then((r) => r.data),
  setAside: (lineId) => apiClient.post(`/bank/lines/${lineId}/set-aside`, {}).then((r) => r.data),
  undo: (lineId) => apiClient.post(`/bank/lines/${lineId}/undo`).then((r) => r.data),
};
