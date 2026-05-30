import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { createJournalEntry } from "@/lib/journal";

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const where: {
    userId: string;
    deletedAt: null;
    entryDate?: { gte?: Date; lte?: Date };
  } = { userId: workspaceOwnerId, deletedAt: null };

  if (from) where.entryDate = { ...where.entryDate, gte: new Date(from) };
  if (to) where.entryDate = { ...where.entryDate, lte: new Date(to) };

  const entries = await prisma.journalEntry.findMany({
    where,
    include: { lines: true },
    orderBy: { entryDate: "desc" },
    take: limit,
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);
  const body = await request.json().catch(() => ({}));

  const entryDate = body.entryDate ? new Date(body.entryDate) : new Date();
  const label = String(body.label ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!label) {
    return NextResponse.json({ error: "Libellé requis." }, { status: 400 });
  }
  if (lines.length < 2) {
    return NextResponse.json({ error: "Au moins 2 lignes comptables requises." }, { status: 400 });
  }

  try {
    const entry = await createJournalEntry({
      userId: workspaceOwnerId,
      journalCode: body.journalCode ?? "OD",
      journalLabel: body.journalLabel ?? "Opérations diverses",
      entryDate,
      pieceRef: body.pieceRef ?? null,
      label,
      invoiceId: body.invoiceId ?? null,
      attachmentUrl: body.attachmentUrl ?? null,
      attachmentName: body.attachmentName ?? null,
      mimeType: body.mimeType ?? null,
      lines: lines.map((l: { accountNum: string; accountLabel?: string; debit?: number; credit?: number }) => ({
        accountNum: String(l.accountNum),
        accountLabel: l.accountLabel,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      })),
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
