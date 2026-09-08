import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { routeAccessMap } from "./lib/settings";
import { NextResponse } from "next/server";

const matchers = Object.keys(routeAccessMap).map((route) => ({
  matcher: createRouteMatcher([route]),
  allowedRoles: routeAccessMap[route],
}));

console.log(matchers);

export default clerkMiddleware((auth, req) => {
  const { sessionClaims, userId } = auth();

  const claims = sessionClaims as
    | {
        metadata?: { role?: string };
        public_metadata?: { role?: string };
      }
    | null
    | undefined;
  const role = claims?.public_metadata?.role ?? claims?.metadata?.role;

  for (const { matcher, allowedRoles } of matchers) {
    if (matcher(req)) {
      if (!userId) {
        return NextResponse.redirect(new URL("/sign-in", req.url));
      }

      if (role && !allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL(`/${role}`, req.url));
      }
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
