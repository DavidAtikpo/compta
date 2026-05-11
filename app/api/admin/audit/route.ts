import { NextResponse } from "next/server";
import { getAdminUserFromRequest } from "@/lib/admin";
import { listAdminAudit } from "@/lib/admin-audit";

export async function GET(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("pageSize") || 20);
  const data = await listAdminAudit(page, pageSize);
  return NextResponse.json(data);
}
