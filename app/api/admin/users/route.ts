import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAdminWrite, getAdminUserFromRequest } from "@/lib/admin";
import { logAdminAudit } from "@/lib/admin-audit";

export async function GET(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 20), 1), 100);
  const skip = (page - 1) * pageSize;
  const where = {
    deletedAt: null as null,
    ...(q
      ? {
          OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        billingPlan: true,
        aiCreditsBalance: true,
        createdAt: true,
        _count: {
          select: { invoices: true, sendHistory: true, accountants: true, structures: true },
        },
      },
    }),
  ]);

  return NextResponse.json({ items: users, page, pageSize, total });
}

export async function PATCH(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }
  if (!canAdminWrite(adminUser.role)) {
    return NextResponse.json({ error: "Rôle admin en lecture seule." }, { status: 403 });
  }

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const billingPlan = typeof body.billingPlan === "string" ? body.billingPlan.trim() : undefined;
  const aiCreditsBalance =
    typeof body.aiCreditsBalance === "number" && Number.isFinite(body.aiCreditsBalance)
      ? Math.max(0, Math.floor(body.aiCreditsBalance))
      : undefined;

  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }
  if (billingPlan === undefined && aiCreditsBalance === undefined) {
    return NextResponse.json({ error: "Aucune mise à jour demandée." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(billingPlan !== undefined ? { billingPlan } : {}),
      ...(aiCreditsBalance !== undefined ? { aiCreditsBalance } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      billingPlan: true,
      aiCreditsBalance: true,
      createdAt: true,
    },
  });

  await logAdminAudit({
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: "user.update",
    entityType: "user",
    entityId: id,
    details: { billingPlan, aiCreditsBalance },
  });

  return NextResponse.json(user);
}
