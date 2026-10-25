import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, GripVertical, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLookup } from "@/hooks/useLookup";
import { usePaged } from "@/hooks/usePaged";
import { useToast } from "@/context/ToastContext";
import { useApi } from "@/hooks/useApi";
import { Badge, ConfirmDialog, ErrorState, LoadingState, Modal, PageHeader, Spinner } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { apiMessage, FormField } from "@/components/forms";
import { FormRenderer } from "@/components/FormRenderer";
import { fmtDate, pretty } from "@/components/portal";
import { FIELD_LABELS } from "@/lib/formLogic";
import { formTone } from "./Forms";
import type { FormDetail, FormFieldDef, FormFieldType, FormStatus, FormSubmissionRow } from "@/types/admin";

// ───────── Local editing model ─────────
interface LField {
  key: string; sectionKey: string; type: FormFieldType; label: string; description: string; placeholder: string; helpText: string; defaultValue: string;
  required: boolean; min: string; max: string; minLength: string; maxLength: string;
  logicField: string; logicOp: "equals" | "notEquals"; logicValue: string; options: string[];
}
interface LSection { key: string; title: string }

const CHOICE: FormFieldType[] = ["DROPDOWN", "RADIO", "CHECKBOXES"];
const TEXTY: FormFieldType[] = ["SHORT_TEXT", "LONG_TEXT", "EMAIL", "PHONE"];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);

const toLocal = (f: FormFieldDef): LField => ({
  key: f.id, sectionKey: f.sectionId ?? "", type: f.type, label: f.label, description: f.description ?? "", placeholder: f.placeholder ?? "", helpText: f.helpText ?? "", defaultValue: f.defaultValue ?? "",
  required: f.required, min: f.validationConfig?.min?.toString() ?? "", max: f.validationConfig?.max?.toString() ?? "", minLength: f.validationConfig?.minLength?.toString() ?? "", maxLength: f.validationConfig?.maxLength?.toString() ?? "",
  logicField: f.conditionalLogic?.fieldId ?? "", logicOp: f.conditionalLogic?.operator ?? "equals", logicValue: f.conditionalLogic?.value ?? "", options: f.options.map((o) => o.label),
});
const blankField = (type: FormFieldType): LField => ({
  key: uid(), sectionKey: "", type, label: "", description: "", placeholder: "", helpText: "", defaultValue: "", required: false, min: "", max: "", minLength: "", maxLength: "",
  logicField: "", logicOp: "equals", logicValue: "", options: CHOICE.includes(type) ? ["Option 1", "Option 2"] : [],
});
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const toDef = (f: LField): FormFieldDef => ({
  id: f.key, sectionId: f.sectionKey || null, type: f.type, label: f.label || "Untitled question", description: f.description || null, placeholder: f.placeholder || null, helpText: f.helpText || null, defaultValue: f.defaultValue || null,
  required: f.required, validationConfig: { min: num(f.min), max: num(f.max), minLength: num(f.minLength), maxLength: num(f.maxLength) },
  conditionalLogic: f.logicField ? { fieldId: f.logicField, operator: f.logicOp, value: f.logicValue } : null,
  options: f.options.filter(Boolean).map((o) => ({ label: o, value: o })),
});

export default function FormBuilder() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "questions") as "questions" | "settings" | "audience" | "responses" | "preview";
  const toast = useToast();
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<LSection[]>([]);
  const [fields, setFields] = useState<LField[]>([]);
  const [dirty, setDirty] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirm, setConfirm] = useState<FormStatus | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<FormDetail>(`/forms/${id}`);
      setDetail(r);
      setSections(r.sections.map((s) => ({ key: s.id, title: s.title })));
      setFields(r.fields.map(toLocal));
      setDirty(false);
    } catch (e) { setError(apiMessage(e, "Unable to load the form")); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (status: FormStatus) => {
    setStatusBusy(true);
    try {
      const r = await api<{ notified?: number }>(`/forms/${id}/status`, { body: { status } });
      toast.success(status === "PUBLISHED" ? `Form published${r.notified ? ` and sent to ${r.notified} users` : ""}.` : `Form ${status.toLowerCase()}.`);
      setConfirm(null);
      const d = await api<FormDetail>(`/forms/${id}`);
      setDetail((cur) => (cur ? { ...cur, form: d.form } : d));
    } catch (e) { toast.error(apiMessage(e, "Unable to change the status")); setConfirm(null); }
    finally { setStatusBusy(false); }
  };

  if (error) return <><PageHeader title="Form" /><ErrorState message={error} onRetry={load} /></>;
  if (!detail) return <LoadingState rows={6} />;
  const { form } = detail;
  const tabs: [string, string][] = [["questions", "Questions"], ["settings", "Settings"], ["audience", "Audience"], ["responses", `Responses (${form.submissions})`], ["preview", "Preview"]];

  return (
    <>
      <Link to="/admin/forms" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> All forms</Link>
      <PageHeader
        title={form.title}
        subtitle={`By ${form.createdBy}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={formTone(form.status)}>{pretty(form.status)}</Badge>
            {form.status === "DRAFT" && <button className="btn-primary" disabled={statusBusy || dirty} title={dirty ? "Save your questions first" : undefined} onClick={() => setConfirm("PUBLISHED")}>Publish</button>}
            {form.status === "PUBLISHED" && <button className="btn-secondary" disabled={statusBusy} onClick={() => setConfirm("CLOSED")}>Close form</button>}
            {form.status === "CLOSED" && <button className="btn-primary" disabled={statusBusy} onClick={() => setStatus("PUBLISHED")}>Reopen</button>}
            {form.status === "ARCHIVED" && <button className="btn-secondary" disabled={statusBusy} onClick={() => setStatus("CLOSED")}>Restore</button>}
            {(form.status === "PUBLISHED" || form.status === "CLOSED") && <button className="btn-secondary" disabled={statusBusy} onClick={() => setConfirm("ARCHIVED")}>Archive</button>}
          </div>
        }
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>
      {dirty && tab !== "questions" && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">You have unsaved changes to the questions. Go to the Questions tab and save them.</p>}

      {tab === "questions" && <Questions detail={detail} sections={sections} fields={fields} setSections={(s) => { setSections(s); setDirty(true); }} setFields={(f) => { setFields(f); setDirty(true); }} dirty={dirty} onSaved={load} />}
      {tab === "settings" && <Settings detail={detail} onSaved={load} />}
      {tab === "audience" && <Audience detail={detail} onSaved={load} />}
      {tab === "responses" && <Responses detail={detail} />}
      {tab === "preview" && <Preview title={form.title} description={form.description} instructions={form.instructions} sections={sections} fields={fields} />}

      <ConfirmDialog
        open={!!confirm} confirmLabel={confirm === "PUBLISHED" ? "Publish" : confirm === "CLOSED" ? "Close form" : "Archive"} busy={statusBusy}
        title={confirm === "PUBLISHED" ? "Publish this form?" : confirm === "CLOSED" ? "Close this form?" : "Archive this form?"}
        message={confirm === "PUBLISHED" ? "Everyone in the chosen audience will be notified and can start responding." : confirm === "CLOSED" ? "People will no longer be able to submit responses. You can reopen it later." : "The form will be hidden from users. Responses are kept."}
        onConfirm={() => confirm && setStatus(confirm)} onCancel={() => setConfirm(null)}
      />
    </>
  );
}

// ───────── Questions tab ─────────
function Questions({ detail, sections, fields, setSections, setFields, dirty, onSaved }: {
  detail: FormDetail; sections: LSection[]; fields: LField[]; setSections: (s: LSection[]) => void; setFields: (f: LField[]) => void; dirty: boolean; onSaved: () => void;
}) {
  const toast = useToast();
  const locked = detail.form.submissions > 0;
  const [newType, setNewType] = useState<FormFieldType>("SHORT_TEXT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const patch = (key: string, p: Partial<LField>) => setFields(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dropOn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const from = fields.findIndex((x) => x.key === dragKey), to = fields.findIndex((x) => x.key === targetKey);
    if (from < 0 || to < 0) return;
    const next = [...fields]; const [m] = next.splice(from, 1); next.splice(to, 0, m); setFields(next); setDragKey(null);
  };
  const remove = (key: string) => setFields(fields.filter((f) => f.key !== key).map((f) => (f.logicField === key ? { ...f, logicField: "", logicValue: "" } : f)));
  const clone = (f: LField, i: number) => { const c = { ...f, key: uid(), label: `${f.label} (copy)`, logicField: "" }; const next = [...fields]; next.splice(i + 1, 0, c); setFields(next); };

  const save = async () => {
    setError(null);
    for (const [i, f] of fields.entries()) {
      if (!f.label.trim()) { setError(`Question ${i + 1} needs a label.`); setOpen(f.key); return; }
      if (CHOICE.includes(f.type) && f.options.filter((o) => o.trim()).length < 1) { setError(`"${f.label}" needs at least one option.`); setOpen(f.key); return; }
      if (f.logicField && !fields.slice(0, i).some((x) => x.key === f.logicField)) { setError(`"${f.label}": the condition must depend on a question above it.`); setOpen(f.key); return; }
    }
    setSaving(true);
    try {
      await api(`/forms/${detail.form.id}/structure`, {
        method: "PUT",
        body: {
          sections,
          fields: fields.map((f) => ({
            key: f.key, sectionKey: f.sectionKey || null, type: f.type, label: f.label, description: f.description, placeholder: f.placeholder, helpText: f.helpText, defaultValue: f.defaultValue, required: f.required,
            validation: { min: num(f.min), max: num(f.max), minLength: num(f.minLength), maxLength: num(f.maxLength) },
            logic: f.logicField ? { fieldKey: f.logicField, operator: f.logicOp, value: f.logicValue } : null,
            options: CHOICE.includes(f.type) ? f.options.filter((o) => o.trim()).map((label) => ({ label })) : [],
          })),
        },
      });
      toast.success("Questions saved successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e, "Unable to save the questions")); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {locked && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This form has responses, so its questions are locked. Duplicate the form from the forms list to make a new version.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Sections <span className="text-xs font-normal text-slate-500">(optional headings to group questions)</span></h2>
          {!locked && <button className="btn-secondary" onClick={() => setSections([...sections, { key: uid(), title: `Section ${sections.length + 1}` }])}><Plus className="h-4 w-4" /> Add section</button>}
        </div>
        {sections.length > 0 && (
          <ul className="mt-3 space-y-2">
            {sections.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <input aria-label={`Section ${i + 1} title`} className="input" disabled={locked} maxLength={120} value={s.title} onChange={(e) => setSections(sections.map((x) => (x.key === s.key ? { ...x, title: e.target.value } : x)))} />
                {!locked && <button className="btn-secondary" aria-label={`Remove section ${i + 1}`} onClick={() => { setSections(sections.filter((x) => x.key !== s.key)); setFields(fields.map((f) => (f.sectionKey === s.key ? { ...f, sectionKey: "" } : f))); }}><X className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {fields.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No questions yet. Add the first one below.</div>}

      {fields.map((f, i) => {
        const expanded = open === f.key;
        const above = fields.slice(0, i);
        const dep = above.find((x) => x.key === f.logicField);
        const depChoices = dep ? (dep.type === "YES_NO" ? ["Yes", "No"] : dep.type === "RATING" ? ["1", "2", "3", "4", "5"] : dep.options.filter(Boolean)) : [];
        return (
          <section key={f.key} className={`card p-4 ${dragKey === f.key ? "opacity-50" : ""}`} aria-label={`Question ${i + 1}`} onDragOver={(e) => dragKey && e.preventDefault()} onDrop={() => dropOn(f.key)}>
            <div className="flex flex-wrap items-start gap-3">
              {!locked && <span draggable onDragStart={() => setDragKey(f.key)} onDragEnd={() => setDragKey(null)} className="mt-2 cursor-grab text-slate-400 hover:text-slate-600" title="Drag to reorder (or use the arrow buttons)" aria-hidden><GripVertical className="h-4 w-4" /></span>}
              <span className="mt-2 w-6 text-sm font-medium text-slate-500">{i + 1}.</span>
              <div className="min-w-[200px] flex-1">
                <input aria-label={`Question ${i + 1} label`} className="input" disabled={locked} maxLength={200} placeholder="Question text" value={f.label} onChange={(e) => patch(f.key, { label: e.target.value })} />
              </div>
              <select aria-label={`Question ${i + 1} type`} className="input w-auto" disabled={locked} value={f.type} onChange={(e) => { const t = e.target.value as FormFieldType; patch(f.key, { type: t, options: CHOICE.includes(t) ? (f.options.length ? f.options : ["Option 1", "Option 2"]) : f.options }); }}>
                {(Object.keys(FIELD_LABELS) as FormFieldType[]).map((t) => <option key={t} value={t}>{FIELD_LABELS[t]}</option>)}
              </select>
              <label className="mt-2 flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={locked} checked={f.required} onChange={(e) => patch(f.key, { required: e.target.checked })} /> Required</label>
            </div>

            {CHOICE.includes(f.type) && (
              <div className="ml-9 mt-3 space-y-2">
                {f.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input aria-label={`Question ${i + 1} option ${oi + 1}`} className="input" disabled={locked} maxLength={100} value={o} onChange={(e) => patch(f.key, { options: f.options.map((x, xi) => (xi === oi ? e.target.value : x)) })} />
                    {!locked && <button className="btn-secondary" aria-label={`Remove option ${oi + 1}`} disabled={f.options.length <= 1} onClick={() => patch(f.key, { options: f.options.filter((_, xi) => xi !== oi) })}><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                {!locked && <button className="text-sm text-brand-600 hover:underline" onClick={() => patch(f.key, { options: [...f.options, `Option ${f.options.length + 1}`] })}>+ Add option</button>}
              </div>
            )}

            <div className="ml-9 mt-3 flex flex-wrap items-center gap-2">
              <button className="text-sm text-brand-600 hover:underline" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : f.key)}>{expanded ? "Hide details" : "More options"}</button>
              <span className="flex-1" />
              {!locked && (
                <>
                  <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move question ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" aria-label={`Duplicate question ${i + 1}`} onClick={() => clone(f, i)}><Copy className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label={`Delete question ${i + 1}`} onClick={() => remove(f.key)}><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>

            {expanded && (
              <div className="ml-9 mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                {sections.length > 0 && (
                  <FormField label="Section" id={`s-${f.key}`}><select id={`s-${f.key}`} className="input" disabled={locked} value={f.sectionKey} onChange={(e) => patch(f.key, { sectionKey: e.target.value })}><option value="">No section</option>{sections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}</select></FormField>
                )}
                <FormField label="Description" id={`d-${f.key}`}><input id={`d-${f.key}`} className="input" disabled={locked} maxLength={500} value={f.description} onChange={(e) => patch(f.key, { description: e.target.value })} /></FormField>
                <FormField label="Help text" id={`h-${f.key}`}><input id={`h-${f.key}`} className="input" disabled={locked} maxLength={300} value={f.helpText} onChange={(e) => patch(f.key, { helpText: e.target.value })} /></FormField>
                {(TEXTY.includes(f.type) || f.type === "NUMBER") && <FormField label="Placeholder" id={`p-${f.key}`}><input id={`p-${f.key}`} className="input" disabled={locked} maxLength={120} value={f.placeholder} onChange={(e) => patch(f.key, { placeholder: e.target.value })} /></FormField>}
                {(TEXTY.includes(f.type) || f.type === "NUMBER" || f.type === "DATE") && <FormField label="Default value" id={`v-${f.key}`}><input id={`v-${f.key}`} className="input" disabled={locked} maxLength={200} value={f.defaultValue} onChange={(e) => patch(f.key, { defaultValue: e.target.value })} /></FormField>}
                {f.type === "NUMBER" && (<>
                  <FormField label="Minimum value" id={`mn-${f.key}`}><input id={`mn-${f.key}`} inputMode="decimal" className="input" disabled={locked} value={f.min} onChange={(e) => patch(f.key, { min: e.target.value })} /></FormField>
                  <FormField label="Maximum value" id={`mx-${f.key}`}><input id={`mx-${f.key}`} inputMode="decimal" className="input" disabled={locked} value={f.max} onChange={(e) => patch(f.key, { max: e.target.value })} /></FormField>
                </>)}
                {(f.type === "SHORT_TEXT" || f.type === "LONG_TEXT") && (<>
                  <FormField label="Minimum length" id={`ml-${f.key}`}><input id={`ml-${f.key}`} inputMode="numeric" className="input" disabled={locked} value={f.minLength} onChange={(e) => patch(f.key, { minLength: e.target.value })} /></FormField>
                  <FormField label="Maximum length" id={`xl-${f.key}`}><input id={`xl-${f.key}`} inputMode="numeric" className="input" disabled={locked} value={f.maxLength} onChange={(e) => patch(f.key, { maxLength: e.target.value })} /></FormField>
                </>)}
                <div className="sm:col-span-2">
                  <p className="label">Show this question only when...</p>
                  {i === 0 ? <p className="text-xs text-slate-500">The first question is always shown.</p> : (
                    <div className="flex flex-wrap gap-2">
                      <select aria-label="Depends on question" className="input w-auto" disabled={locked} value={f.logicField} onChange={(e) => patch(f.key, { logicField: e.target.value, logicValue: "" })}>
                        <option value="">Always show</option>
                        {above.map((a, ai) => <option key={a.key} value={a.key}>{ai + 1}. {a.label || "Untitled"}</option>)}
                      </select>
                      {f.logicField && (<>
                        <select aria-label="Condition" className="input w-auto" disabled={locked} value={f.logicOp} onChange={(e) => patch(f.key, { logicOp: e.target.value as "equals" | "notEquals" })}><option value="equals">is</option><option value="notEquals">is not</option></select>
                        {depChoices.length > 0
                          ? <select aria-label="Answer" className="input w-auto" disabled={locked} value={f.logicValue} onChange={(e) => patch(f.key, { logicValue: e.target.value })}><option value="">Select answer</option>{depChoices.map((c) => <option key={c}>{c}</option>)}</select>
                          : <input aria-label="Answer" className="input w-auto" disabled={locked} maxLength={100} placeholder="Answer" value={f.logicValue} onChange={(e) => patch(f.key, { logicValue: e.target.value })} />}
                      </>)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {!locked && (
        <div className="card flex flex-wrap items-center gap-2 p-4">
          <select aria-label="New question type" className="input w-auto" value={newType} onChange={(e) => setNewType(e.target.value as FormFieldType)}>{(Object.keys(FIELD_LABELS) as FormFieldType[]).map((t) => <option key={t} value={t}>{FIELD_LABELS[t]}</option>)}</select>
          <button className="btn-secondary" onClick={() => { const nf = blankField(newType); setFields([...fields, nf]); setOpen(null); }}><Plus className="h-4 w-4" /> Add question</button>
          <span className="flex-1" />
          {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
          <button className="btn-primary" disabled={saving || !dirty} onClick={save}>{saving && <Spinner />} Save questions</button>
        </div>
      )}
    </div>
  );
}

// ───────── Settings tab ─────────
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Settings({ detail, onSaved }: { detail: FormDetail; onSaved: () => void }) {
  const toast = useToast();
  const f = detail.form;
  const [v, setV] = useState({ title: f.title, description: f.description ?? "", instructions: f.instructions ?? "", startAt: toLocalInput(f.startAt), endAt: toLocalInput(f.endAt), limit: f.submissionLimit?.toString() ?? "", multi: f.allowMultipleSubmissions, edit: f.allowEditAfterSubmission });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await api(`/forms/${f.id}`, { method: "PATCH", body: {
        title: v.title, description: v.description, instructions: v.instructions,
        startAt: v.startAt ? new Date(v.startAt).toISOString() : null, endAt: v.endAt ? new Date(v.endAt).toISOString() : null,
        submissionLimit: v.limit, allowMultipleSubmissions: v.multi, allowEditAfterSubmission: v.multi ? false : v.edit,
      } });
      toast.success("Changes saved successfully.");
      onSaved();
    } catch (e) { setError(apiMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="card max-w-2xl space-y-3 p-4">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <FormField label="Title" id="fs-title"><input id="fs-title" className="input" maxLength={150} value={v.title} onChange={(e) => set("title", e.target.value)} /></FormField>
      <FormField label="Description" id="fs-desc"><textarea id="fs-desc" rows={2} className="input" maxLength={1000} value={v.description} onChange={(e) => set("description", e.target.value)} /></FormField>
      <FormField label="Instructions for respondents" id="fs-inst"><textarea id="fs-inst" rows={3} className="input" maxLength={2000} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} /></FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Opens at (optional)" id="fs-start"><input id="fs-start" type="datetime-local" className="input" value={v.startAt} onChange={(e) => set("startAt", e.target.value)} /></FormField>
        <FormField label="Closes at (optional)" id="fs-end"><input id="fs-end" type="datetime-local" className="input" value={v.endAt} onChange={(e) => set("endAt", e.target.value)} /></FormField>
        <FormField label="Maximum total responses (optional)" id="fs-limit"><input id="fs-limit" inputMode="numeric" className="input" value={v.limit} onChange={(e) => set("limit", e.target.value)} /></FormField>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.multi} onChange={(e) => set("multi", e.target.checked)} /> Allow each person to submit more than once</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={v.multi} checked={v.edit && !v.multi} onChange={(e) => set("edit", e.target.checked)} /> Let people edit their response after submitting</label>
      <p className="text-xs text-slate-500">Login is always required. Times use your local time zone.</p>
      <div className="flex justify-end"><button className="btn-primary" disabled={saving || v.title.trim().length < 3} onClick={save}>{saving && <Spinner />} Save settings</button></div>
    </div>
  );
}

// ───────── Audience tab ─────────
const TYPE_LABEL: Record<string, string> = {
  ALL_STUDENTS: "All students", DEPARTMENT: "Students of a department", COURSE: "Students of a course", YEAR: "Students of a year", DIVISION: "Students of a division", CLASS: "Students of a class (year + division)",
  FACULTY: "Faculty", HOD: "All HODs", TEACHERS: "Teachers (faculty + HODs)", PARENTS: "Parents", STAFF: "All staff", SELECTED_USERS: "A specific person",
};
const ADMIN_TYPES = Object.keys(TYPE_LABEL);
const HOD_TYPES = ["DEPARTMENT", "COURSE", "YEAR", "DIVISION", "CLASS", "FACULTY", "TEACHERS", "PARENTS", "SELECTED_USERS"];
const FAC_TYPES = ["COURSE", "YEAR", "DIVISION", "CLASS", "SELECTED_USERS"];

interface Rule { targetType: string; targetId: string | null; label?: string }

function Audience({ detail, onSaved }: { detail: FormDetail; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const full = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "PRINCIPAL";
  const allowed = full ? ADMIN_TYPES : user?.role === "HOD" ? HOD_TYPES : FAC_TYPES;
  const courses = useLookup("courses");
  const departments = useLookup("departments");
  const [rules, setRules] = useState<Rule[]>(detail.assignments);
  const [counts, setCounts] = useState<{ audience: number; responded: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(allowed[0]);
  const [course, setCourse] = useState("");
  const [dept, setDept] = useState("");
  const [year, setYear] = useState("1");
  const [division, setDivision] = useState("");
  const [loginId, setLoginId] = useState("");
  const [looking, setLooking] = useState(false);

  const loadCounts = useCallback(() => { api<{ audience: number; responded: number }>(`/forms/${detail.form.id}/audience`).then(setCounts).catch(() => setCounts(null)); }, [detail.form.id]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const courseName = useCallback((id: string) => (id === "*" ? "all courses" : courses.find((c) => c.id === id)?.name ?? "course"), [courses]);
  const describe = useCallback((r: Rule) => {
    const [a, b, c] = (r.targetId ?? "").split("|");
    switch (r.targetType) {
      case "DEPARTMENT": return `Students of ${departments.find((d) => d.id === r.targetId)?.name ?? "department"}`;
      case "COURSE": return `Students of ${courseName(r.targetId ?? "")}`;
      case "YEAR": return `Year ${b} students of ${courseName(a)}`;
      case "DIVISION": return `Division ${b} students of ${courseName(a)}`;
      case "CLASS": return `Year ${b}, Division ${c} of ${courseName(a)}`;
      case "FACULTY": case "TEACHERS": return `${TYPE_LABEL[r.targetType]}${r.targetId ? ` in ${departments.find((d) => d.id === r.targetId)?.name ?? "department"}` : ""}`;
      case "PARENTS": return `Parents${r.targetId ? ` of ${courseName(r.targetId)} students` : ""}`;
      case "SELECTED_USERS": return r.label ?? "A specific person";
      default: return TYPE_LABEL[r.targetType] ?? r.targetType;
    }
  }, [courseName, departments]);

  const add = async () => {
    setError(null);
    let id: string | null = null;
    let label: string | undefined;
    const c = course || (full && ["YEAR", "DIVISION", "CLASS"].includes(type) ? "*" : "");
    switch (type) {
      case "DEPARTMENT": id = dept; break;
      case "COURSE": id = course; break;
      case "YEAR": id = `${c}|${year}`; break;
      case "DIVISION": id = `${c}|${division.trim().toUpperCase()}`; break;
      case "CLASS": id = `${c}|${year}|${division.trim().toUpperCase()}`; break;
      case "FACULTY": case "TEACHERS": id = dept || null; break;
      case "PARENTS": id = course || null; break;
      case "SELECTED_USERS":
        setLooking(true);
        try { const r = await api<{ user: { id: string; name: string; loginId: string } }>(`/forms/lookup/user?loginId=${encodeURIComponent(loginId.trim())}`); id = r.user.id; label = `${r.user.name} (${r.user.loginId})`; }
        catch (e) { setError(apiMessage(e, "User not found")); setLooking(false); return; }
        setLooking(false);
        break;
    }
    if (["DEPARTMENT", "COURSE"].includes(type) && !id) { setError(type === "COURSE" ? "Choose a course." : "Choose a department."); return; }
    if (["YEAR", "DIVISION", "CLASS"].includes(type) && !c) { setError("Choose a course."); return; }
    if (["DIVISION", "CLASS"].includes(type) && !division.trim()) { setError("Enter a division."); return; }
    if (rules.some((r) => r.targetType === type && (r.targetId ?? "") === (id ?? ""))) { setError("This audience is already added."); return; }
    setRules([...rules, { targetType: type, targetId: id, label }]);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await api<{ audience: number }>(`/forms/${detail.form.id}/assignments`, { method: "PUT", body: { assignments: rules.map((x) => ({ targetType: x.targetType, targetId: x.targetId })) } });
      toast.success(`Audience saved. ${r.audience} user${r.audience === 1 ? "" : "s"} will receive this form.`);
      onSaved();
      loadCounts();
    } catch (e) { setError(apiMessage(e, "Unable to save the audience")); }
    finally { setSaving(false); }
  };

  const needCourse = ["COURSE", "YEAR", "DIVISION", "CLASS"].includes(type) || (type === "PARENTS");
  const needDept = ["DEPARTMENT"].includes(type) || (full && ["FACULTY", "TEACHERS"].includes(type));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <h2 className="font-medium">Add audience</h2>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <FormField label="Send to" id="a-type"><select id="a-type" className="input" value={type} onChange={(e) => { setType(e.target.value); setError(null); }}>{allowed.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></FormField>
        {needCourse && (
          <FormField label={type === "PARENTS" ? "Course (optional)" : "Course"} id="a-course">
            <select id="a-course" className="input" value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">{type === "PARENTS" ? (full ? "All parents" : "Select") : full && type !== "COURSE" ? "All courses" : "Select"}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        )}
        {needDept && (
          <FormField label={type === "DEPARTMENT" ? "Department" : "Department (optional)"} id="a-dept">
            <select id="a-dept" className="input" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">{type === "DEPARTMENT" ? "Select" : "All departments"}</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </FormField>
        )}
        {(type === "YEAR" || type === "CLASS") && <FormField label="Year" id="a-year"><select id="a-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></FormField>}
        {(type === "DIVISION" || type === "CLASS") && <FormField label="Division" id="a-div"><input id="a-div" className="input uppercase" maxLength={5} value={division} onChange={(e) => setDivision(e.target.value)} /></FormField>}
        {type === "SELECTED_USERS" && <FormField label="Login ID" id="a-login"><input id="a-login" className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} /></FormField>}
        <button className="btn-secondary" disabled={looking || (type === "SELECTED_USERS" && !loginId.trim())} onClick={add}>{looking ? <Spinner /> : <Plus className="h-4 w-4" />} Add</button>
      </div>

      <div className="card p-4">
        <h2 className="font-medium">Who will receive this form</h2>
        {rules.length === 0 ? <p className="mt-3 text-sm text-slate-500">No audience chosen yet. A form needs an audience before it can be published.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rules.map((r, i) => (
              <li key={`${r.targetType}-${r.targetId}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{describe(r)}</span>
                <button className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Remove ${describe(r)}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        {counts && <p className="mt-3 text-xs text-slate-500">Currently saved: {counts.audience} user{counts.audience === 1 ? "" : "s"} in the audience, {counts.responded} responded.</p>}
        <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={saving} onClick={save}>{saving && <Spinner />} Save audience</button></div>
      </div>
    </div>
  );
}

// ───────── Responses tab ─────────
function Responses({ detail }: { detail: FormDetail }) {
  const list = usePaged<FormSubmissionRow>(`/forms/${detail.form.id}/submissions`, {}, 10);
  const [viewing, setViewing] = useState<FormSubmissionRow | null>(null);
  const answers = useAnswers(detail.form.id, viewing?.id ?? null);

  const columns: Column<FormSubmissionRow>[] = [
    { key: "who", header: "Respondent", cell: (s) => <><p className="font-medium">{s.user.name}</p><p className="text-xs text-slate-500">{s.user.loginId} · {pretty(s.user.role)}</p></> },
    { key: "attempt", header: "Attempt", cell: (s) => s.attempt },
    { key: "date", header: "Submitted", cell: (s) => new Date(s.submittedAt).toLocaleString("en-IN") },
    { key: "view", header: "", className: "text-right", cell: (s) => <button className="text-sm text-brand-600 hover:underline" onClick={() => setViewing(s)}>View</button> },
  ];

  return (
    <>
      <Analytics formId={detail.form.id} responses={detail.form.submissions ?? 0} />
      <div className="mb-3 flex justify-end">
        <a className="btn-secondary" href={`/api/forms/${detail.form.id}/export`} download><Download className="h-4 w-4" /> Export CSV</a>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload} meta={list.meta} onPage={list.setPage} emptyTitle="No responses yet" emptyHint="Responses appear here as people submit the form." />
      </div>
      <Modal open={!!viewing} title={viewing ? `${viewing.user.name}'s response` : "Response"} onClose={() => setViewing(null)} wide>
        {answers.loading ? <LoadingState rows={3} /> : answers.error ? <ErrorState message={answers.error} /> : (
          <dl className="space-y-3 text-sm">
            {answers.data?.map((a) => (
              <div key={a.fieldId}><dt className="font-medium text-slate-700">{a.label}</dt><dd className="text-slate-600">{a.type === "FILE_UPLOAD" && a.value && typeof a.value === "object" ? <a className="text-brand-600 hover:underline" href={`/api/forms/file/${(a.value as { fileId: string }).fileId}`} download>{(a.value as { name: string }).name}</a> : Array.isArray(a.value) ? (a.value as string[]).join(", ") || "—" : a.value === null || a.value === "" ? "—" : String(a.value)}</dd></div>
            ))}
          </dl>
        )}
      </Modal>
    </>
  );
}

function useAnswers(formId: string, sid: string | null) {
  const [data, setData] = useState<{ fieldId: string; label: string; type: string; value: unknown }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sid) return;
    let live = true;
    setLoading(true); setError(null); setData(null);
    api<{ answers: { fieldId: string; label: string; type: string; value: unknown }[] }>(`/forms/${formId}/submissions/${sid}`)
      .then((r) => live && setData(r.answers))
      .catch((e) => live && setError(apiMessage(e, "Unable to load the response")))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [formId, sid]);
  return { data, loading, error };
}

// ───────── Preview tab ─────────
function Preview({ title, description, instructions, sections, fields }: { title: string; description: string | null; instructions: string | null; sections: LSection[]; fields: LField[] }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const defs = useMemo(() => fields.map(toDef), [fields]);
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">This is how the form looks to people. Nothing you enter here is saved.</p>
      <div className="card p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        {instructions && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{instructions}</p>}
        <div className="mt-5">
          {defs.length === 0 ? <p className="text-sm text-slate-500">Add questions to see the preview.</p> : (
            <FormRenderer sections={sections.map((s) => ({ id: s.key, title: s.title }))} fields={defs} answers={answers} errors={{}} onChange={(fid, v) => setAnswers((a) => ({ ...a, [fid]: v }))} />
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Analytics (summary of all responses) ─────────
interface QStat { id: string; label: string; type: string; answered: number; kind: "choice" | "number" | "text"; counts?: { label: string; count: number }[]; min?: number | null; max?: number | null; average?: number | null; distribution?: { label: string; count: number }[] }
function Analytics({ formId, responses }: { formId: string; responses: number }) {
  const data = useApi<{ responses: number; questions: QStat[] }>(responses > 0 ? `/forms/${formId}/analytics` : null);
  if (responses === 0) return null;
  if (data.loading) return <div className="mb-4"><LoadingState rows={2} /></div>;
  if (data.error) return <div className="mb-4"><ErrorState message={data.error} onRetry={data.reload} /></div>;
  const qs = (data.data?.questions ?? []).filter((q) => q.kind !== "text");
  if (!qs.length) return null;
  const bars = (rows: { label: string; count: number }[], total: number) => (
    <ul className="mt-2 space-y-1.5">
      {rows.map((c) => (
        <li key={c.label} className="text-xs">
          <div className="flex justify-between"><span>{c.label}</span><span className="text-slate-500">{c.count} ({total ? Math.round((c.count / total) * 100) : 0}%)</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${total ? (c.count / total) * 100 : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Response summary" className="mb-6">
      <h2 className="mb-3 font-medium">Summary · {data.data?.responses} response{data.data?.responses === 1 ? "" : "s"}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {qs.map((q) => (
          <div key={q.id} className="card p-4">
            <p className="text-sm font-medium">{q.label}</p>
            <p className="text-xs text-slate-500">{q.answered} answered</p>
            {q.kind === "choice" && bars(q.counts ?? [], q.answered)}
            {q.kind === "number" && (
              <>
                <p className="mt-2 text-sm">Average <span className="text-xl font-semibold">{q.average ?? "—"}</span> <span className="text-xs text-slate-500">min {q.min ?? "—"} · max {q.max ?? "—"}</span></p>
                {q.type === "RATING" && bars(q.distribution ?? [], q.answered)}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
