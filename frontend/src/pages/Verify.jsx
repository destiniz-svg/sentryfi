import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

/** The link in the confirm-your-address email. */
export default function Verify() {
  const { token } = useParams();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    apiClient
      .post("/auth/verify", { token })
      .then(async () => {
        await refresh();
        if (live) nav("/dashboard", { replace: true });
      })
      .catch((ex) => live && setErr(ex.message));
    return () => {
      live = false;
    };
  }, [token, refresh, nav]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-[30px] font-bold tracking-tight">Confirming your email</h1>
        {err ? (
          <>
            <p className="mt-3 text-[15px]" role="alert">
              {err}
            </p>
            <p className="mt-6 text-[14px]">
              <Link to="/login" className="text-[var(--accent-strong)] font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-3 text-[var(--ink-muted)] inline-flex items-center gap-2" role="status">
            <Loader2 size={15} className="animate-spin" /> One moment…
          </p>
        )}
      </div>
    </main>
  );
}
