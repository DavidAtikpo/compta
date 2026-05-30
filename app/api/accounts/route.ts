import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { ensurePcgSeeded } from "@/lib/pcg";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  await ensurePcgSeeded();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const pcgClass = searchParams.get("class");

  const where: {
    OR?: Array<{ num?: { contains: string }; label?: { contains: string; mode: "insensitive" } }>;
    pcgClass?: number;
  } = {};

  if (q) {
    where.OR = [
      { num: { contains: q.replace(/\D/g, "") } },
      { label: { contains: q, mode: "insensitive" } },
    ];
  }
  if (pcgClass) {
    const n = Number.parseInt(pcgClass, 10);
    if (Number.isFinite(n)) where.pcgClass = n;
  }

  const accounts = await prisma.chartAccount.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: [{ pcgClass: "asc" }, { num: "asc" }],
    take: q ? 50 : 500,
  });

  return NextResponse.json({ accounts, total: accounts.length });
}
