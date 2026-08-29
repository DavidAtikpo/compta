import { NextResponse } from "next/server";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import { listCabinetsForOwner } from "@/lib/accountant-portal-invoices";

export async function GET(request: Request) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Lien expiré ou invalide." }, { status: 401 });
  }

  const mode = ctx.mode === "owner" && ctx.ownerUserId ? "owner" : "cabinet";
  const cabinets =
    mode === "owner" && ctx.ownerUserId ? await listCabinetsForOwner(ctx.ownerUserId) : [];

  return NextResponse.json({
    email: ctx.email,
    role: "accountant",
    mode,
    cabinets,
  });
}
