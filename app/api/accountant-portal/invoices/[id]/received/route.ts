import { NextResponse } from "next/server";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import { invoiceAccessibleInPortal } from "@/lib/accountant-portal-invoices";
import { pool } from "@/lib/postgres";
import { ensureInvoiceWorkflowColumns } from "@/lib/invoice-workflow-schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }
  if (ctx.mode === "owner") {
    return NextResponse.json(
      { error: "La confirmation de réception est réservée au cabinet destinataire." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const allowed = await invoiceAccessibleInPortal(id, { mode: "cabinet", email: ctx.email });
  if (!allowed) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  try {
    await ensureInvoiceWorkflowColumns();
    const result = await pool.query(
      `UPDATE invoices
       SET "accountantReceivedAt" = NOW(),
           "accountantReceivedByEmail" = $1,
           "updatedAt" = NOW()
       WHERE id = $2 AND "deletedAt" IS NULL
       RETURNING id, "accountantReceivedAt", "accountantReceivedByEmail"`,
      [ctx.email, id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result.rows[0] });
  } catch (error) {
    console.error("Erreur confirmation réception cabinet:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
