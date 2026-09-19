/**
 * Shown while a screen is being fetched.
 *
 * Announced, because on a slow connection this is the only thing happening and
 * a screen reader would otherwise report nothing at all between the tap and
 * the page arriving.
 */
export function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[50vh] flex items-center justify-center text-sm text-[var(--ink-muted)]"
    >
      Loading…
    </div>
  );
}
