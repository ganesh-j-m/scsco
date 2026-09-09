export type AppRole = "admin" | "teacher" | "student" | "parent";

export const getRoleFromSessionClaims = (
  sessionClaims?: unknown | null
): AppRole | undefined => {
  const claims = (sessionClaims ?? {}) as {
    publicMetadata?: { role?: unknown };
    metadata?: { role?: unknown };
    public_metadata?: { role?: unknown };
    [key: string]: unknown;
  };

  const rawRole =
    claims.publicMetadata?.role ??
    claims.metadata?.role ??
    claims.public_metadata?.role;

  return typeof rawRole === "string" ? (rawRole as AppRole) : undefined;
};
