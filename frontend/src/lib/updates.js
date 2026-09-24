/**
 * Keeping the app current without interrupting anybody.
 *
 * A service worker that never updates is dangerous in an app that handles
 * money: a fix to how a figure is worked out has to reach the phone that is
 * using it. A service worker that reloads the moment it updates is also
 * dangerous, because it can do it while somebody is halfway through typing a
 * bill.
 *
 * So the new version is taken immediately and applied while the phone is in a
 * pocket — when the tab goes hidden, and never while it is being looked at.
 * Nothing is ever lost to it: what is being sent lives in the outbox, not in
 * the page.
 */

let pending = false;
let apply = null;

export async function watchForUpdates() {
  if (!("serviceWorker" in navigator)) return;

  const { registerSW } = await import("virtual:pwa-register");

  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      maybe();
    },
  });

  document.addEventListener("visibilitychange", maybe);
}

function maybe() {
  if (!pending || !apply) return;
  if (document.visibilityState !== "hidden") return;
  pending = false;
  apply(true);
}

/**
 * Moving to another screen is also a safe moment: nothing is being typed.
 * Called on each navigation; a waiting version is taken there, so an app left
 * open all day does not keep running yesterday's code.
 */
export function atNavigation() {
  if (!pending || !apply) return;
  pending = false;
  apply(true);
}

const RELOADED = "sentryfi.reloaded-for";
/**
 * After a new version goes live, an app still showing the old one can ask for
 * a piece of itself that is no longer there: "This screen did not load". Such
 * a failure is fixed by loading the new version, once, rather than shown.
 * Returns true when it reloads.
 */
export function recoverFromStaleCode(error) {
  const msg = String(error?.message || error || "");
  if (!/dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|Unable to preload CSS|ChunkLoadError/i.test(msg)) return false;
  let last = null;
  try {
    last = sessionStorage.getItem(RELOADED);
  } catch {
    /* no storage: still reload, just not guarded */
  }
  // Once a minute at most, so a real outage does not loop.
  if (last && Date.now() - Number(last) < 60_000) return false;
  try {
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    /* ignore */
  }
  if (apply) apply(true);
  else window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  // Vite says so before React ever sees the failure.
  window.addEventListener("vite:preloadError", (e) => {
    if (recoverFromStaleCode(e.payload || e)) e.preventDefault();
  });
}
