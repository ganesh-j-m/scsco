export type Role = "SUPER_ADMIN" | "ADMIN" | "PRINCIPAL" | "HOD" | "FACULTY" | "STUDENT" | "PARENT" | "ALUMNI";

export interface AuthUser {
  id: string;
  loginId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface ImportReport {
  summary: { total: number; successful: number; failed: number; duplicate: number; invalid: number };
  results: { row: number; loginId: string; outcome: "created" | "duplicate" | "invalid"; reason?: string }[];
}
