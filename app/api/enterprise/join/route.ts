import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  const userId = token ? getUserIdFromJwt(token) : null;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { inviteToken } = body as { inviteToken?: string };

  if (!inviteToken) return NextResponse.json({ error: "Token requis" }, { status: 400 });

  const member = await prisma.enterpriseMember.findUnique({
    where: { inviteToken },
    include: { enterprise: { select: { id: true, name: true } } },
  });

  if (!member) return NextResponse.json({ error: "Invitation invalide ou expirée" }, { status: 404 });
  if (member.status === "removed") return NextResponse.json({ error: "Cette invitation a été révoquée" }, { status: 403 });
  if (member.status === "active") return NextResponse.json({ enterprise: member.enterprise, alreadyMember: true });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });

  if (member.email !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Cette invitation ne vous est pas destinée" }, { status: 403 });
  }

  const updated = await prisma.enterpriseMember.update({
    where: { id: member.id },
    data: {
      userId,
      status: "active",
      inviteToken: null,
      joinedAt: new Date(),
    },
    include: { enterprise: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ enterprise: updated.enterprise, joined: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inviteToken = searchParams.get("token");

  if (!inviteToken) return NextResponse.json({ error: "Token requis" }, { status: 400 });

  const member = await prisma.enterpriseMember.findUnique({
    where: { inviteToken },
    include: { enterprise: { select: { id: true, name: true } } },
  });

  if (!member || member.status === "removed") {
    return NextResponse.json({ error: "Invitation invalide ou expirée" }, { status: 404 });
  }

  return NextResponse.json({
    email: member.email,
    enterprise: member.enterprise,
    role: member.role,
    status: member.status,
  });
}
