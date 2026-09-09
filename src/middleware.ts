import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { routeAccessMap } from "./lib/settings";
import { NextResponse } from "next/server";

const matchers = Object.keys(routeAccessMap).map((route) => ({
  matcher: createRouteMatcher([route]),
  allowedRoles: routeAccessMap[route],
}));

console.log(matchers);

import { getRoleFromSessionClaims } from "./lib/role";

export default clerkMiddleware((auth, req) => {
  const { sessionClaims, userId } = auth();
  const role = getRoleFromSessionClaims(sessionClaims);

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
