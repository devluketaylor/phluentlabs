import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isAuthRoute = pathname.startsWith("/admin/auth");

    const session = await auth.api.getSession({ headers: request.headers });

    if (!isAuthRoute && !session) {
        return NextResponse.redirect(new URL("/admin/auth/login", request.url));
    }

    if (isAuthRoute && session) {
        return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/admin/:path*"],
};
