import { useApi } from "@/hooks/useApi";

interface Placed {
    id: string; name: string; photoUrl?: string | null; company: string; companyLogo?: string | null;
    role: string; course?: string | null; batch?: string | null; package?: string | null;
}

function initials(n: string) { return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""); }

/** "Our Placed Students" strip for the home page. Renders nothing when there are no published entries. */
export default function PlacedStudents() {
    const { data } = useApi<{ data: Placed[] }>("/public/placed-students");
    const list = data?.data ?? [];
    if (list.length === 0) return null;

    return (
        <section aria-labelledby="placed-h" className="overflow-hidden bg-slate-50">
            <div className="bg-gradient-to-r from-brand-900 to-brand-600 px-4 pb-24 pt-10 text-center text-white">
                <h2 id="placed-h" className="text-2xl font-semibold md:text-3xl">Our Placed Students</h2>
                <p className="mt-2 text-sm text-brand-100 md:text-base">Our students selected in leading companies</p>
            </div>
            <div className="mx-auto -mt-16 max-w-7xl px-4 pb-10">
                <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
                    {list.map((s) => (
                        <li key={s.id} className="w-44 shrink-0 snap-start rounded-2xl bg-white p-2 text-center shadow-md ring-1 ring-slate-200 md:w-48">
                            <div className="aspect-square w-full overflow-hidden rounded-xl bg-brand-50">
                                {s.photoUrl
                                    ? <img src={s.photoUrl} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
                                    : <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-brand-600">{initials(s.name)}</div>}
                            </div>
                            <p className="mt-2 truncate text-sm font-semibold text-slate-800">{s.name}</p>
                            <div className="mx-auto mt-2 flex h-10 items-center justify-center">
                                {s.companyLogo && <img src={s.companyLogo} alt="" loading="lazy" className="max-h-10 max-w-[7rem] object-contain" />}
                            </div>
                            <p className="text-sm font-medium text-slate-700">{s.company}</p>
                            <p className="text-xs text-slate-500">{s.role}</p>
                            {(s.package || s.course || s.batch) && (
                                <p className="mt-2 rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600">
                                    {[s.package, s.course, s.batch].filter(Boolean).join(" · ")}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}