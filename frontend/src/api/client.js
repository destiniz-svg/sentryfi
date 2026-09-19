import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/**
 * Which company every request is about.
 *
 * The books are kept per company, so the server needs to know which set is
 * being read or written. It goes on every request through an interceptor
 * rather than being passed call by call, because a new endpoint that forgot it
 * would silently read the wrong books.
 *
 * Held in module scope and set from CompanyContext, so nothing has to mutate
 * axios during a render.
 */
let currentCompanyId = null;

export function setRequestCompany(id) {
  currentCompanyId = id || null;
}

apiClient.interceptors.request.use((config) => {
  if (currentCompanyId && !config.headers["X-Company-Id"]) {
    config.headers["X-Company-Id"] = currentCompanyId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error?.message ||
      err.message ||
      "Request failed";
    return Promise.reject({
      status: err.response?.status,
      message,
      details: err.response?.data?.error?.details,
      original: err,
    });
  }
);
