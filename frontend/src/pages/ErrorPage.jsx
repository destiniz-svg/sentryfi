import { Link, useRouteError, isRouteErrorResponse } from "react-router-dom";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import AILogo from "@/components/layout/AILogo";

/**
 * What a person sees when something breaks. The app shipped with no error
 * boundary at all, so a crash put a minified React stack trace on screen — on
 * a product that will hold someone's books, in front of someone who cannot act
 * on it.
 *
 * This says what happened in plain words, offers the two things that actually
 * help, and reassures on the one question that matters: nothing was lost,
 * because nothing posts to the ledger from a screen that failed to draw.
 * The technical detail is still here, folded away, for whoever fixes it.
 */
export default function ErrorPage() {
  const error = useRouteError();

  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error?.message || String(error || "Unknown error");
  const stack = error?.stack || "";

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-16 bg-[var(--bg)]">
      <div className="w-full max-w-[560px]">
        <div className="flex items-center gap-2.5 mb-8">
          <AILogo size={30} />
          <span className="text-[19px] font-semibold tracking-[-.02em]">Sentryfi</span>
        </div>

        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <AlertTriangle size={22} strokeWidth={2} />
        </span>

        <h1 className="mt-5 text-[clamp(28px,4vw,38px)] leading-[1.1] font-semibold tracking-[-.025em]">
          {notFound ? "That page is not here" : "This screen did not load"}
        </h1>

        <p className="mt-4 text-[16.5px] leading-[1.55] text-[var(--ink-muted)]">
          {notFound
            ? "The link may be old, or the record may have been reversed. Nothing is wrong with your books."
            : "Something in the app failed while drawing this page. Your data is untouched: nothing is recorded from a screen that did not finish loading."}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!notFound && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-12 px-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-[var(--ink)] text-[15px] font-semibold"
            >
              <RotateCcw size={16} />
              Try again
            </button>
          )}
          <Link
            to="/dashboard"
            className="h-12 px-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] text-[15px] font-semibold text-[var(--ink)]"
          >
            <Home size={16} />
            Back to the dashboard
          </Link>
        </div>

        <details className="mt-10 group">
          <summary className="cursor-pointer text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] list-none">
            Technical detail, for whoever fixes it
          </summary>
          <pre className="mt-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[12px] leading-relaxed text-[var(--ink-muted)] overflow-x-auto whitespace-pre-wrap break-words">
            {detail}
            {stack ? "\n\n" + stack : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}
