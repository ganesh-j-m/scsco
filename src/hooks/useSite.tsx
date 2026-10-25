import { useApi } from "./useApi";

export interface SiteContent {
  "site.hero"?: { title?: string; subtitle?: string; imageUrl?: string; ctaLabel?: string };
  "site.contact"?: { address?: string; phone?: string; email?: string; hours?: string; mapUrl?: string };
  "site.about"?: { summary?: string; mission?: string; vision?: string; imageUrl?: string; highlights?: string[] };
  "site.principal"?: { name?: string; designation?: string; photoUrl?: string; message?: string };
  "site.admissions"?: { intro?: string; steps?: string[]; documents?: string[] };
  "site.campus"?: { intro?: string; activities?: { title: string; imageUrl?: string }[] };
}

export function useSite() {
  const { data, loading, error, reload } = useApi<{ content: SiteContent }>("/public/site");
  return { site: data?.content ?? {}, loading, error, reload };
}
