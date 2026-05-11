import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";
import { isEntreprisePlan } from "@/lib/plans";
import { absoluteAppUrl } from "@/lib/public-app-url";
import crypto from "crypto";

async function getEnterpriseForOwner(userId: string) {
  return prisma.enterprise.findFirst({ where: { ownerId: userId } });
}

async function requireOwnedEnterprise(userId: string) {
  const enterprise = await getEnterpriseForOwner(userId);
  if (enterprise) return enterprise;
  const asAgent = await prisma.enterpriseMember.findFirst({ where: { userId, status: "active" } });
  if (asAgent) {
    throw Object.assign(new Error("FORBIDDEN_AGENT"), { status: 403 as const });
  }
  throw Object.assign(new Error("NOT_FOUND"), { status: 404 as const });
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let enterprise;
  try {
    enterprise = await requireOwnedEnterprise(userId);
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st === 403) return NextResponse.json({ error: "Accès réservé au dirigeant." }, { status: 403 });
    return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });
  }

  const ownerPlan = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  if (!isEntreprisePlan(ownerPlan?.billingPlan)) {
    return NextResponse.json({ error: "Plan Entreprise requis." }, { status: 403 });
  }

  const members = await prisma.enterpriseMember.findMany({
    where: { enterpriseId: enterprise.id, status: { not: "removed" } },
    include: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let enterprise;
  try {
    enterprise = await requireOwnedEnterprise(userId);
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st === 403) return NextResponse.json({ error: "Accès réservé au dirigeant." }, { status: 403 });
    return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });
  }

  const ownerPlan = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  if (!isEntreprisePlan(ownerPlan?.billingPlan)) {
    return NextResponse.json({ error: "Plan Entreprise requis." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, role } = body as { email?: string; role?: string };

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const validRole = ["manager", "agent"].includes(role ?? "") ? role! : "agent";

  const existing = await prisma.enterpriseMember.findUnique({
    where: { enterpriseId_email: { enterpriseId: enterprise.id, email: normalizedEmail } },
  });

  if (existing && existing.status !== "removed") {
    return NextResponse.json({ error: "Cet agent est déjà invité ou actif" }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  let member;
  if (existing?.status === "removed") {
    member = await prisma.enterpriseMember.update({
      where: { id: existing.id },
      data: {
        role: validRole,
        status: "pending",
        inviteToken,
        userId: existingUser?.id ?? null,
        joinedAt: null,
      },
      include: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    });
  } else {
    member = await prisma.enterpriseMember.create({
      data: {
        enterpriseId: enterprise.id,
        email: normalizedEmail,
        role: validRole,
        status: "pending",
        inviteToken,
        userId: existingUser?.id ?? null,
      },
      include: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    });
  }

  const inviteUrl = absoluteAppUrl(`/enterprise/join/${inviteToken}`);

  return NextResponse.json({ member, inviteUrl }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let enterprise;
  try {
    enterprise = await requireOwnedEnterprise(userId);
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st === 403) return NextResponse.json({ error: "Accès réservé au dirigeant." }, { status: 403 });
    return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });
  }

  const ownerPlan = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  if (!isEntreprisePlan(ownerPlan?.billingPlan)) {
    return NextResponse.json({ error: "Plan Entreprise requis." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId requis" }, { status: 400 });

  const member = await prisma.enterpriseMember.findFirst({
    where: { id: memberId, enterpriseId: enterprise.id },
  });
  if (!member) return NextResponse.json({ error: "Membre non trouvé" }, { status: 404 });

  await prisma.enterpriseMember.update({
    where: { id: memberId },
    data: { status: "removed" },
  });

  return NextResponse.json({ ok: true });
}
