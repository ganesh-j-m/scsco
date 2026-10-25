import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { AuthUser } from "@/types";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly cookie. Role always comes from the server.
  useEffect(() => {
    api<{ user: AuthUser }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // The server ended the session (expired cookie, deactivated account): drop to the login page.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("scsco:session-expired", onExpired);
    return () => window.removeEventListener("scsco:session-expired", onExpired);
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const r = await api<{ user: AuthUser; home: string }>("/auth/login", { body: { loginId, password } });
    setUser(r.user);
    return r.home;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
