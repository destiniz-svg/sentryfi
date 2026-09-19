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
