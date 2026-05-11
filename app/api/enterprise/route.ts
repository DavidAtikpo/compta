import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";
import { isEntreprisePlan } from "@/lib/plans";

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const member = await prisma.enterpriseMember.findFirst({
    where: { userId, status: "active" },
    include: { enterprise: { include: { owner: { select: { id: true, name: true, email: true, billingPlan: true } } } } },
  });

  const owned = await prisma.enterprise.findFirst({
    where: { ownerId: userId },
    include: { owner: { select: { id: true, name: true, email: true, billingPlan: true } } },
  });

  if (owned) {
    const memberCount = await prisma.enterpriseMember.count({
      where: { enterpriseId: owned.id, status: "active" },
    });
    return NextResponse.json({
      enterprise: owned,
      role: "owner" as const,
      memberCount,
      ownerBillingPlan: owned.owner.billingPlan,
    });
  }

  if (member) {
    const memberCount = await prisma.enterpriseMember.count({
      where: { enterpriseId: member.enterpriseId, status: "active" },
    });
    return NextResponse.json({
      enterprise: member.enterprise,
      role: member.role,
      memberCount,
      ownerBillingPlan: member.enterprise.owner.billingPlan,
    });
  }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  return NextResponse.json({
    enterprise: null,
    role: null,
    memberCount: 0,
    ownerBillingPlan: me?.billingPlan ?? "starter",
  });
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  if (!isEntreprisePlan(me?.billingPlan)) {
    return NextResponse.json({ error: "Le plan Entreprise est requis." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, siret } = body as { name?: string; siret?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Le nom de l'entreprise est requis" }, { status: 400 });
  }

  const existing = await prisma.enterprise.findFirst({ where: { ownerId: userId } });
  if (existing) {
    return NextResponse.json({ error: "Vous avez déjà une entreprise" }, { status: 409 });
  }

  const enterprise = await prisma.enterprise.create({
    data: { name: name.trim(), siret: siret?.trim() || null, ownerId: userId },
    include: { owner: { select: { id: true, name: true, email: true, billingPlan: true } } },
  });

  return NextResponse.json(
    { enterprise, role: "owner" as const, ownerBillingPlan: enterprise.owner.billingPlan },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } });
  if (!isEntreprisePlan(me?.billingPlan)) {
    return NextResponse.json({ error: "Le plan Entreprise est requis." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, siret } = body as { name?: string; siret?: string };

  const enterprise = await prisma.enterprise.findFirst({ where: { ownerId: userId } });
  if (!enterprise) return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });

  const updated = await prisma.enterprise.update({
    where: { id: enterprise.id },
    data: {
      name: name?.trim() || enterprise.name,
      siret: siret !== undefined ? siret?.trim() || null : enterprise.siret,
    },
    include: { owner: { select: { id: true, name: true, email: true, billingPlan: true } } },
  });

  return NextResponse.json({ enterprise: updated, ownerBillingPlan: updated.owner.billingPlan });
}
