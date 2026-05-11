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
  const status = (searchParams.get("status") || "").trim();
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 20), 1), 100);
  const skip = (page - 1) * pageSize;
  const where = {
    deletedAt: null as null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { originalName: { contains: q, mode: "insensitive" as const } },
            { filename: { contains: q, mode: "insensitive" as const } },
            { fournisseur: { contains: q, mode: "insensitive" as const } },
            { numeroFacture: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        originalName: true,
        status: true,
        category: true,
        amount: true,
        region: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ items: invoices, page, pageSize, total });
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
  const status = typeof body.status === "string" ? body.status : undefined;
  const category = typeof body.category === "string" ? body.category : undefined;
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : undefined;

  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }
  if (status === undefined && category === undefined && amount === undefined) {
    return NextResponse.json({ error: "Aucune mise à jour demandée." }, { status: 400 });
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(amount !== undefined ? { amount } : {}),
    },
    select: {
      id: true,
      originalName: true,
      status: true,
      category: true,
      amount: true,
      region: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  await logAdminAudit({
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: "invoice.update",
    entityType: "invoice",
    entityId: id,
    details: { status, category, amount },
  });

  return NextResponse.json(invoice);
}
