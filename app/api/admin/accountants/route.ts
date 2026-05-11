import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAdminDelete, getAdminUserFromRequest } from "@/lib/admin";
import { logAdminAudit } from "@/lib/admin-audit";

export async function GET(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 20), 1), 100);
  const skip = (page - 1) * pageSize;
  const where = { deletedAt: null as null };

  const [total, rows] = await Promise.all([
    prisma.accountant.count({ where }),
    prisma.accountant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        region: true,
        email: true,
        label: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ items: rows, page, pageSize, total });
}

export async function DELETE(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }
  if (!canAdminDelete(adminUser.role)) {
    return NextResponse.json({ error: "Action réservée au super admin." }, { status: 403 });
  }

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  await prisma.accountant.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAdminAudit({
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: "accountant.soft_delete",
    entityType: "accountant",
    entityId: id,
  });
  return NextResponse.json({ ok: true, id });
}
