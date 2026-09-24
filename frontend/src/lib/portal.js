/**
 * The developer portal is this same app served at dev.sentryfi.app. On that
 * host the page is the portal and nothing else; everywhere else it is the app
 * customers use. `?portal` shows the portal on a local dev server; the server
 * still answers platform requests only on the portal's host in production.
 */
export const PORTAL_URL = "https://dev.sentryfi.app";

export const isPortal = () =>
  typeof window !== "undefined" &&
  (/^dev\./i.test(window.location.hostname) || new URLSearchParams(window.location.search).has("portal"));
