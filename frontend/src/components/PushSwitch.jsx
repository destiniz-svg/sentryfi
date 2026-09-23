import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { pushState, isOn, turnOn, turnOff, test } from "@/lib/push";
import { useToast } from "@/context/UIContext";

/** Notifications on this device: on, off, or how to get them here. */
export function PushSwitch({ compact = false }) {
  const toast = useToast();
  const [state] = useState(pushState);
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    isOn().then(setOn, () => setOn(false));
  }, []);

  const note = "text-[13px] text-[var(--ink-muted)] leading-snug";
  if (state === "unsupported") return compact ? null : <p className={note}>This browser cannot show notifications.</p>;
  if (state === "install")
    return <p className={note}>To get notifications on this iPhone or iPad, add Sentryfi to the Home Screen (Share, then Add to Home Screen) and open it from there.</p>;
  if (state === "denied") return <p className={note}>Notifications are blocked for Sentryfi in this browser. Allow them in the site settings, then come back.</p>;
  if (on === null) return null;

  const flip = async () => {
    setBusy(true);
    try {
      if (on) {
        await turnOff();
        setOn(false);
      } else {
        await turnOn();
        setOn(true);
        const sent = await test();
        toast.success("Notifications are on", sent ? "A test is on its way to this device." : "This device is ready.");
      }
    } catch (err) {
      toast.error("Could not change notifications", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <BellRing size={16} className="shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
      <span className="flex-1 min-w-0 text-[13px] text-[var(--ink)]">{on ? "Notifications are on for this device." : "Get every notification on this device, even with the app closed."}</span>
      <button
        type="button"
        onClick={flip}
        disabled={busy}
        data-testid="push-switch"
        className={on ? "text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]" : "h-9 px-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[13px] font-semibold"}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
