import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Database, EyeOff, Fingerprint, KeyRound, LifeBuoy, Lock, MapPin, ShieldCheck, Undo2, Users } from "lucide-react";
import { apiClient } from "@/api/client";
import AILogo from "@/components/layout/AILogo";

/**
 * Being trusted: a cautious buyer's questions, answered on a page rather than
 * in a conversation. Every sentence here is true of the running product and
 * is kept true: change what it describes, change this page.
 */
const SECTIONS = [
  {
    icon: MapPin,
    title: "Where your books are kept",
    body: [
      "In a PostgreSQL database run by Railway, in its Singapore region. The app and the database sit in the same place; nothing about your books is kept on anyone's phone for longer than it takes to send it.",
      "If your business needs its books kept in another region, write to us: that is answered per company, not assumed.",
    ],
  },
  {
    icon: Users,
    title: "One company never sees another",
    body: [
      "Every table holding a company's books is walled off by the database itself (row-level security, switched on and forced), not by the app remembering to filter. A request says which company it acts for, and the database refuses anything outside it.",
      "Every release runs a suite that signs in as two companies and tries to reach one from the other, in every place books can be read or changed. It must pass before anything ships.",
    ],
  },
  {
    icon: Fingerprint,
    title: "What is written cannot be quietly changed",
    body: [
      "Each entry is sealed to the one before it, so an altered record shows. Nothing is deleted: a correction is a reversing entry that carries a reason, a person and a time.",
      "An issued invoice or credit note is kept exactly as it was sent, with a fingerprint. The QR code on it opens a page where anyone holding the paper can check it is genuine.",
    ],
  },
  {
    icon: Database,
    title: "Backups, proven every night",
    body: [
      "Every night the whole database is copied, encrypted (AES-256-GCM) and stored apart from the database. Then that same copy is fetched back, restored into an empty database and checked: every company's seal verifies from the first entry to the last. A backup nobody has restored is a hope; this restores every one.",
    ],
    status: true,
  },
  {
    icon: KeyRound,
    title: "Signing in",
    body: [
      "Passwords are stored only as bcrypt hashes. Passkeys (a fingerprint or face on your device) work instead of a password. An email address is confirmed before the books open, and \"sign out everywhere\" ends every session at once.",
      "Each person has a role in each company, and what a role may do is enforced on the server. People on site photograph bills and run their cash tin without ever seeing the books.",
    ],
  },
  {
    icon: EyeOff,
    title: "Who else touches your data",
    body: [
      "Railway hosts the app and the database. Google's Gemini reads the photographs of bills you send, and writes the CFO's summary and answers from your figures, only when you use them. Resend sends the emails. Your phone's own push service carries notifications you turned on.",
      "Nothing is sold, and nothing is used for advertising.",
    ],
  },
  {
    icon: Undo2,
    title: "Your books are yours",
    body: [
      "The whole journal downloads as a spreadsheet file (Statements, The whole journal), and the tax statements download in the authority's own layout. An accountant or another product can take them in; nobody is held by their own records.",
      "Your own assistant can read your books through a documented interface, with a key you can turn off at any time. It can never put anything in the books.",
    ],
  },
];

export default function Trust() {
  const { data: status, isError } = useQuery({ queryKey: ["status"], queryFn: () => apiClient.get("/health/status").then((r) => r.data), retry: false });
  const up = status?.app === "up" && status?.database === "connected";

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-10 sm:py-14">
      <div className="max-w-[760px] mx-auto">
        <Link to="/" className="inline-flex items-center gap-2">
          <AILogo size={32} />
          <span className="font-display text-[20px] font-semibold tracking-tight">Sentryfi</span>
        </Link>
        <h1 className="mt-8 text-[34px] leading-[1.1] font-semibold tracking-[-0.02em]">What happens to your books</h1>
        <p className="mt-3 text-[16px] text-[var(--ink-muted)] leading-relaxed max-w-[62ch]">
          Where they are kept, who can see them, how they are protected and what happens if something goes wrong. Plainly, so you can decide before you trust us with them.
        </p>

        <section className="mt-8 rounded-[20px] bg-[var(--surface)] lift p-5 flex items-center gap-4" aria-live="polite" data-testid="status">
          <span className={`h-3 w-3 shrink-0 rounded-full ${isError ? "bg-[var(--danger)]" : up ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{isError ? "The status check is not answering" : !status ? "Checking…" : up ? "Everything is working" : "Something is not right"}</p>
            <p className="text-[13px] text-[var(--ink-muted)]">
              {status?.lastProvenBackup ? `Last backup restored and proven: ${new Date(status.lastProvenBackup).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : status ? "No proven backup recorded yet." : ""}
            </p>
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-[20px] bg-[var(--surface)] lift p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-2)] inline-flex items-center justify-center" aria-hidden="true">
                  <s.icon size={17} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] pt-1.5">{s.title}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-2 text-[15px] leading-relaxed text-[var(--ink-muted)]">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          ))}

          <section className="rounded-[20px] bg-[var(--ink-panel)] text-[var(--on-ink-panel)] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <LifeBuoy size={20} className="shrink-0 mt-1" aria-hidden="true" />
              <div>
                <h2 className="text-[17px] font-semibold">A person, when you need one</h2>
                <p className="mt-2 text-[15px] leading-relaxed opacity-80">
                  Write to <a href="mailto:support@sentryfi.app" className="font-semibold text-[#F2C300] underline underline-offset-4 decoration-[#F2C300]/60 hover:decoration-[#F2C300]">support@sentryfi.app</a>. A person reads every message and answers it; so does a security question, which goes to the front of the queue.
                </p>
              </div>
            </div>
          </section>
        </div>

        <p className="mt-8 text-[13px] text-[var(--ink-muted)] flex items-center gap-2">
          <ShieldCheck size={14} aria-hidden="true" /> <Lock size={14} aria-hidden="true" /> Kept true: when what it describes changes, this page changes with it.
        </p>
      </div>
    </main>
  );
}
