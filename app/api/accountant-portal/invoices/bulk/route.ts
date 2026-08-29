import { NextResponse } from "next/server";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import { invoiceAccessibleInPortal } from "@/lib/accountant-portal-invoices";
import { pool } from "@/lib/postgres";

export async function POST(request: Request) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  if (ctx.mode === "owner") {
    return NextResponse.json(
      { error: "La validation des factures est réservée au cabinet destinataire." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const reviewStatus = body.reviewStatus?.toString().trim();
  const reviewNote = body.reviewNote?.toString().trim() || null;

  if (ids.length === 0) {
    return NextResponse.json({ error: "Aucune facture sélectionnée." }, { status: 400 });
  }
  if (reviewStatus !== "validated" && reviewStatus !== "rejected") {
    return NextResponse.json({ error: "reviewStatus invalide." }, { status: 400 });
  }

  const allowed: string[] = [];
  for (const id of ids) {
    if (await invoiceAccessibleInPortal(id, { mode: "cabinet", email: ctx.email })) allowed.push(id);
  }
  if (allowed.length === 0) {
    return NextResponse.json({ error: "Aucune facture accessible." }, { status: 404 });
  }

  try {
    await pool.query(
      `UPDATE invoices
       SET "accountantReviewStatus" = $1,
           "accountantReviewNote" = $2,
           "accountantReviewedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE id = ANY($3::text[]) AND "deletedAt" IS NULL`,
      [reviewStatus, reviewNote, allowed],
    );
    return NextResponse.json({ updated: allowed.length, ids: allowed });
  } catch (error) {
    console.error("Bulk review comptable:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
