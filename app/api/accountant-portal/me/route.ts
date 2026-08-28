import { NextResponse } from "next/server";
import { getAccountantEmailFromRequest, getBearerToken } from "@/lib/auth-request";
import { verifyAccountantPortalToken } from "@/lib/accountant-portal";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Token requis." }, { status: 401 });
  }

  const payload = verifyAccountantPortalToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Lien expiré ou invalide." }, { status: 401 });
  }

  const headerEmail = getAccountantEmailFromRequest(request);
  if (!headerEmail || headerEmail !== payload.email) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  return NextResponse.json({ email: payload.email, role: "accountant" });
}
