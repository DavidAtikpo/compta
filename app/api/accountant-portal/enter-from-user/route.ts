import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { signAccountantPortalToken, isRegisteredAccountantEmail } from "@/lib/accountant-portal";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { pool } from "@/lib/postgres";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { listCabinetsForOwner } from "@/lib/accountant-portal-invoices";

const JWT_SECRET = process.env.JWT_SECRET as string;

async function resolveUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email?.trim().toLowerCase() ?? null;
}

async function resolveEmailFromToken(token: string): Promise<string | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; email?: string };
    if (typeof payload.email === "string" && payload.email.trim()) {
      return payload.email.trim().toLowerCase();
    }
    if (typeof payload.sub === "string" && payload.sub.trim()) {
      return resolveUserEmail(payload.sub);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Connexion directe au portail pour un utilisateur Neurix déjà connecté (sans magic link email). */
export async function POST(request: Request) {
  const userId = getAuthenticatedUserId(request);
  const bearer = request.headers.get("authorization")?.slice(7) ?? "";
  const email = userId ? await resolveUserEmail(userId) : bearer ? await resolveEmailFromToken(bearer) : null;

  if (!email || !userId) {
    return NextResponse.json({ error: "Connexion utilisateur requise." }, { status: 401 });
  }

  const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
  const cabinets = await listCabinetsForOwner(workspaceOwnerId);
  const isRegistered = await isRegisteredAccountantEmail(pool, email);

  const portalMode = cabinets.length > 0 ? "owner" : "cabinet";
  const portalToken =
    portalMode === "owner"
      ? signAccountantPortalToken(email, { mode: "owner", ownerUserId: workspaceOwnerId })
      : signAccountantPortalToken(email, { mode: "cabinet" });

  return NextResponse.json({
    email,
    portalToken,
    portalMode,
    isRegisteredCabinet: isRegistered,
    cabinets,
    portalPath: "/accountant/portal",
  });
}
