import { useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { Spinner } from "@/components/ui";

export function FormField({ label, id, error, children, className = "" }: { label: string; id: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function PhotoField({ value, onChange, noun = "photo" }: { value?: string; onChange: (url: string) => void; noun?: string }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<{ url: string }>("/uploads/image", { form });
      onChange(r.url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Unable to upload the photo");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
        {value ? <img src={value} alt={`${noun} preview`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" aria-hidden />}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => ref.current?.click()}>
        {busy && <Spinner />} {value ? `Change ${noun}` : `Upload ${noun}`}
      </button>
    </div>
  );
}

export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "@7";
}

export const apiMessage = (e: unknown, fallback = "Unable to save changes.") =>
  e instanceof ApiError ? e.details?.map((d) => d.message).join(", ") || e.message : fallback;
