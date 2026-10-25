export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let json: { error?: string; details?: { path: string; message: string }[] } = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* proxy/HTML error page */ }
  if (!res.ok && !json.error && res.status >= 500) json.error = "The server is not responding. Please try again shortly.";
  // A 401 on anything except the login/session-check calls means the session ended: tell the app once.
  if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("scsco:session-expired"));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "Request failed", json.details);
  return json as unknown as T;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
