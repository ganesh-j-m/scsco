import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface Option { id: string; name?: string; code?: string; departmentId?: string; user?: { name: string; loginId: string } }

/** Loads dropdown data from /api/lookups/<name>. */
export function useLookup(name: "departments" | "courses" | "parents" | "faculty") {
  const [data, setData] = useState<Option[]>([]);
  useEffect(() => {
    let alive = true;
    api<{ data: Option[] }>(`/lookups/${name}`).then((r) => alive && setData(r.data)).catch(() => alive && setData([]));
    return () => { alive = false; };
  }, [name]);
  return data;
}
