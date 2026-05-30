import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { createJournalEntry } from "@/lib/journal";

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);
  const body = await request.json().catch(() => ({}));
  const transactionId = String(body.transactionId ?? "").trim();
  const invoiceId = body.invoiceId ? String(body.invoiceId) : null;
  const createJournal = body.createJournal !== false;

  if (!transactionId) {
    return NextResponse.json({ error: "transactionId requis." }, { status: 400 });
  }

  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, userId: workspaceOwnerId },
  });
  if (!tx) {
    return NextResponse.json({ error: "Transaction introuvable." }, { status: 404 });
  }

  if (invoiceId) {
    const agentClause = restrictAgentToOwnSubmissions ? ` AND "submittedByUserId" = $3` : "";
    const params = restrictAgentToOwnSubmissions
      ? [invoiceId, workspaceOwnerId, actorUserId]
      : [invoiceId, workspaceOwnerId];
    const invRes = await pool.query(
      `SELECT id FROM invoices WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      params,
    );
    if (!invRes.rows.length) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { matchedInvoiceId: invoiceId },
  });

  let journalEntry = null;
  if (createJournal) {
    const absAmount = Math.abs(tx.amount);
    const isCredit = tx.amount > 0;
    journalEntry = await createJournalEntry({
      userId: workspaceOwnerId,
      journalCode: "BQ",
      journalLabel: "Banque",
      entryDate: tx.transactionDate,
      pieceRef: tx.reference ?? tx.id.slice(0, 8),
      label: tx.label,
      bankTransactionId: tx.id,
      invoiceId: invoiceId ?? undefined,
      lines: isCredit
        ? [
            { accountNum: "512000", accountLabel: "Banque", debit: absAmount, credit: 0 },
            { accountNum: "411000", accountLabel: "Clients", debit: 0, credit: absAmount },
          ]
        : [
            { accountNum: "401000", accountLabel: "Fournisseurs", debit: absAmount, credit: 0 },
            { accountNum: "512000", accountLabel: "Banque", debit: 0, credit: absAmount },
          ],
    });
  }

  return NextResponse.json({ transaction: updated, journalEntry });
}
