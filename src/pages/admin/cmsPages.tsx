import { ContentManager } from "@/components/ContentManager";
import { fmtDate } from "@/components/portal";

const s = (v: unknown) => (typeof v === "string" ? v : "");
const thumb = (url: unknown, alt: string) => (s(url) ? <img src={s(url)} alt={alt} loading="lazy" decoding="async" className="h-10 w-14 rounded object-cover" /> : <span className="text-slate-500">—</span>);

export function Notices() {
  return <ContentManager title="Notices" subtitle="Announcements shown on the public Notices page" noun="notice" endpoint="/cms/notices" searchHint="Search notices"
    fields={[
      { key: "title", label: "Title", type: "text", required: true, max: 200 },
      { key: "body", label: "Notice text", type: "textarea", required: true, max: 10000 },
      { key: "attachmentUrl", label: "Attachment link (optional)", type: "url", placeholder: "https://..." },
    ]}
    columns={(r) => [{ header: "Notice", cell: <p className="font-medium">{s(r.title)}</p> }, { header: "Published", cell: fmtDate(s(r.publishedAt) || null) }]} />;
}

export function Events() {
  return <ContentManager title="Events" subtitle="Upcoming and past events on the website" noun="event" endpoint="/cms/events" searchHint="Search title or venue"
    fields={[
      { key: "title", label: "Title", type: "text", required: true, max: 200 },
      { key: "date", label: "Date", type: "date", required: true, half: true },
      { key: "venue", label: "Venue", type: "text", max: 200, half: true },
      { key: "description", label: "Description", type: "textarea", max: 3000 },
      { key: "imageUrl", label: "Image", type: "image" },
    ]}
    columns={(r) => [{ header: "Event", cell: <><p className="font-medium">{s(r.title)}</p><p className="text-xs text-slate-500">{s(r.venue)}</p></> }, { header: "Date", cell: fmtDate(s(r.date) || null) }]} />;
}

export function Gallery() {
  return <ContentManager title="Gallery" subtitle="Photos shown on the public Gallery page" noun="photo" endpoint="/cms/gallery" searchHint="Search title or category"
    fields={[
      { key: "title", label: "Title", type: "text", required: true, max: 150, half: true },
      { key: "category", label: "Category", type: "text", max: 60, half: true, placeholder: "Annual Day" },
      { key: "imageUrl", label: "Image", type: "image", required: true },
    ]}
    columns={(r) => [{ header: "Photo", cell: thumb(r.imageUrl, s(r.title)) }, { header: "Title", cell: <><p className="font-medium">{s(r.title)}</p><p className="text-xs text-slate-500">{s(r.category)}</p></> }]} />;
}

export function Facilities() {
  return <ContentManager title="Facilities" subtitle="Campus facilities shown on the website" noun="facility" endpoint="/cms/facilities" searchHint="Search facilities"
    fields={[
      { key: "name", label: "Name", type: "text", required: true, max: 150 },
      { key: "description", label: "Description", type: "textarea", max: 2000 },
      { key: "imageUrl", label: "Image", type: "image" },
    ]}
    columns={(r) => [{ header: "Image", cell: thumb(r.imageUrl, s(r.name)) }, { header: "Facility", cell: <><p className="font-medium">{s(r.name)}</p><p className="line-clamp-1 text-xs text-slate-500">{s(r.description)}</p></> }]} />;
}

export function Achievements() {
  return <ContentManager title="Achievements" subtitle="Awards and milestones shown on the website" noun="achievement" endpoint="/cms/achievements" searchHint="Search achievements"
    fields={[
      { key: "title", label: "Title", type: "text", required: true, max: 200, half: true },
      { key: "date", label: "Date", type: "date", half: true },
      { key: "description", label: "Description", type: "textarea", max: 2000 },
      { key: "imageUrl", label: "Image", type: "image" },
    ]}
    columns={(r) => [{ header: "Achievement", cell: <p className="font-medium">{s(r.title)}</p> }, { header: "Date", cell: fmtDate(s(r.date) || null) }]} />;
}
