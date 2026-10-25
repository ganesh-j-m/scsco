import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ImageOff } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui";

export function LazyImage({ src, alt, className = "", ratio = "aspect-[16/10]" }: { src?: string | null; alt: string; className?: string; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-500 ${ratio} ${className}`} role="img" aria-label={alt}>
        <ImageOff className="h-6 w-6" aria-hidden />
      </div>
    );
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={`h-full w-full object-cover ${ratio} ${className}`} />;
}

export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="border-b border-slate-200 bg-brand-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-brand-100">{subtitle}</p>}
      </div>
    </section>
  );
}

export function Section({ title, action, children, tone = "white" }: { title?: string; action?: { to: string; label: string }; children: ReactNode; tone?: "white" | "slate" }) {
  return (
    <section className={tone === "slate" ? "bg-slate-50" : "bg-white"}>
      <div className="mx-auto max-w-7xl px-4 py-10">
        {(title || action) && (
          <div className="mb-6 flex items-end justify-between gap-3">
            {title && <h2 className="text-xl font-semibold text-slate-900">{title}</h2>}
            {action && <Link to={action.to} className="text-sm font-medium text-brand-600 hover:underline">{action.label}</Link>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export const Reveal = ({ children, delay = 0 }: { children: ReactNode; delay?: number }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.3, delay }}>
    {children}
  </motion.div>
);

export function CardGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid grid-cols-1 gap-5 ${c}`}>{children}</div>;
}

export function ImageCard({ image, title, text, meta, badge }: { image?: string | null; title: string; text?: string | null; meta?: string; badge?: string }) {
  return (
    <article className="card overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <div className="relative">
        <LazyImage src={image} alt={title} />
        {badge && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-medium text-brand-700">{badge}</span>}
      </div>
      <div className="p-4">
        {meta && <p className="mb-1 text-xs text-slate-500">{meta}</p>}
        <h3 className="font-medium text-slate-900">{title}</h3>
        {text && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{text}</p>}
      </div>
    </article>
  );
}

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return (
    <CardGrid>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card overflow-hidden" aria-hidden>
          <div className="skeleton aspect-[16/10]" />
          <div className="space-y-2 p-4"><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-3 w-full rounded" /></div>
        </div>
      ))}
    </CardGrid>
  );
}

/** Standard loading / error / empty handling for any list-style public section. */
export function DataState({ loading, error, empty, onRetry, emptyTitle, children, skeletons }: {
  loading: boolean; error: string | null; empty: boolean; onRetry: () => void; emptyTitle: string; children: ReactNode; skeletons?: ReactNode;
}) {
  if (loading) return <>{skeletons ?? <CardSkeletons />}</>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} hint="Content will appear here once it is published." />;
  return <>{children}</>;
}

export const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
