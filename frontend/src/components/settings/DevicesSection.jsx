import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2, X } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";
import { formatDate } from "@/lib/utils";

/**
 * Signing in with Face ID or a fingerprint on this phone or computer, the
 * devices that can, and signing out everywhere at once.
 */

export const passkeysWork = () => typeof window !== "undefined" && Boolean(window.PublicKeyCredential);

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "This device";
}

export function DevicesSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data } = useQuery({ queryKey: ["passkeys"], queryFn: () => apiClient.get("/passkeys").then((r) => r.data.passkeys) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["passkeys"] });

  const add = useMutation({
    mutationFn: async () => {
      const optionsJSON = (await apiClient.post("/passkeys/register/options")).data;
      const response = await startRegistration({ optionsJSON });
      return (await apiClient.post("/passkeys/register", { response, name: deviceName() })).data;
    },
  });
  const remove = useMutation({ mutationFn: (id) => apiClient.delete(`/passkeys/${id}`) });
  const everywhere = useMutation({ mutationFn: () => apiClient.post("/auth/logout-everywhere") });

  return (
    <Card padding="lg">
      <CardHeader>
        <div>
          <CardTitle>Face ID and fingerprint</CardTitle>
          <CardDescription className="mt-1">
            Sign in by looking at your phone or touching the sensor instead of typing a password. The key stays on the device;
            Sentryfi keeps only what can check it.
          </CardDescription>
        </div>
      </CardHeader>
      <ul className="divide-y divide-[var(--border)] mt-2">
        {(data || []).map((p) => (
          <li key={p.id} className="py-2.5 flex items-center gap-3">
            <Fingerprint size={18} className="text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px]">{p.name}</div>
              <div className="text-[13px] text-[var(--ink-muted)]">
                Added {formatDate(p.created_at)}
                {p.last_used_at ? ` · last used ${formatDate(p.last_used_at)}` : ""}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Stop ${p.name} signing in`}
              onClick={async () => {
                await remove.mutateAsync(p.id);
                refresh();
              }}
              className="h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-2)]"
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 mt-3">
        {passkeysWork() && (
          <Button
            variant="outline"
            disabled={add.isPending}
            onClick={async () => {
              try {
                const r = await add.mutateAsync();
                refresh();
                toast.success(`${r.name} is added`, "Next time, sign in with your face or finger.");
              } catch (ex) {
                if (ex?.name === "NotAllowedError") return; // they cancelled
                toast.error("Not added", ex.message);
              }
            }}
          >
            {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={15} />}
            Use Face ID or fingerprint here
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={everywhere.isPending}
          onClick={async () => {
            await everywhere.mutateAsync();
            await logout();
          }}
        >
          Sign out on every device
        </Button>
      </div>
    </Card>
  );
}
