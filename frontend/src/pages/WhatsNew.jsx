import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, X } from "lucide-react";
import { apiClient } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";

/**
 * What's new: every release, newest first, the way the big accounting apps
 * keep their product updates, but readable on a phone. Search it, narrow it to
 * an area or to new things, improvements or fixes, and jump between versions
 * on the rule down the side. What arrived since this device last looked is
 * marked, and each item opens where it lives in the app.
 *
 * The same page is public at /updates, for anyone deciding whether to use it.
 */
const SEEN = "sentryfi.seen-version";
const KIND = {
  new: { label: "New", tone: "bg-[var(--ink)] text-[var(--bg)]" },
  improved: { label: "Improved", tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  fixed: { label: "Fixed", tone: "bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)]" },
};
const parts = (v) => String(v || "0").split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
const read = () => {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    return null;
  }
};

export default function WhatsNew({ outside = false }) {
  const { hash } = useLocation();
  const { data } = useQuery({ queryKey: ["releases"], queryFn: () => apiClient.get("/releases").then((r) => r.data), staleTime: 300_000 });
  const [q, setQ] = useState("");
  const [area, setArea] = useState("All");
  const [kind, setKind] = useState("all");
  // What this device had seen before this visit; kept for the visit, then moved on.
  const [seenBefore] = useState(read);
  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(SEEN, data.current.version);
    } catch {
      /* private window: nothing kept */
    }
  }, [data]);
  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [data, hash]);

  const releases = data?.releases || [];
  const isNewToYou = (v) => (seenBefore ? newer(v, seenBefore) : false);
  const unseen = releases.filter((r) => isNewToYou(r.version)).reduce((a, r) => a + r.items.length, 0);
  const areas = useMemo(() => {
    const count = new Map();
    for (const r of releases) for (const it of r.items) count.set(it.area, (count.get(it.area) || 0) + 1);
    return [["All", releases.reduce((a, r) => a + r.items.length, 0)], ...[...count.entries()].sort((a, b) => b[1] - a[1])];
  }, [releases]);
  const words = q.trim().toLowerCase();
  const shown = releases
    .map((r) => ({
      ...r,
      items: r.items.filter(
        (it) => (area === "All" || it.area === area) && (kind === "all" || it.kind === kind) && (!words || `${it.title} ${it.body} ${it.area} ${r.title}`.toLowerCase().includes(words))
      ),
    }))
    .filter((r) => r.items.length);
  const found = shown.reduce((a, r) => a + r.items.length, 0);

  return (
    <div className={cn("mx-auto w-full", outside ? "max-w-[1120px] px-4 sm:px-6 py-8" : "max-w-[1120px]")}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[32px] sm:text-[40px] font-bold tracking-tight leading-none">What&apos;s new</h1>
          <p className="text-[15px] text-[var(--ink-muted)] mt-2 max-w-[60ch]">Every change to Sentryfi, newest first. {outside ? "Everything here is live for every company." : "Each one opens where it lives."}</p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            {unseen > 0 && !outside && (
              <span className="h-8 px-3 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[13px] font-semibold inline-flex items-center" data-testid="unseen">
                {unseen} new since you last looked
              </span>
            )}
            <span className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[13px] inline-flex items-center gap-1.5 tabular" title="The version, and the exact build this server runs">
              Sentryfi <b className="font-semibold">{data.current.version}</b>
              <span className="text-[var(--ink-muted)]">· build {data.current.build}</span>
            </span>
          </div>
        )}
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <label className="relative max-w-[520px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what changed: payroll, GST, WhatsApp…" aria-label="Search what changed" className="w-full h-11 pl-11 pr-4 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[15px] outline-none focus:border-[var(--ink)] placeholder:text-[var(--ink-muted)]" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Area" className="flex flex-wrap gap-2">
            {areas.map(([a, n]) => (
              <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={cn("h-9 px-3.5 rounded-full border text-[14px] whitespace-nowrap inline-flex items-center gap-1.5", area === a ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-semibold" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                {a} <span className="tabular text-[12px] opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Kind of change" className="flex gap-1 p-1 rounded-full bg-[var(--surface-2)] sm:ml-auto">
            {[["all", "All"], ["new", "New"], ["improved", "Improved"], ["fixed", "Fixed"]].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("h-8 px-3 rounded-full text-[13px] font-medium", kind === k ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {(words || area !== "All" || kind !== "all") && (
          <p className="text-[13px] text-[var(--ink-muted)]" aria-live="polite" data-testid="filter-count">
            {found} {found === 1 ? "change" : "changes"} in {shown.length} {shown.length === 1 ? "release" : "releases"}.{" "}
            <button type="button" onClick={() => (setQ(""), setArea("All"), setKind("all"))} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--ink)]">
              <X size={12} /> Show everything
            </button>
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* The rule down the side: every version, a tick each, jump to it. */}
        <nav aria-label="Versions" className="hidden lg:block">
          <ol className="sticky top-24 border-l-2 border-[var(--ink)] pl-0">
            {releases.map((r) => {
              const here = shown.some((s) => s.version === r.version);
              return (
                <li key={r.version} className="relative">
                  <span className="absolute left-0 top-1/2 h-[2px] w-3 bg-[var(--ink)]" aria-hidden="true" />
                  <a href={`#v${r.version}`} className={cn("block pl-5 py-1.5 rounded-r-lg hover:bg-[var(--surface-2)]", !here && "opacity-40")}>
                    <span className="font-display text-[20px] font-bold leading-none tabular">{r.version}</span>
                    {isNewToYou(r.version) && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)] align-middle" aria-label="new to you" />}
                    <span className="block text-[12px] text-[var(--ink-muted)]">{formatDate(r.date, { day: "numeric", month: "short" })}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="grid gap-6 min-w-0" data-testid="releases">
          {!data ? (
            <div className="h-64 rounded-[20px] bg-[var(--surface)] animate-pulse" />
          ) : !shown.length ? (
            <p className="rounded-[20px] bg-[var(--surface)] lift px-5 py-10 text-center text-[15px] text-[var(--ink-muted)]">Nothing matches that. Try another word, or show everything.</p>
          ) : (
            shown.map((r) => (
              <section key={r.version} id={`v${r.version}`} aria-labelledby={`h-${r.version}`} className="scroll-mt-24 rounded-[20px] bg-[var(--surface)] lift overflow-hidden">
                <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[var(--border)] grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 items-baseline">
                  <span className="font-display text-[34px] sm:text-[40px] font-bold leading-none tabular">{r.version}</span>
                  <div className="min-w-0">
                    <h2 id={`h-${r.version}`} className="text-[18px] font-semibold leading-snug">
                      {r.title}
                      {isNewToYou(r.version) && <span className="ml-2 align-middle h-6 px-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[12px] font-semibold inline-flex items-center">New to you</span>}
                    </h2>
                    <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
                      {formatDate(r.date)} · {r.summary}
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-[var(--border)]">
                  {r.items.map((it) => (
                    <li key={it.title} className="px-5 sm:px-6 py-4 grid gap-x-4 gap-y-1.5 sm:grid-cols-[92px_minmax(0,1fr)_auto] items-start">
                      <span className="flex sm:flex-col gap-2 sm:gap-1 items-center sm:items-start">
                        <span className={cn("h-6 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center", KIND[it.kind].tone)}>{KIND[it.kind].label}</span>
                        <span className="text-[12px] text-[var(--ink-muted)]">{it.area}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold">{it.title}</span>
                        <span className="block text-[14px] text-[var(--ink-muted)] leading-relaxed mt-0.5 max-w-[68ch]">{it.body}</span>
                      </span>
                      {!outside && it.area !== "Website" && (
                        <Link to={it.href} className="justify-self-start sm:justify-self-end inline-flex items-center gap-1 h-9 px-3 rounded-full text-[13px] font-medium text-[var(--deep)] hover:bg-[var(--surface-2)] whitespace-nowrap">
                          Open it <ArrowRight size={14} />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
