import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAdminDelete, getAdminUserFromRequest } from "@/lib/admin";
import { logAdminAudit } from "@/lib/admin-audit";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }
  if (!canAdminDelete(adminUser.role)) {
    return NextResponse.json({ error: "Action réservée au super admin." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  if (id === adminUser.id) {
    return NextResponse.json({ error: "Suppression de son propre compte interdite." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAdminAudit({
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: "user.soft_delete",
    entityType: "user",
    entityId: id,
  });
  return NextResponse.json({ ok: true, id });
}
