import { useState } from "react";
import { Paperclip } from "lucide-react";
import type { FormFieldDef } from "@/types/admin";
import { visibleIds, type Answers } from "@/lib/formLogic";

/** Renders a form for filling. Shared by the student portal and the builder preview. */
export function FormRenderer({ sections, fields, answers, errors, onChange, disabled, onUploadFile }: {
  onUploadFile?: (formFieldId: string, file: File) => Promise<{ id: string; name: string }>;
  sections: { id: string; title: string }[]; fields: FormFieldDef[]; answers: Answers; errors: Record<string, string>; onChange: (id: string, v: unknown) => void; disabled?: boolean;
}) {
  const visible = visibleIds(fields, answers);
  let lastSection: string | null | undefined;
  return (
    <div className="space-y-5">
      {fields.filter((f) => visible.has(f.id)).map((f) => {
        const heading = f.sectionId !== lastSection && f.sectionId ? sections.find((s) => s.id === f.sectionId)?.title : null;
        lastSection = f.sectionId;
        return (
          <div key={f.id}>
            {heading && <h2 className="mb-3 mt-2 border-b border-slate-200 pb-1 text-base font-semibold">{heading}</h2>}
            <FieldInput f={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => onChange(f.id, v)} disabled={disabled} onUploadFile={onUploadFile} />
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ f, value, error, onChange, disabled, onUploadFile }: { onUploadFile?: (formFieldId: string, file: File) => Promise<{ id: string; name: string }>; f: FormFieldDef; value: unknown; error?: string; onChange: (v: unknown) => void; disabled?: boolean }) {
  const id = `q-${f.id}`;
  const describedBy = [f.helpText ? `${id}-help` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, disabled, "aria-invalid": !!error || undefined, "aria-describedby": describedBy, "aria-required": f.required || undefined } as const;
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const cfg = f.validationConfig ?? {};
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const grouped = f.type === "RADIO" || f.type === "CHECKBOXES" || f.type === "YES_NO" || f.type === "RATING";

  const control = (() => {
    switch (f.type) {
      case "LONG_TEXT": return <textarea {...common} rows={4} className="input" placeholder={f.placeholder ?? undefined} maxLength={cfg.maxLength} value={str} onChange={(e) => onChange(e.target.value)} />;
      case "NUMBER": return <input {...common} inputMode="decimal" className="input" placeholder={f.placeholder ?? undefined} value={str} onChange={(e) => onChange(e.target.value)} />;
      case "EMAIL": return <input {...common} type="email" className="input" placeholder={f.placeholder ?? undefined} value={str} onChange={(e) => onChange(e.target.value)} />;
      case "PHONE": return <input {...common} type="tel" className="input" placeholder={f.placeholder ?? undefined} value={str} onChange={(e) => onChange(e.target.value)} />;
      case "DATE": return <input {...common} type="date" className="input" value={str} onChange={(e) => onChange(e.target.value)} />;
      case "DROPDOWN": return <select {...common} className="input" value={str} onChange={(e) => onChange(e.target.value)}><option value="">Select</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
      case "RADIO":
      case "YES_NO": {
        const opts = f.type === "YES_NO" ? [{ label: "Yes", value: "Yes" }, { label: "No", value: "No" }] : f.options;
        return <div role="radiogroup" aria-labelledby={`${id}-label`} className="space-y-1.5">{opts.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm"><input type="radio" name={id} disabled={disabled} checked={value === o.value} onChange={() => onChange(o.value)} /> {o.label}</label>
        ))}</div>;
      }
      case "CHECKBOXES": {
        const sel = Array.isArray(value) ? (value as string[]) : [];
        return <div role="group" aria-labelledby={`${id}-label`} className="space-y-1.5">{f.options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={sel.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value))} /> {o.label}</label>
        ))}</div>;
      }
      case "RATING": return <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={Number(value) === n} aria-label={`${n} out of 5`} disabled={disabled} onClick={() => onChange(n)} className={`h-10 w-10 rounded-lg border text-sm font-medium ${Number(value) === n ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>{n}</button>
      ))}</div>;
      case "FILE_UPLOAD": return (
        <div>
          <input {...common} type="file" className="input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg" disabled={disabled || fileBusy || !onUploadFile}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !onUploadFile) return;
              setFileBusy(true); setFileErr(null);
              try { const r = await onUploadFile(f.id, file); setFileName(r.name); onChange(r.id); }
              catch (err) { setFileErr(err instanceof Error ? err.message : "Upload failed"); e.target.value = ""; }
              finally { setFileBusy(false); }
            }} />
          <p className="mt-1 text-xs text-slate-500">PDF, Word, PowerPoint, Excel, PNG or JPG, up to 10 MB.{!onUploadFile && " (Preview only: files cannot be uploaded here.)"}</p>
          {fileBusy && <p role="status" className="mt-1 text-xs text-slate-600">Uploading...</p>}
          {typeof value === "string" && value && !fileBusy && <p className="mt-1 flex items-center gap-1 text-xs text-green-700"><Paperclip className="h-3 w-3" aria-hidden />{fileName ?? "File attached"} <button type="button" className="ml-2 text-red-600 hover:underline" disabled={disabled} onClick={() => { onChange(""); setFileName(null); }}>Remove</button></p>}
          {fileErr && <p role="alert" className="mt-1 text-xs text-red-600">{fileErr}</p>}
        </div>
      );
      default: return <input {...common} className="input" placeholder={f.placeholder ?? undefined} maxLength={cfg.maxLength} value={str} onChange={(e) => onChange(e.target.value)} />;
    }
  })();

  return (
    <div>
      {grouped ? <p id={`${id}-label`} className="label">{f.label}{f.required && <span className="text-red-600" aria-hidden> *</span>}</p>
        : <label id={`${id}-label`} htmlFor={id} className="label">{f.label}{f.required && <span className="text-red-600" aria-hidden> *</span>}</label>}
      {f.description && <p className="mb-1 text-xs text-slate-500">{f.description}</p>}
      {control}
      {f.helpText && <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{f.helpText}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
