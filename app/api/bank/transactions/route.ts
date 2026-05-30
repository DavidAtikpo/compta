import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
  const { searchParams } = new URL(request.url);
  const unmatchedOnly = searchParams.get("unmatched") === "1";
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      userId: workspaceOwnerId,
      ...(unmatchedOnly ? { matchedInvoiceId: null } : {}),
    },
    orderBy: { transactionDate: "desc" },
    take: limit,
    include: { bankAccount: true, importBatch: true },
  });

  return NextResponse.json(transactions);
}
