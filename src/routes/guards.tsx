import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingState } from "@/components/ui";
import type { Role } from "@/types";

// These only decide which UI to show. The API enforces the real permissions.
export const ADMIN_PANEL_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "HOD"];

// Faculty work in the staff panel (QR attendance, assignments, forms); the portal is for students and parents.
export const STAFF_ROLES: Role[] = [...ADMIN_PANEL_ROLES, "FACULTY"];

export function homeFor(role: Role) {
  return STAFF_ROLES.includes(role) ? "/admin/dashboard" : "/portal/dashboard";
}

export function RequireRole({ roles, area }: { roles: Role[]; area: "admin" | "portal" }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState rows={3} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!roles.includes(user.role)) {
    // Right login, wrong area: send to own home; otherwise show Unauthorized
    return area === "admin" || area === "portal" ? <Navigate to="/unauthorized" replace /> : null;
  }
  return <Outlet />;
}
