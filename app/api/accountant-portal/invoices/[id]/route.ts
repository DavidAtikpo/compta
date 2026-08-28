import { NextResponse } from "next/server";
import { getAccountantEmailFromRequest } from "@/lib/auth-request";
import { invoiceAccessibleToAccountant } from "@/lib/accountant-portal-invoices";
import { pool } from "@/lib/postgres";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = getAccountantEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reviewStatus = body.reviewStatus?.toString().trim();
  const reviewNote = body.reviewNote?.toString().trim() || null;

  if (reviewStatus !== "validated" && reviewStatus !== "rejected") {
    return NextResponse.json({ error: "reviewStatus doit être validated ou rejected." }, { status: 400 });
  }

  const allowed = await invoiceAccessibleToAccountant(id, email);
  if (!allowed) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  try {
    const result = await pool.query(
      `UPDATE invoices
       SET "accountantReviewStatus" = $1,
           "accountantReviewNote" = $2,
           "accountantReviewedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE id = $3 AND "deletedAt" IS NULL
       RETURNING id, "accountantReviewStatus", "accountantReviewNote", "accountantReviewedAt"`,
      [reviewStatus, reviewNote, id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur validation comptable:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
