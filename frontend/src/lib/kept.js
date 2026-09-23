/**
 * The last answer, kept for when there is no signal.
 *
 * A supervisor opens the app on a site with no signal: without this they get
 * the sign-in screen, because the app cannot ask who they are. So the reads a
 * field worker needs (who they are, their companies and role, their cash tin)
 * keep their last answer on the phone and give it back when the network does
 * not answer. A real refusal (signed out, not allowed) is never covered up:
 * only "no answer at all" falls back. Signing out forgets everything kept.
 */

const PREFIX = "sentryfi.kept:";

/** Wraps a read: remembers what came back; with no signal, gives the last one. */
export function remembered(name, fn) {
  return async (...args) => {
    try {
      const value = await fn(...args);
      try {
        localStorage.setItem(PREFIX + name, JSON.stringify(value));
      } catch {
        /* storage full or blocked: it still works while there is signal */
      }
      return value;
    } catch (err) {
      if (!err?.status) {
        try {
          const saved = localStorage.getItem(PREFIX + name);
          if (saved !== null) return JSON.parse(saved);
        } catch {
          /* nothing kept */
        }
      }
      throw err;
    }
  };
}

/** Everything kept, gone: on signing out, so the next person on a shared phone sees none of it. */
export function forgetKept() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* nothing to forget */
  }
}
