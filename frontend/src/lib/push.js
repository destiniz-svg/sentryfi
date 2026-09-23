import { apiClient } from "@/api/client";

/**
 * Push on this device: whether it can, whether it is on, and turning it on
 * and off. Every notification in the app is pushed to every device a person
 * turns it on for.
 *
 * iPhone and iPad take push only from the app added to the Home Screen
 * (iOS 16.4 and later), so there "not possible here" says how to get it.
 */

const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const apple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function pushState() {
  if (apple() && !standalone()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

async function current() {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

export async function isOn() {
  if (pushState() !== "ready" || Notification.permission !== "granted") return false;
  return Boolean((await current()).sub);
}

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "This device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os}, ${browser}` : os;
}

export async function turnOn() {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications were not allowed. They can be allowed in the browser's site settings.");
  const { publicKey } = (await apiClient.get("/push")).data;
  const { reg, sub: had } = await current();
  const sub = had || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await apiClient.post("/push/subscribe", { subscription: sub.toJSON(), device: deviceName() });
  return true;
}

export async function turnOff() {
  const { sub } = await current();
  if (!sub) return;
  await apiClient.post("/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export const test = () => apiClient.post("/push/test").then((r) => r.data.sent);
