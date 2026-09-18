import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/lib/postgres";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { ensureInvoiceWorkflowColumns } from "@/lib/invoice-workflow-schema";
import { isInvoiceExtractionDone } from "@/lib/invoice-extraction-marker";
import { ensureInvoiceShareTokens } from "@/lib/ensure-invoice-share-token";
import { sendInvoicesToCabinet } from "@/lib/cabinet-send";

export const runtime = "nodejs";
export const maxDuration = 120;

type InvoiceRow = {
  id: string;
  region: string;
  fileUrl: string | null;
  ocrText: string | null;
  montantTTC: number | null;
  amount: number | null;
  fournisseur: string | null;
  numeroFacture: string | null;
  invoiceDate: string | null;
  userConfirmedAt: string | null;
  sentAt: string | null;
};

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    await ensureInvoiceWorkflowColumns();
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : body.id
        ? [String(body.id).trim()]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "id ou ids requis." }, { status: 400 });
    }

    const autoSendToCabinet = body.autoSendToCabinet !== false;
    const senderName =
      typeof body.senderName === "string" && body.senderName.trim()
        ? body.senderName.trim()
        : "Utilisateur Compta IA";

    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $3`
      : "";
    const selParams = restrictAgentToOwnSubmissions
      ? [ids, workspaceOwnerId, actorUserId]
      : [ids, workspaceOwnerId];

    const sel = await pool.query(
      `SELECT id, region, "fileUrl", "ocrText", "montantTTC", amount, fournisseur,
              "numeroFacture", "invoiceDate", "userConfirmedAt", "sentAt"
       FROM invoices
       WHERE id = ANY($1::text[]) AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      selParams,
    );

    if (sel.rows.length === 0) {
      return NextResponse.json({ error: "Facture(s) introuvable(s)." }, { status: 404 });
    }

    const rows = sel.rows as InvoiceRow[];
    const notExtracted = rows.filter((r) => !isInvoiceExtractionDone(r));
    if (notExtracted.length > 0) {
      return NextResponse.json(
        {
          error: `${notExtracted.length} facture(s) non extraite(s). Lancez l'extraction avant confirmation.`,
          notExtractedIds: notExtracted.map((r) => r.id),
        },
        { status: 422 },
      );
    }

    const withoutFile = rows.filter((r) => !r.fileUrl);
    if (withoutFile.length > 0) {
      return NextResponse.json(
        { error: "Certaines factures n'ont pas de fichier joint." },
        { status: 422 },
      );
    }

    const confirmParams = restrictAgentToOwnSubmissions
      ? [actorUserId, ids, workspaceOwnerId, actorUserId]
      : [actorUserId, ids, workspaceOwnerId];
    const confirmClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $4`
      : "";

    const confirmed = await pool.query(
      `UPDATE invoices
       SET "userConfirmedAt" = NOW(),
           "userConfirmedByUserId" = $1,
           "updatedAt" = NOW()
       WHERE id = ANY($2::text[]) AND "userId" = $3 AND ("deletedAt" IS NULL)${confirmClause}
       RETURNING *`,
      confirmParams,
    );

    await ensureInvoiceShareTokens(
      rows.map((r) => r.id),
      workspaceOwnerId,
    );

    const sendResults: Array<{ region: string; ok: boolean; message?: string; error?: string }> =
      [];

    if (autoSendToCabinet) {
      const byRegion = new Map<string, string[]>();
      for (const row of rows) {
        if (row.sentAt) continue;
        const list = byRegion.get(row.region) ?? [];
        list.push(row.id);
        byRegion.set(row.region, list);
      }

      for (const [region, regionIds] of byRegion) {
        const result = await sendInvoicesToCabinet({
          workspaceOwnerId,
          actorUserId,
          restrictAgentToOwnSubmissions,
          region,
          invoiceIds: regionIds,
          senderName,
          message: `Transmission de ${regionIds.length} facture(s) confirmée(s) par l'entreprise.\nRégion : ${region}`,
        });
        sendResults.push({
          region,
          ok: result.success,
          message: result.message,
          error: result.error,
        });
      }
    }

    const refreshed = await pool.query(
      `SELECT * FROM invoices WHERE id = ANY($1::text[]) AND "userId" = $2`,
      [ids, workspaceOwnerId],
    );

    return NextResponse.json({
      success: true,
      confirmed: confirmed.rows.length,
      autoSendToCabinet,
      sendResults,
      invoices: refreshed.rows,
    });
  } catch (error) {
    console.error("Erreur confirmation factures:", error);
    return NextResponse.json({ error: "Erreur lors de la confirmation." }, { status: 500 });
  }
}
