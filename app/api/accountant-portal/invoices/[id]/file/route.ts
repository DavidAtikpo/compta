import { NextResponse } from "next/server";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import { invoiceAccessibleInPortal } from "@/lib/accountant-portal-invoices";
import { pool } from "@/lib/postgres";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  const { id } = await params;
  const accessCtx =
    ctx.mode === "owner" && ctx.ownerUserId
      ? ({ mode: "owner" as const, ownerUserId: ctx.ownerUserId })
      : ({ mode: "cabinet" as const, email: ctx.email });

  if (!(await invoiceAccessibleInPortal(id, accessCtx))) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const result = await pool.query(
    `SELECT "shareToken", "fileUrl" FROM invoices WHERE id = $1 AND "deletedAt" IS NULL`,
    [id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const row = result.rows[0] as { shareToken: string | null; fileUrl: string | null };
  const origin = new URL(request.url).origin;

  if (row.shareToken) {
    return NextResponse.redirect(`${origin}/api/share/${row.shareToken}/file`, 302);
  }
  if (row.fileUrl) {
    return NextResponse.redirect(row.fileUrl, 302);
  }

  return NextResponse.json({ error: "Aucun fichier associé." }, { status: 404 });
}
