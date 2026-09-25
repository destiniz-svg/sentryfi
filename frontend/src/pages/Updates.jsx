import { Link } from "react-router-dom";
import AILogo from "@/components/layout/AILogo";
import WhatsNew from "./WhatsNew";

/** What's new, public: the same releases, for anyone deciding whether to use Sentryfi. */
export default function Updates() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <AILogo size={26} />
            <span className="text-[17px] font-semibold tracking-[-.02em]">Sentryfi</span>
          </Link>
          <Link to="/login" className="ml-auto h-10 px-4 rounded-full border border-[var(--border)] text-[14px] font-medium inline-flex items-center hover:bg-[var(--surface-2)]">
            Log in
          </Link>
        </div>
      </header>
      <WhatsNew outside />
    </div>
  );
}
