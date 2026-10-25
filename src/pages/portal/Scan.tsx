import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, QrCode, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface Preview {
  subject: { name: string; code: string };
  course: string; year: number; division: string; teacher: string;
  state: "OPEN" | "EXPIRED" | "CLOSED"; mismatch: string | null; alreadyMarked: boolean;
}

type Result = { ok: true } | { ok: false; message: string; already?: boolean };

export default function Scan() {
  const { token = "" } = useParams();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let live = true;
    api<Preview>(`/qr-attendance/preview/${encodeURIComponent(token)}`)
      .then((p) => live && setPreview(p))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Unable to read this QR code. Please try again."));
    return () => { live = false; };
  }, [token]);

  const mark = async () => {
    setBusy(true);
    try {
      await api("/qr-attendance/scan", { body: { token } });
      setResult({ ok: true });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setResult({ ok: false, already: status === 409, message: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally { setBusy(false); }
  };

  const blocked = preview && (preview.state !== "OPEN" ? "This QR code has expired. Ask your teacher to generate a new one." : preview.mismatch);
  const done = result?.ok || preview?.alreadyMarked || (result && !result.ok && result.already);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        {error ? (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Cannot use this QR code</h1>
            <p role="alert" className="mt-1 text-sm text-slate-600">{error}</p>
          </>
        ) : !preview ? (
          <div className="py-8"><Spinner /><p className="mt-2 text-sm text-slate-500">Reading QR code...</p></div>
        ) : done ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">{result?.ok ? "Attendance marked" : "Already marked"}</h1>
            <p className="mt-1 text-sm text-slate-600">{preview.subject.name} · {preview.course}, Year {preview.year} · Div {preview.division}</p>
          </>
        ) : (
          <>
            <QrCode className="mx-auto h-10 w-10 text-brand-600" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">{preview.subject.name}</h1>
            <p className="text-sm text-slate-600">{preview.course} · Year {preview.year} · Div {preview.division}</p>
            <p className="text-sm text-slate-500">Teacher: {preview.teacher}</p>
            {(blocked || (result && !result.ok)) && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{blocked || (result && !result.ok ? result.message : "")}</p>}
            {!blocked && <button className="btn-primary mt-5 w-full" onClick={mark} disabled={busy}>{busy && <Spinner />} Mark my attendance</button>}
          </>
        )}
        <Link to="/portal/attendance" className="mt-5 inline-block text-sm text-brand-600 hover:underline">View my attendance</Link>
      </div>
    </main>
  );
}
