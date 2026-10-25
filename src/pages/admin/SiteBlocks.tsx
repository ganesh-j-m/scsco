import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { ErrorState, LoadingState, PageHeader, Spinner } from "@/components/ui";
import { apiMessage, FormField, PhotoField } from "@/components/forms";

type Content = Record<string, Record<string, unknown> | undefined>;
type Kind = "text" | "textarea" | "image" | "lines" | "activities";
interface Spec { key: string; label: string; kind: Kind; hint?: string; half?: boolean }

function useSiteContent() {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setContent((await api<{ content: Content }>("/cms/site")).content); }
    catch (e) { setError(apiMessage(e, "Unable to load the content")); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { content, error, reload: load };
}

type Activity = { title: string; imageUrl: string };

function BlockEditor({ blockKey, title, hint, specs, initial }: { blockKey: string; title: string; hint?: string; specs: Spec[]; initial: Record<string, unknown> | undefined }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, unknown>>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setV(initial ?? {}), [initial]);

  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const lines = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
  const acts = (k: string) => (Array.isArray(v[k]) ? (v[k] as Activity[]) : []);
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    setSaving(true); setError(null);
    try { await api(`/cms/site/${blockKey}`, { method: "PUT", body: v }); toast.success("Changes saved successfully."); }
    catch (e) { setError(apiMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <section className="card mb-6 p-4" aria-labelledby={`h-${blockKey}`}>
      <h2 id={`h-${blockKey}`} className="font-medium">{title}</h2>
      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {specs.map((s) => {
          const id = `${blockKey}-${s.key}`;
          const cls = s.half ? "" : "sm:col-span-2";
          if (s.kind === "image") return <FormField key={s.key} label={s.label} id={id} className={cls}><PhotoField noun="image" value={str(s.key)} onChange={(u) => set(s.key, u)} /></FormField>;
          if (s.kind === "textarea") return <FormField key={s.key} label={s.label} id={id} className={cls}><textarea id={id} rows={5} className="input" value={str(s.key)} onChange={(e) => set(s.key, e.target.value)} /></FormField>;
          if (s.kind === "lines") return <FormField key={s.key} label={`${s.label} (one per line)`} id={id} className={cls}><textarea id={id} rows={5} className="input" value={lines(s.key).join("\n")} onChange={(e) => set(s.key, e.target.value.split("\n"))} />{s.hint && <p className="mt-1 text-xs text-slate-500">{s.hint}</p>}</FormField>;
          if (s.kind === "activities") return (
            <div key={s.key} className="sm:col-span-2">
              <p className="label">{s.label}</p>
              <ul className="space-y-3">
                {acts(s.key).map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <input aria-label={`Activity ${i + 1} title`} className="input min-w-[180px] flex-1" placeholder="Activity title" value={a.title} onChange={(e) => set(s.key, acts(s.key).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    <PhotoField noun="image" value={a.imageUrl} onChange={(u) => set(s.key, acts(s.key).map((x, j) => (j === i ? { ...x, imageUrl: u } : x)))} />
                    <button type="button" className="btn-secondary" aria-label={`Remove activity ${i + 1}`} onClick={() => set(s.key, acts(s.key).filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-secondary mt-3" onClick={() => set(s.key, [...acts(s.key), { title: "", imageUrl: "" }])}><Plus className="h-4 w-4" /> Add activity</button>
            </div>
          );
          return <FormField key={s.key} label={s.label} id={id} className={cls}><input id={id} className="input" value={str(s.key)} onChange={(e) => set(s.key, e.target.value)} /></FormField>;
        })}
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={saving} onClick={save}>{saving && <Spinner />} Save changes</button></div>
    </section>
  );
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: (c: Content) => React.ReactNode }) {
  const { content, error, reload } = useSiteContent();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {error ? <ErrorState message={error} onRetry={reload} /> : !content ? <LoadingState rows={5} /> : children(content)}
    </>
  );
}

export function Homepage() {
  return (
    <Page title="Homepage" subtitle="Hero banner, about section and campus life content">
      {(c) => (
        <>
          <BlockEditor blockKey="site.hero" title="Hero banner" initial={c["site.hero"]} specs={[
            { key: "title", label: "Heading", kind: "text" }, { key: "subtitle", label: "Subheading", kind: "text" },
            { key: "ctaLabel", label: "Button label", kind: "text", half: true }, { key: "imageUrl", label: "Banner image", kind: "image" },
          ]} />
          <BlockEditor blockKey="site.about" title="About the college" initial={c["site.about"]} specs={[
            { key: "summary", label: "Summary", kind: "textarea" }, { key: "mission", label: "Mission", kind: "textarea" }, { key: "vision", label: "Vision", kind: "textarea" },
            { key: "highlights", label: "Highlights", kind: "lines", hint: "Up to 10 short points." }, { key: "imageUrl", label: "Image", kind: "image" },
          ]} />
          <BlockEditor blockKey="site.campus" title="Campus life" initial={c["site.campus"]} specs={[
            { key: "intro", label: "Introduction", kind: "textarea" }, { key: "activities", label: "Activities", kind: "activities" },
          ]} />
        </>
      )}
    </Page>
  );
}

export function PrincipalProfile() {
  return (
    <Page title="Principal profile" subtitle="Shown on the Principal's Message page and the homepage">
      {(c) => <BlockEditor blockKey="site.principal" title="Principal" initial={c["site.principal"]} specs={[
        { key: "name", label: "Name", kind: "text", half: true }, { key: "designation", label: "Designation", kind: "text", half: true },
        { key: "photoUrl", label: "Photo", kind: "image" }, { key: "message", label: "Message", kind: "textarea" },
      ]} />}
    </Page>
  );
}

export function ContactInfo() {
  return (
    <Page title="Contact" subtitle="Address and contact details on the Contact page">
      {(c) => <BlockEditor blockKey="site.contact" title="Contact details" initial={c["site.contact"]} specs={[
        { key: "address", label: "Address", kind: "textarea" }, { key: "phone", label: "Phone", kind: "text", half: true }, { key: "email", label: "Email", kind: "text", half: true },
        { key: "hours", label: "Office hours", kind: "text", half: true }, { key: "mapUrl", label: "Map link (https)", kind: "text", half: true },
      ]} />}
    </Page>
  );
}

export function AdmissionsInfo() {
  return (
    <Page title="Admissions information" subtitle="Text shown above the public admission form">
      {(c) => <BlockEditor blockKey="site.admissions" title="Admissions" initial={c["site.admissions"]} specs={[
        { key: "intro", label: "Introduction", kind: "textarea" }, { key: "steps", label: "Admission steps", kind: "lines" }, { key: "documents", label: "Documents required", kind: "lines" },
      ]} />}
    </Page>
  );
}
