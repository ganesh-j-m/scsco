import { Link } from "react-router-dom";
import { Calendar, MapPin, Clock, Mail, Phone } from "lucide-react";
import { useSite } from "@/hooks/useSite";
import { useApi } from "@/hooks/useApi";
import { CardGrid, DataState, formatDate, ImageCard, LazyImage, PageHero, Reveal, Section, CardSkeletons } from "@/components/public";
import type { Achievement, Course, Department, EventItem, Facility, List, Placement } from "@/types/public";

export function About() {
  const { site } = useSite();
  const a = site["site.about"];
  return (
    <>
      <PageHero title="About the college" subtitle={a?.summary} />
      <Section>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            {a?.mission && <div className="card p-5"><h2 className="font-semibold">Mission</h2><p className="mt-1 text-sm text-slate-600">{a.mission}</p></div>}
            {a?.vision && <div className="card p-5"><h2 className="font-semibold">Vision</h2><p className="mt-1 text-sm text-slate-600">{a.vision}</p></div>}
            {a?.highlights && <ul className="grid grid-cols-2 gap-2 text-sm">{a.highlights.map((h) => <li key={h} className="rounded-lg bg-slate-50 px-3 py-2">{h}</li>)}</ul>}
            {!a && <p className="text-sm text-slate-500">About content has not been published yet.</p>}
          </div>
          <div className="overflow-hidden rounded-xl"><LazyImage src={a?.imageUrl} alt="College campus" ratio="aspect-[3/2]" /></div>
        </div>
      </Section>
    </>
  );
}

export function PrincipalMessage() {
  const p = useSite().site["site.principal"];
  return (
    <>
      <PageHero title="Principal's message" />
      <Section>
        {p?.message ? (
          <div className="grid gap-8 md:grid-cols-[240px_1fr]">
            <div><div className="overflow-hidden rounded-xl"><LazyImage src={p.photoUrl} alt={p.name ?? "Principal"} ratio="aspect-[4/5]" /></div><p className="mt-3 font-medium">{p.name}</p><p className="text-sm text-slate-500">{p.designation}</p></div>
            <p className="whitespace-pre-line text-slate-700">{p.message}</p>
          </div>
        ) : <p className="text-sm text-slate-500">The principal's message has not been published yet.</p>}
      </Section>
    </>
  );
}

export function Academics() {
  const depts = useApi<List<Department>>("/public/departments");
  const courses = useApi<List<Course>>("/public/courses");
  return (
    <>
      <PageHero title="Academics" subtitle="Departments and programmes offered" />
      <Section title="Departments" action={{ to: "/departments", label: "View all" }}>
        <DataState loading={depts.loading} error={depts.error} empty={!depts.data?.data.length} onRetry={depts.reload} emptyTitle="No departments yet">
          <CardGrid>{depts.data?.data.map((d) => <article key={d.id} className="card p-5"><p className="text-xs font-medium text-brand-600">{d.code}</p><h3 className="font-medium">{d.name}</h3><p className="mt-1 text-sm text-slate-600">{d._count.courses} courses · {d._count.faculty} faculty</p></article>)}</CardGrid>
        </DataState>
      </Section>
      <Section title="Courses" action={{ to: "/courses", label: "View all" }} tone="slate">
        <DataState loading={courses.loading} error={courses.error} empty={!courses.data?.data.length} onRetry={courses.reload} emptyTitle="No courses yet">
          <CardGrid>{courses.data?.data.slice(0, 6).map((c) => <article key={c.id} className="card p-5"><h3 className="font-medium">{c.name}</h3><p className="text-xs text-slate-500">{c.department.name} · {c.durationYears} years</p></article>)}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function Departments() {
  const d = useApi<List<Department>>("/public/departments");
  return (
    <>
      <PageHero title="Departments" />
      <Section>
        <DataState loading={d.loading} error={d.error} empty={!d.data?.data.length} onRetry={d.reload} emptyTitle="No departments yet">
          <CardGrid>{d.data?.data.map((x, i) => (
            <Reveal key={x.id} delay={i * 0.04}><article className="card h-full p-5">
              <p className="text-xs font-medium text-brand-600">{x.code}</p><h2 className="font-semibold">{x.name}</h2>
              {x.description && <p className="mt-1 text-sm text-slate-600">{x.description}</p>}
              <p className="mt-3 text-xs text-slate-500">{x._count.courses} courses · {x._count.faculty} faculty</p>
              {x.hod && <p className="mt-2 text-sm">HOD: <span className="font-medium">{x.hod.user.name}</span></p>}
            </article></Reveal>
          ))}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function Courses() {
  const c = useApi<List<Course>>("/public/courses");
  return (
    <>
      <PageHero title="Courses" subtitle="Programmes available at the college" />
      <Section>
        <DataState loading={c.loading} error={c.error} empty={!c.data?.data.length} onRetry={c.reload} emptyTitle="No courses yet">
          <CardGrid>{c.data?.data.map((x) => (
            <article key={x.id} className="card p-5"><p className="text-xs font-medium text-brand-600">{x.code}</p><h2 className="font-semibold">{x.name}</h2>
              <p className="text-xs text-slate-500">{x.department.name} · {x.durationYears} years</p>{x.description && <p className="mt-2 text-sm text-slate-600">{x.description}</p>}
              <Link to="/admissions" className="mt-3 inline-block text-sm font-medium text-brand-600">Apply</Link></article>
          ))}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function CampusLife() {
  const c = useSite().site["site.campus"];
  return (
    <>
      <PageHero title="Campus life" subtitle={c?.intro} />
      <Section>
        {c?.activities?.length ? <CardGrid>{c.activities.map((a) => <ImageCard key={a.title} image={a.imageUrl} title={a.title} />)}</CardGrid> : <p className="text-sm text-slate-500">Campus content has not been published yet.</p>}
      </Section>
    </>
  );
}

export function Facilities() {
  const f = useApi<List<Facility>>("/public/facilities");
  return (
    <>
      <PageHero title="Facilities" />
      <Section>
        <DataState loading={f.loading} error={f.error} empty={!f.data?.data.length} onRetry={f.reload} emptyTitle="No facilities yet">
          <CardGrid>{f.data?.data.map((x) => <ImageCard key={x.id} image={x.imageUrl} title={x.name} text={x.description} />)}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function Events() {
  const up = useApi<List<EventItem>>("/public/events?when=upcoming&pageSize=24");
  const past = useApi<List<EventItem>>("/public/events?when=past&pageSize=12");
  const grid = (r: typeof up, empty: string) => (
    <DataState loading={r.loading} error={r.error} empty={!r.data?.data.length} onRetry={r.reload} emptyTitle={empty}>
      <CardGrid>{r.data?.data.map((e) => <ImageCard key={e.id} image={e.imageUrl} title={e.title} text={e.description} meta={`${formatDate(e.date)}${e.venue ? ` · ${e.venue}` : ""}`} />)}</CardGrid>
    </DataState>
  );
  return (
    <>
      <PageHero title="Events" />
      <Section title="Upcoming">{grid(up, "No upcoming events")}</Section>
      <Section title="Past events" tone="slate">{grid(past, "No past events")}</Section>
    </>
  );
}

export function Achievements() {
  const a = useApi<List<Achievement>>("/public/achievements");
  return (
    <>
      <PageHero title="Achievements" />
      <Section>
        <DataState loading={a.loading} error={a.error} empty={!a.data?.data.length} onRetry={a.reload} emptyTitle="No achievements yet">
          <CardGrid>{a.data?.data.map((x) => <ImageCard key={x.id} image={x.imageUrl} title={x.title} text={x.description} meta={formatDate(x.date)} />)}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function Placements() {
  const p = useApi<List<Placement>>("/public/placements");
  return (
    <>
      <PageHero title="Placements" subtitle="Campus drives and opportunities" />
      <Section>
        <DataState loading={p.loading} error={p.error} empty={!p.data?.data.length} onRetry={p.reload} emptyTitle="No placement drives yet" skeletons={<CardSkeletons />}>
          <CardGrid>{p.data?.data.map((x) => (
            <article key={x.id} className="card p-5">
              <h2 className="font-semibold">{x.company}</h2><p className="text-sm text-slate-600">{x.jobTitle}</p>
              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                {x.package && <div><dt className="inline text-slate-500">Package: </dt><dd className="inline">{x.package}</dd></div>}
                {x.location && <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{x.location}</div>}
                {x.driveDate && <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" aria-hidden />Drive: {formatDate(x.driveDate)}</div>}
                {x.deadline && <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />Apply by {formatDate(x.deadline)}</div>}
                {x.eligibility && <div><dt className="inline text-slate-500">Eligibility: </dt><dd className="inline">{x.eligibility}</dd></div>}
              </dl>
            </article>
          ))}</CardGrid>
        </DataState>
      </Section>
    </>
  );
}

export function Contact() {
  const c = useSite().site["site.contact"];
  const rows = [
    { icon: MapPin, label: "Address", value: c?.address },
    { icon: Phone, label: "Phone", value: c?.phone },
    { icon: Mail, label: "Email", value: c?.email },
    { icon: Clock, label: "Office hours", value: c?.hours },
  ].filter((r) => r.value);
  return (
    <>
      <PageHero title="Contact us" />
      <Section>
        {rows.length ? (
          <CardGrid cols={2}>{rows.map((r) => (
            <div key={r.label} className="card flex gap-3 p-5"><r.icon className="mt-0.5 h-5 w-5 text-brand-600" aria-hidden /><div><p className="text-xs text-slate-500">{r.label}</p><p className="text-sm font-medium">{r.value}</p></div></div>
          ))}</CardGrid>
        ) : <p className="text-sm text-slate-500">Contact details have not been published yet.</p>}
        {c?.mapUrl && <iframe title="College location map" src={c.mapUrl} loading="lazy" className="mt-6 h-72 w-full rounded-xl border-0" />}
      </Section>
    </>
  );
}
