import { useState } from "react";
import { Sun, Moon, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/UIContext";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import { TaxSection } from "@/components/settings/TaxSection";
import { CompaniesSection } from "@/components/settings/CompaniesSection";
import { PeopleSection } from "@/components/settings/PeopleSection";
import { BackupsSection } from "@/components/settings/BackupsSection";
import { TrackingSection } from "@/components/settings/TrackingSection";
import { DevicesSection } from "@/components/settings/DevicesSection";
import { useCompany } from "@/context/CompanyContext";
import { Link } from "react-router-dom";
import { AssistantKeys } from "@/components/settings/AssistantKeys";
import { Webhooks } from "@/components/settings/Webhooks";
import { useT } from "@/lib/i18n";

function FieldLabel({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block"
    >
      {children}
    </label>
  );
}

/** The company's look and details on paper now live in one place, with the paper beside them. */
function CompanySection() {
  return (
    <Card padding="lg" className="max-w-2xl">
      <CardTitle className="text-base">Company profile and branding</CardTitle>
      <CardDescription className="mt-1">
        Your logo, colour, address, stamp, signature and how to pay you are set in Branding and documents, with the invoice drawn beside them as you change them.
      </CardDescription>
      <Link to="/branding" className="inline-flex items-center h-10 px-4 mt-4 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[14px] font-semibold">
        Open Branding and documents
      </Link>
    </Card>
  );
}

function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== (user?.name || "") && name.trim().length > 0;

  async function onSave(e) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Couldn't update profile", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Your account</CardTitle>
          <CardDescription className="mt-1">
            Your name appears on the dashboard greeting.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={onSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-lg ring-2 ring-[var(--surface)] shrink-0">
            {(user?.name?.[0] || "?").toUpperCase()}
          </div>
          <div className="text-xs text-[var(--ink-muted)]">Avatar is generated from your initial.</div>
        </div>

        <div>
          <FieldLabel htmlFor="set-full-name">Full name</FieldLabel>
          <Input id="set-full-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your name" />
        </div>

        <div>
          <FieldLabel htmlFor="set-email">Email</FieldLabel>
          <Input id="set-email" value={user?.email || ""} disabled />
          <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">Email changes aren&apos;t supported yet.</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ThemeOption({ value, label, icon: Icon, current, onSelect }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "relative flex-1 flex flex-col items-start gap-3 p-4 rounded-2xl border text-left transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-xl flex items-center justify-center",
          active ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
        )}
      >
        <Icon size={16} />
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--ink)]">{label}</div>
        <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
          {value === "light" ? "Daylight board, for bright sun" : "Night board, low glare"}
        </div>
      </div>
      {active && (
        <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useT();
  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription className="mt-1">
            Pick a theme. Your choice is remembered on this device.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="flex gap-3">
        <ThemeOption value="light" label="Light" icon={Sun} current={theme} onSelect={setTheme} />
        <ThemeOption value="dark" label="Dark" icon={Moon} current={theme} onSelect={setTheme} />
      </div>

      <div className="mt-6" data-testid="language">
        <p className="text-[14px] font-medium">Language</p>
        <div className="flex gap-2 mt-2" role="group" aria-label="Language">
          {[
            ["en", "English"],
            ["dv", "ދިވެހި"],
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setLang(v)} aria-pressed={lang === v} className={`h-10 px-4 rounded-full text-[14px] font-medium ${lang === v ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">In Dhivehi the app reads right to left and figures stay as they are. The Dhivehi words are a first draft, and screens not yet translated stay in English.</p>
      </div>
    </Card>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const newTooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 8 && confirm === newPassword && !saving;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error("Couldn't change password", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription className="mt-1">
            Use at least 8 characters. Mix letters, numbers, and a symbol for a stronger password.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="set-current-password">Current password</FieldLabel>
          <Input id="set-current-password" type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>

        <div>
          <FieldLabel htmlFor="set-new-password">New password</FieldLabel>
          <Input id="set-new-password" type="password" value={newPassword} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          {newTooShort && <p className="text-[11px] text-[var(--danger)] mt-1.5">Needs to be at least 8 characters.</p>}
        </div>

        <div>
          <FieldLabel htmlFor="set-confirm-new-password">Confirm new password</FieldLabel>
          <Input id="set-confirm-new-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {mismatch && <p className="text-[11px] text-[var(--danger)] mt-1.5">Passwords don&apos;t match.</p>}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Updating..." : "Update password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Settings() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "company");
  const { user } = useAuth();
  const { can } = useCompany();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your company profile, invoicing defaults, and account." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="tax">Tax</TabsTrigger>
          {can("manage_settings") && <TabsTrigger value="tracking">Tracking</TabsTrigger>}
          {user?.platformAdmin && <TabsTrigger value="backups">Backups</TabsTrigger>}
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
          <TabsTrigger value="profile">Account</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="company">
            <CompanySection />
          </TabsContent>
          <TabsContent value="people">
            <PeopleSection />
          </TabsContent>
          <TabsContent value="companies">
            <CompaniesSection />
          </TabsContent>
          <TabsContent value="backups">
            <BackupsSection />
          </TabsContent>
          <TabsContent value="tracking">
            <TrackingSection />
          </TabsContent>
          <TabsContent value="tax">
            <TaxSection />
          </TabsContent>
          <TabsContent value="assistant">
            <div className="space-y-4">
              <AssistantKeys />
              <Webhooks />
            </div>
          </TabsContent>
          <TabsContent value="profile">
            <div className="space-y-4">
              <ProfileSection />
              <DevicesSection />
            </div>
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="password">
            <PasswordSection />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
