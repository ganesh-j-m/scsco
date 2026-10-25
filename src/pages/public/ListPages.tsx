import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileText, X } from "lucide-react";
import { api, ApiError, qs } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useSite } from "@/hooks/useSite";
import { useDebounce } from "@/hooks/useDebounce";
import { CardGrid, CardSkeletons, DataState, formatDate, LazyImage, PageHero, Section } from "@/components/public";
import { Pagination, Spinner } from "@/components/ui";
import type { Course, Department, FacultyMember, GalleryItem, List, Notice } from "@/types/public";
import type { PageMeta } from "@/types";

export function Faculty() {
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const depts = useApi<List<Department>>("/public/departments");
  const res = useApi<List<FacultyMember>>(`/public/faculty${qs({ page, pageSize: 12, search: q, departmentId })}`);
  useEffect(() => setPage(1), [q, departmentId]);
  return (
    <>
      <PageHero title="Faculty" subtitle="Our teaching staff" />
      <Section>
        <div className="mb-5 flex flex-wrap gap-3">
          <input className="input max-w-xs" placeholder="Search by name" aria-label="Search faculty" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-auto" aria-label="Filter by department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {depts.data?.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <DataState loading={res.loading} error={res.error} empty={!res.data?.data.length} onRetry={res.reload} emptyTitle="No faculty found" skeletons={<CardSkeletons n={4} />}>
          <CardGrid cols={4}>{res.data?.data.map((f) => (
            <article key={f.id} className="card overflow-hidden text-center">
              <LazyImage src={f.photoUrl} alt={f.user.name} ratio="aspect-square" />
              <div className="p-4"><h2 className="font-medium">{f.user.name}</h2><p className="text-sm text-slate-600">{f.designation}</p><p className="text-xs text-slate-500">{f.department.name}</p>{f.qualification && <p className="mt-1 text-xs text-slate-500">{f.qualification}</p>}</div>
            </article>
          ))}</CardGrid>
          {res.data?.meta && res.data.meta.totalPages > 1 && <div className="card mt-6"><Pagination {...(res.data.meta as PageMeta)} onChange={setPage} /></div>}
        </DataState>
      </Section>
    </>
  );
}

export function Notices() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const res = useApi<List<Notice>>(`/public/notices${qs({ page, pageSize: 10, search: q })}`);
  useEffect(() => setPage(1), [q]);
  return (
    <>
      <PageHero title="Notices" subtitle="Official announcements" />
      <Section>
        <input className="input mb-5 max-w-xs" placeholder="Search notices" aria-label="Search notices" value={search} onChange={(e) => setSearch(e.target.value)} />
        <DataState loading={res.loading} error={res.error} empty={!res.data?.data.length} onRetry={res.reload} emptyTitle="No notices found" skeletons={<div className="skeleton h-48 rounded-xl" />}>
          <ul className="card divide-y divide-slate-100">{res.data?.data.map((n) => (
            <li key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3"><h2 className="font-medium">{n.title}</h2><span className="shrink-0 text-xs text-slate-500">{formatDate(n.publishedAt)}</span></div>
              <p className="mt-1 text-sm text-slate-600">{n.body}</p>
              {n.attachmentUrl && <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600"><FileText className="h-4 w-4" aria-hidden />Attachment</a>}
            </li>
          ))}</ul>
          {res.data?.meta && <div className="card mt-4"><Pagination {...(res.data.meta as PageMeta)} onChange={setPage} /></div>}
        </DataState>
      </Section>
    </>
  );
}

export function Gallery() {
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const res = useApi<List<GalleryItem> & { categories?: string[] }>(`/public/gallery${qs({ page, pageSize: 12, category })}`);
  useEffect(() => setPage(1), [category]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <PageHero title="Gallery" />
      <Section>
        {!!res.data?.categories?.length && (
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {["", ...res.data.categories].map((c) => (
              <button key={c || "all"} onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full px-3 py-1 text-sm ${category === c ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{c || "All"}</button>
            ))}
          </div>
        )}
        <DataState loading={res.loading && !res.data} error={res.error} empty={!res.data?.data.length} onRetry={res.reload} emptyTitle="No photos yet" skeletons={<CardSkeletons n={6} />}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{res.data?.data.map((g) => (
            <button key={g.id} onClick={() => setOpen(g)} className="group overflow-hidden rounded-lg" aria-label={`Open ${g.title}`}>
              <div className="transition-transform duration-300 group-hover:scale-105"><LazyImage src={g.imageUrl} alt={g.title} /></div>
            </button>
          ))}</div>
          {res.data?.meta && res.data.meta.totalPages > 1 && <div className="card mt-6"><Pagination {...(res.data.meta as PageMeta)} onChange={setPage} /></div>}
        </DataState>
      </Section>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={open.title}>
            <button className="absolute right-4 top-4 text-white" aria-label="Close" onClick={() => setOpen(null)}><X /></button>
            <motion.img initial={{ scale: 0.95 }} animate={{ scale: 1 }} src={open.imageUrl} alt={open.title} className="max-h-[85vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const applySchema = z.object({
  applicantName: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid phone number"),
  courseId: z.string().optional(),
  previousMarks: z.union([z.literal(""), z.coerce.number().min(0, "0-100").max(100, "0-100")]).optional(),
  address: z.string().trim().max(300).optional(),
});
type ApplyValues = z.infer<typeof applySchema>;

export function Admissions() {
  const info = useSite().site["site.admissions"];
  const courses = useApi<List<Course>>("/public/courses");
  const [reference, setReference] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ApplyValues>({ resolver: zodResolver(applySchema) });

  const onSubmit = async (v: ApplyValues) => {
    setApiError(null);
    try {
      const body = { ...v, previousMarks: v.previousMarks === "" ? undefined : v.previousMarks };
      const r = await api<{ reference: string }>("/public/admissions", { body });
      setReference(r.reference);
      reset();
    } catch (e) {
      setApiError(e instanceof ApiError ? e.details?.map((d) => d.message).join(", ") || e.message : "Unable to submit. Please try again.");
    }
  };

  const err = (k: keyof ApplyValues) => errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k]?.message as string}</p>;

  return (
    <>
      <PageHero title="Admissions" subtitle={info?.intro} />
      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            {info?.steps && <div><h2 className="mb-3 font-semibold">How to apply</h2><ol className="space-y-2">{info.steps.map((s, i) => <li key={s} className="card flex gap-3 p-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{i + 1}</span>{s}</li>)}</ol></div>}
            {info?.documents && <div><h2 className="mb-3 font-semibold">Documents required</h2><ul className="grid grid-cols-2 gap-2 text-sm">{info.documents.map((d) => <li key={d} className="rounded-lg bg-slate-50 px-3 py-2">{d}</li>)}</ul></div>}
          </div>
          <div className="card p-5">
            {reference ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
                <h2 className="mt-3 font-semibold">Application received</h2>
                <p className="mt-1 text-sm text-slate-600">Reference number: <span className="font-medium">{reference}</span></p>
                <button className="btn-secondary mt-4" onClick={() => setReference(null)}>Submit another</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
                <h2 className="font-semibold">Apply online</h2>
                {apiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}
                <div><label className="label" htmlFor="a-name">Full name</label><input id="a-name" className="input" {...register("applicantName")} />{err("applicantName")}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="label" htmlFor="a-email">Email</label><input id="a-email" type="email" className="input" {...register("email")} />{err("email")}</div>
                  <div><label className="label" htmlFor="a-phone">Phone</label><input id="a-phone" className="input" {...register("phone")} />{err("phone")}</div>
                </div>
                <div><label className="label" htmlFor="a-course">Course</label>
                  <select id="a-course" className="input" {...register("courseId")}><option value="">Select a course</option>{courses.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="label" htmlFor="a-marks">Previous marks (%)</label><input id="a-marks" type="number" step="0.01" className="input" {...register("previousMarks")} />{err("previousMarks")}</div>
                <div><label className="label" htmlFor="a-addr">Address</label><textarea id="a-addr" rows={2} className="input" {...register("address")} /></div>
                <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting && <Spinner />} Submit application</button>
              </form>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
