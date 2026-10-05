import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CABINET_FEATURE_DISABLED_MESSAGE, isCabinetFeatureEnabled } from "@/lib/cabinet-feature";

function isCabinetRoute(pathname: string): boolean {
  if (pathname === "/api/send-to-accountant") return true;
  if (pathname === "/api/history") return true;
  if (pathname === "/api/accountants" || pathname.startsWith("/api/accountants/")) return true;
  if (pathname.startsWith("/api/accountant-portal")) return true;
  if (pathname === "/api/admin/accountants" || pathname.startsWith("/api/admin/accountants/")) {
    return true;
  }
  if (pathname === "/admin/accountants" || pathname.startsWith("/admin/accountants/")) {
    return true;
  }
  if (pathname === "/accountant" || pathname.startsWith("/accountant/")) return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (isCabinetFeatureEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (!isCabinetRoute(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: CABINET_FEATURE_DISABLED_MESSAGE }, { status: 410 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/invoices";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/accountant",
    "/accountant/:path*",
    "/admin/accountants",
    "/admin/accountants/:path*",
    "/api/send-to-accountant",
    "/api/history",
    "/api/accountants",
    "/api/accountants/:path*",
    "/api/accountant-portal/:path*",
    "/api/admin/accountants",
    "/api/admin/accountants/:path*",
  ],
};
