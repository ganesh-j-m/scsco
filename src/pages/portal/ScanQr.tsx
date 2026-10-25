import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { Camera, QrCode } from "lucide-react";
import { PageHeader } from "@/components/ui";

// Accepts the full link printed in the QR (https://site/scan/TOKEN) or just the token.
export function tokenFrom(text: string): string | null {
  const m = text.match(/\/scan\/([A-Za-z0-9_-]{16,})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{16,}$/.test(text.trim()) ? text.trim() : null;
}

export default function ScanQr() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const [state, setState] = useState<"idle" | "starting" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const go = useCallback((text: string) => {
    const t = tokenFrom(text);
    if (!t) return false;
    stop();
    navigate(`/scan/${t}`, { replace: true });
    return true;
  }, [navigate, stop]);

  const tick = useCallback(() => {
    const v = video.current, c = canvas.current;
    if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
      const scale = Math.min(1, 640 / v.videoWidth);
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data && go(code.data)) return;
        if (code?.data) setError("This QR code is not an attendance code.");
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, [go]);

  const start = async () => {
    setError(null); setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) { setState("idle"); setError("This browser cannot open the camera. Use your phone's camera app to scan the QR, or paste the code below."); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setState("scanning");
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      setState("idle");
      const name = (e as DOMException).name;
      setError(name === "NotAllowedError" ? "Camera permission was blocked. Allow the camera for this site in your browser settings, then try again." : name === "NotFoundError" ? "No camera was found on this device." : "Unable to start the camera.");
    }
  };

  return (
    <>
      <PageHeader title="Scan attendance QR" subtitle="Point your camera at the QR code shown by your teacher" />
      <div className="mx-auto max-w-md">
        <div className="card overflow-hidden">
          <div className="relative aspect-square w-full bg-slate-900">
            <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
            {state === "scanning" && <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" aria-hidden />}
            {state !== "scanning" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <QrCode className="h-12 w-12 opacity-80" aria-hidden />
                <button className="btn-primary" onClick={start} disabled={state === "starting"}><Camera className="h-4 w-4" /> {state === "starting" ? "Starting camera..." : "Open camera"}</button>
              </div>
            )}
          </div>
          <canvas ref={canvas} className="hidden" />
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (!go(manual)) setError("Paste the full link or code from the QR."); }}>
          <label htmlFor="manual" className="label">Camera not working? Paste the link or code</label>
          <div className="flex gap-2"><input id="manual" className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://.../scan/..." /><button className="btn-secondary" disabled={!manual.trim()}>Go</button></div>
        </form>
        <p className="mt-4 text-center text-sm"><Link to="/portal/attendance" className="text-brand-600 hover:underline">View my attendance</Link></p>
      </div>
    </>
  );
}
