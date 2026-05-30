import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { journalEntryFromInvoice } from "@/lib/journal";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);
  const body = await request.json().catch(() => ({}));
  const invoiceId = String(body.invoiceId ?? "").trim();
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId requis." }, { status: 400 });
  }

  const agentClause = restrictAgentToOwnSubmissions ? ` AND "submittedByUserId" = $3` : "";
  const params = restrictAgentToOwnSubmissions
    ? [invoiceId, workspaceOwnerId, actorUserId]
    : [invoiceId, workspaceOwnerId];

  const existing = await prisma.journalEntry.findFirst({
    where: { invoiceId, userId: workspaceOwnerId, deletedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: "Écriture déjà existante pour cette facture.", entry: existing }, { status: 409 });
  }

  const result = await pool.query(
    `SELECT * FROM invoices WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
    params,
  );
  if (!result.rows.length) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const inv = result.rows[0];
  try {
    const entry = await journalEntryFromInvoice({
      id: inv.id,
      userId: workspaceOwnerId,
      category: inv.category,
      accountCode: inv.accountCode,
      fournisseur: inv.fournisseur,
      originalName: inv.originalName,
      numeroFacture: inv.numeroFacture,
      montantHT: inv.montantHT,
      montantTVA: inv.montantTVA,
      montantTTC: inv.montantTTC,
      amount: inv.amount,
      invoiceDate: inv.invoiceDate,
      createdAt: inv.createdAt,
      invoiceType: inv.invoiceType,
      fileUrl: inv.fileUrl,
      mimeType: inv.mimeType,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
