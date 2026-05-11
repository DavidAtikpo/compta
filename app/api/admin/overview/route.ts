import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUserFromRequest } from "@/lib/admin";

export async function GET(request: Request) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const [
    usersCount,
    invoicesCount,
    sendHistoryCount,
    accountantsCount,
    structuresCount,
    recentUsers,
    recentInvoices,
    recentSendHistory,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.invoice.count({ where: { deletedAt: null } }),
    prisma.sendHistory.count(),
    prisma.accountant.count({ where: { deletedAt: null } }),
    prisma.structure.count({ where: { deletedAt: null } }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        email: true,
        name: true,
        billingPlan: true,
        aiCreditsBalance: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        originalName: true,
        region: true,
        status: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.sendHistory.findMany({
      orderBy: { sentAt: "desc" },
      take: 10,
      select: {
        id: true,
        recipientEmail: true,
        region: true,
        success: true,
        sentAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    admin: { id: adminUser.id, email: adminUser.email, role: adminUser.role },
    stats: {
      usersCount,
      invoicesCount,
      sendHistoryCount,
      accountantsCount,
      structuresCount,
    },
    recentUsers,
    recentInvoices,
    recentSendHistory,
  });
}
