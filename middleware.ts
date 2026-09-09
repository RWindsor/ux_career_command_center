import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Auth.js v5's `auth()` wraps the middleware function and injects the
 * session on `req.auth` — this runs on the Edge runtime, which is why
 * lib/db (Neon HTTP driver) and auth.ts avoid any Node-only APIs.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (!req.auth && isProtectedRoute) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (req.auth && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and image optimization files,
     * so the session cookie stays fresh on every navigable route.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
