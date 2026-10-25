import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Badge, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField } from "@/components/forms";
import { pretty } from "@/components/portal";

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = again.length > 0 && next !== again;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== again) { setError("The new passwords do not match."); return; }
    setBusy(true);
    try {
      await api("/auth/change-password", { body: { currentPassword: cur, newPassword: next } });
      toast.success("Password changed successfully.");
      setCur(""); setNext(""); setAgain("");
    } catch (err) { setError(apiMessage(err, "Unable to change the password")); }
    finally { setBusy(false); }
  };

  if (!user) return null;
  const rows: [string, string][] = [["Name", user.name], ["Login ID", user.loginId], ["Email", user.email], ["Phone", user.phone ?? "—"]];
  return (
    <>
      <PageHeader title="My profile" subtitle="Your account details. Contact the college office to correct them." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2"><h2 className="font-medium">Account</h2><Badge tone="slate">{pretty(user.role)}</Badge></div>
          <dl className="divide-y divide-slate-100 text-sm">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right">{v}</dd></div>)}
          </dl>
        </div>
        <form className="card space-y-3 p-4" onSubmit={save}>
          <h2 className="font-medium">Change password</h2>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <FormField label="Current password" id="pw-cur"><input id="pw-cur" type="password" autoComplete="current-password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} required /></FormField>
          <FormField label="New password" id="pw-new"><input id="pw-new" type="password" autoComplete="new-password" minLength={8} className="input" value={next} onChange={(e) => setNext(e.target.value)} required /></FormField>
          <FormField label="Repeat new password" id="pw-again" error={mismatch ? "Passwords do not match" : undefined}><input id="pw-again" type="password" autoComplete="new-password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} required /></FormField>
          <button className="btn-primary" disabled={busy || !cur || next.length < 8 || next !== again}>{busy && <Spinner />} Update password</button>
        </form>
      </div>
    </>
  );
}
