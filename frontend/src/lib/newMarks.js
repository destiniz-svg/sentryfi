import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

/**
 * A small mark beside a place in the menu that changed in a recent release
 * and has not been opened on this device since. Opening the place clears it.
 * Only the last three weeks count: older news is on What's new, not the menu.
 * A device that has never looked starts from the release before the latest,
 * so it is shown what the latest release touched, not everything at once.
 */
const KEY = "sentryfi.opened";
const RECENT_DAYS = 21;
const path = (to) => String(to).split("#")[0];
const bare = (to) => path(to).split("?")[0];
const parts = (v) => String(v || "0").split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
function opened(releases) {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept) return JSON.parse(kept);
    if (!releases?.length) return {};
    const start = { __from: releases[1]?.version || releases[0].version };
    localStorage.setItem(KEY, JSON.stringify(start));
    return start;
  } catch {
    return { __from: releases?.[0]?.version };
  }
}
const isNewer = (v, seen, from) => newer(v, seen || "0") && (!from || newer(v, from));

/** Every recently changed place, with the newest version that changed it. */
function changedPlaces(releases) {
  const since = Date.now() - RECENT_DAYS * 86400000;
  const out = new Map();
  for (const r of releases || []) {
    if (new Date(r.date).getTime() < since) continue;
    for (const it of r.items) {
      if (it.area === "Website") continue;
      const p = path(it.href);
      if (!out.has(p) || newer(r.version, out.get(p))) out.set(p, r.version);
    }
  }
  return out;
}

export function useNewMarks() {
  const { data } = useQuery({ queryKey: ["releases"], queryFn: () => apiClient.get("/releases").then((r) => r.data), staleTime: 300_000 });
  const [seen, setSeen] = useState(() => opened(data?.releases));
  useEffect(() => {
    if (data) setSeen(opened(data.releases));
  }, [data]);
  useEffect(() => {
    const on = () => setSeen(opened(data?.releases));
    window.addEventListener("sentryfi-opened", on);
    return () => window.removeEventListener("sentryfi-opened", on);
  }, []);
  const changed = changedPlaces(data?.releases);
  return (to) => {
    const want = path(to);
    for (const [p, v] of changed) {
      if (p === want || (bare(p) === bare(want) && !want.includes("?"))) {
        if (isNewer(v, seen[p], seen.__from)) return true;
      }
    }
    return false;
  };
}

/** Called on every page change: the place just opened is no longer new. */
export function markOpened(location, releases) {
  const here = `${location.pathname}${location.search}`;
  const changed = changedPlaces(releases);
  const now = opened(releases);
  let moved = false;
  for (const [p, v] of changed) {
    if (p === here || bare(p) === location.pathname) {
      if (isNewer(v, now[p], now.__from)) {
        now[p] = v;
        moved = true;
      }
    }
  }
  if (!moved) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
  } catch {
    /* nothing kept */
  }
  window.dispatchEvent(new Event("sentryfi-opened"));
}
