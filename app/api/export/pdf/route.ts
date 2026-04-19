import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pool } from "../../../../lib/postgres";
import { prisma } from "../../../../lib/prisma";
import { MAX_PDF_INVOICES } from "../../../../lib/pdf-export";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";
import { pdfBufferFromInvoices } from "../../../../lib/pdf-invoice-export";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Connexion requise pour exporter en PDF." },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pdfHeaderText: true,
        pdfFooterText: true,
        pdfHeaderImageUrl: true,
        pdfFooterImageUrl: true,
        pdfLogoUrl: true,
        pdfHeaderTitle: true,
        pdfHeaderAddress: true,
        pdfHeaderTableJson: true,
        pdfHeaderLayout: true,
      },
    });

    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const raw = body?.ids;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'Corps JSON invalide : attendu { "ids": ["id", ...] }.' },
        { status: 400 },
      );
    }

    const cleanIds = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
    if (cleanIds.length === 0) {
      return NextResponse.json(
        { error: "Aucun identifiant : cochez au moins une facture à exporter." },
        { status: 400 },
      );
    }
    if (cleanIds.length > MAX_PDF_INVOICES) {
      return NextResponse.json(
        {
          error: `Trop de factures (${cleanIds.length}). Maximum ${MAX_PDF_INVOICES} par export : réduisez la sélection ou exportez en plusieurs fois.`,
        },
        { status: 400 },
      );
    }

    const result = await pool.query<Record<string, unknown>>(
      `
      SELECT i.*, a.email AS accountant_email
      FROM invoices i
      LEFT JOIN accountants a ON i."accountantId" = a.id
      WHERE i.id = ANY($1::text[])
        AND i.status != 'draft'
      `,
      [cleanIds],
    );

    const rowById = new Map(result.rows.map((r) => [String(r.id), r]));
    const invoices = cleanIds
      .map((id) => rowById.get(id))
      .filter((row): row is Record<string, unknown> => row != null);

    const skipped = cleanIds.length - invoices.length;
    const subtitleLines: string[] = [
      `${invoices.length} facture(s) dans le PDF`,
      ...(skipped > 0 ? [`${skipped} id(s) ignoré(s) (inconnu ou brouillon)`] : []),
    ];

    const { buffer, filename } = await pdfBufferFromInvoices(
      invoices,
      subtitleLines,
      "factures_selection",
      {
        pdfHeaderText: user?.pdfHeaderText ?? null,
        pdfFooterText: user?.pdfFooterText ?? null,
        pdfHeaderImageUrl: user?.pdfHeaderImageUrl ?? null,
        pdfFooterImageUrl: user?.pdfFooterImageUrl ?? null,
        pdfLogoUrl: user?.pdfLogoUrl ?? null,
        pdfHeaderTitle: user?.pdfHeaderTitle ?? null,
        pdfHeaderAddress: user?.pdfHeaderAddress ?? null,
        pdfHeaderTableJson: user?.pdfHeaderTableJson ?? null,
        pdfHeaderLayout: user?.pdfHeaderLayout ?? null,
      },
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Erreur export PDF:", error);
    return NextResponse.json(
      { error: "Erreur génération PDF." },
      { status: 500 },
    );
  }
}
