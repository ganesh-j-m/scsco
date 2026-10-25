import { Link } from "react-router-dom";
import { ArrowRight, Calendar, GraduationCap, Users, Building2, BookOpen } from "lucide-react";
import { useSite } from "@/hooks/useSite";
import { useApi } from "@/hooks/useApi";
import { CardGrid, CardSkeletons, DataState, formatDate, ImageCard, LazyImage, Reveal, Section } from "@/components/public";
import type { Achievement, Department, EventItem, Facility, GalleryItem, List, Notice, Placement, Stats } from "@/types/public";

export default function Home() {
  const { site } = useSite();
  const hero = site["site.hero"];
  const about = site["site.about"];
  const principal = site["site.principal"];
  const stats = useApi<Stats>("/public/stats");
  const depts = useApi<List<Department>>("/public/departments");
  const notices = useApi<List<Notice>>("/public/notices?pageSize=4");
  const events = useApi<List<EventItem>>("/public/events?when=upcoming&pageSize=3");
  const facilities = useApi<List<Facility>>("/public/facilities");
  const achievements = useApi<List<Achievement>>("/public/achievements");
  const placements = useApi<List<Placement>>("/public/placements");
  const gallery = useApi<List<GalleryItem>>("/public/gallery?pageSize=6");

  const statCards = stats.data
    ? [
        { label: "Students", value: stats.data.students, icon: GraduationCap },
        { label: "Faculty", value: stats.data.faculty, icon: Users },
        { label: "Departments", value: stats.data.departments, icon: Building2 },
        { label: "Courses", value: stats.data.courses, icon: BookOpen },
      ]
    : [];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-900 text-white">
        {hero?.imageUrl && <img src={hero.imageUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30" fetchPriority="high" />}
        <div className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <h1 className="max-w-2xl text-3xl font-semibold md:text-4xl">{hero?.title ?? "Sharadabai Pawar College, Omerga"}</h1>
          {hero?.subtitle && <p className="mt-3 max-w-xl text-brand-100">{hero.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/admissions" className="btn bg-accent-500 text-white hover:bg-accent-600">{hero?.ctaLabel ?? "Apply now"}</Link>
            <Link to="/academics" className="btn border border-white/30 text-white hover:bg-white/10">Explore academics</Link>
          </div>
        </div>
      </section>

      {statCards.length > 0 && (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><s.icon className="h-5 w-5" aria-hidden /></span>
                <div><p className="text-xl font-semibold">{s.value}</p><p className="text-xs text-slate-500">{s.label}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {about?.summary && (
        <Section>
          <div className="grid items-center gap-8 md:grid-cols-2">
            <Reveal>
              <h2 className="text-xl font-semibold">About the college</h2>
              <p className="mt-2 text-slate-600">{about.summary}</p>
              {about.highlights && <ul className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-700">{about.highlights.map((h) => <li key={h} className="rounded-lg bg-slate-50 px-3 py-2">{h}</li>)}</ul>}
              <Link to="/about" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600">Read more <ArrowRight className="h-4 w-4" /></Link>
            </Reveal>
            <div className="overflow-hidden rounded-xl"><LazyImage src={about.imageUrl} alt="College campus" ratio="aspect-[3/2]" /></div>
          </div>
        </Section>
      )}

      <Section title="Departments" action={{ to: "/departments", label: "All departments" }} tone="slate">
        <DataState loading={depts.loading} error={depts.error} empty={!depts.data?.data.length} onRetry={depts.reload} emptyTitle="No departments yet">
          <CardGrid>{depts.data?.data.slice(0, 3).map((d) => (
            <article key={d.id} className="card p-5"><p className="text-xs font-medium text-brand-600">{d.code}</p><h3 className="mt-1 font-medium">{d.name}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{d.description}</p></article>
          ))}</CardGrid>
        </DataState>
      </Section>

      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-semibold">Latest notices</h2><Link to="/notices" className="text-sm font-medium text-brand-600">View all</Link></div>
            <DataState loading={notices.loading} error={notices.error} empty={!notices.data?.data.length} onRetry={notices.reload} emptyTitle="No notices" skeletons={<div className="skeleton h-40 rounded-xl" />}>
              <ul className="card divide-y divide-slate-100">{notices.data?.data.map((n) => (
                <li key={n.id} className="p-4"><p className="font-medium">{n.title}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(n.publishedAt)}</p></li>
              ))}</ul>
            </DataState>
          </div>
          <div>
            <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-semibold">Upcoming events</h2><Link to="/events" className="text-sm font-medium text-brand-600">View all</Link></div>
            <DataState loading={events.loading} error={events.error} empty={!events.data?.data.length} onRetry={events.reload} emptyTitle="No upcoming events" skeletons={<div className="skeleton h-40 rounded-xl" />}>
              <ul className="space-y-3">{events.data?.data.map((e) => (
                <li key={e.id} className="card flex gap-3 overflow-hidden"><div className="w-28 shrink-0"><LazyImage src={e.imageUrl} alt={e.title} ratio="aspect-square" /></div>
                  <div className="py-3 pr-3"><p className="font-medium">{e.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Calendar className="h-3 w-3" aria-hidden />{formatDate(e.date)}{e.venue && ` · ${e.venue}`}</p></div></li>
              ))}</ul>
            </DataState>
          </div>
        </div>
      </Section>

      <Section title="Facilities" action={{ to: "/facilities", label: "All facilities" }} tone="slate">
        <DataState loading={facilities.loading} error={facilities.error} empty={!facilities.data?.data.length} onRetry={facilities.reload} emptyTitle="No facilities yet" skeletons={<CardSkeletons n={4} />}>
          <CardGrid cols={4}>{facilities.data?.data.slice(0, 4).map((f) => <ImageCard key={f.id} image={f.imageUrl} title={f.name} text={f.description} />)}</CardGrid>
        </DataState>
      </Section>

      <Section title="Achievements" action={{ to: "/achievements", label: "All achievements" }}>
        <DataState loading={achievements.loading} error={achievements.error} empty={!achievements.data?.data.length} onRetry={achievements.reload} emptyTitle="No achievements yet">
          <CardGrid>{achievements.data?.data.slice(0, 3).map((a) => <ImageCard key={a.id} image={a.imageUrl} title={a.title} text={a.description} meta={formatDate(a.date)} />)}</CardGrid>
        </DataState>
      </Section>

      <Section title="Placement highlights" action={{ to: "/placements", label: "All drives" }} tone="slate">
        <DataState loading={placements.loading} error={placements.error} empty={!placements.data?.data.length} onRetry={placements.reload} emptyTitle="No placement drives yet">
          <CardGrid>{placements.data?.data.slice(0, 3).map((p) => (
            <article key={p.id} className="card p-5"><p className="font-medium">{p.company}</p><p className="text-sm text-slate-600">{p.jobTitle}</p><p className="mt-2 text-xs text-slate-500">{[p.package, p.location].filter(Boolean).join(" · ")}</p></article>
          ))}</CardGrid>
        </DataState>
      </Section>

      <Section title="Gallery" action={{ to: "/gallery", label: "Open gallery" }}>
        <DataState loading={gallery.loading} error={gallery.error} empty={!gallery.data?.data.length} onRetry={gallery.reload} emptyTitle="No photos yet">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{gallery.data?.data.map((g) => <div key={g.id} className="overflow-hidden rounded-lg"><LazyImage src={g.imageUrl} alt={g.title} /></div>)}</div>
        </DataState>
      </Section>

      {principal?.message && (
        <Section tone="slate">
          <div className="card grid items-center gap-6 p-6 md:grid-cols-[180px_1fr]">
            <div className="mx-auto w-40 overflow-hidden rounded-xl md:w-full"><LazyImage src={principal.photoUrl} alt={principal.name ?? "Principal"} ratio="aspect-[4/5]" /></div>
            <div>
              <h2 className="text-lg font-semibold">From the Principal</h2>
              <p className="mt-2 line-clamp-4 text-slate-600">{principal.message}</p>
              <p className="mt-3 text-sm font-medium">{principal.name}<span className="font-normal text-slate-500"> · {principal.designation}</span></p>
              <Link to="/principal-message" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600">Read full message <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
