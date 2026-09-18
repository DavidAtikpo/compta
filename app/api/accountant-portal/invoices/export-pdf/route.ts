import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/postgres";
import { prisma } from "@/lib/prisma";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import { invoiceAccessibleInPortal } from "@/lib/accountant-portal-invoices";
import { MAX_PDF_INVOICES, resolvePdfEnterpriseName } from "@/lib/pdf-export";
import { pdfBufferFromInvoices, type UserPdfBranding } from "@/lib/pdf-invoice-export";

export const runtime = "nodejs";

const EMPTY_BRANDING: UserPdfBranding = {
  pdfHeaderText: null,
  pdfFooterText: null,
  pdfHeaderImageUrl: null,
  pdfFooterImageUrl: null,
  pdfLogoUrl: null,
  pdfHeaderTitle: null,
  pdfHeaderAddress: null,
  pdfHeaderTableJson: null,
  pdfHeaderLayout: null,
};

export async function POST(request: NextRequest) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  try {
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
        { error: "Sélectionnez au moins une facture à exporter." },
        { status: 400 },
      );
    }
    if (cleanIds.length > MAX_PDF_INVOICES) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_PDF_INVOICES} factures par export PDF (${cleanIds.length} sélectionnées).`,
        },
        { status: 400 },
      );
    }

    const accessCtx =
      ctx.mode === "owner" && ctx.ownerUserId
        ? ({ mode: "owner" as const, ownerUserId: ctx.ownerUserId })
        : ({ mode: "cabinet" as const, email: ctx.email });

    const allowedIds: string[] = [];
    for (const id of cleanIds) {
      if (await invoiceAccessibleInPortal(id, accessCtx)) allowedIds.push(id);
    }

    if (allowedIds.length === 0) {
      return NextResponse.json(
        { error: "Aucune facture accessible dans la sélection." },
        { status: 403 },
      );
    }

    const result = await pool.query<Record<string, unknown>>(
      `SELECT i.*, a.email AS accountant_email
       FROM invoices i
       LEFT JOIN accountants a ON i."accountantId" = a.id
       WHERE i.id = ANY($1::text[])
         AND i.status != 'draft'
         AND (i."deletedAt" IS NULL)`,
      [allowedIds],
    );

    const rowById = new Map(result.rows.map((r) => [String(r.id), r]));
    const invoices = allowedIds
      .map((id) => rowById.get(id))
      .filter((row): row is Record<string, unknown> => row != null);

    const ownerIds = new Set(
      invoices.map((r) => String(r.userId ?? "")).filter(Boolean),
    );
    const singleOwner = ownerIds.size === 1 ? [...ownerIds][0]! : null;

    let branding: UserPdfBranding = { ...EMPTY_BRANDING };

    if (ctx.mode === "owner" && ctx.ownerUserId) {
      const user = await prisma.user.findUnique({
        where: { id: ctx.ownerUserId },
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
      if (user) {
        branding = {
          pdfHeaderText: user.pdfHeaderText,
          pdfFooterText: user.pdfFooterText,
          pdfHeaderImageUrl: user.pdfHeaderImageUrl,
          pdfFooterImageUrl: user.pdfFooterImageUrl,
          pdfLogoUrl: user.pdfLogoUrl,
          pdfHeaderTitle: user.pdfHeaderTitle,
          pdfHeaderAddress: user.pdfHeaderAddress,
          pdfHeaderTableJson: user.pdfHeaderTableJson,
          pdfHeaderLayout: user.pdfHeaderLayout,
        };
      }
    } else if (singleOwner) {
      const user = await prisma.user.findUnique({
        where: { id: singleOwner },
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
      if (user) {
        branding = {
          pdfHeaderText: user.pdfHeaderText,
          pdfFooterText: user.pdfFooterText,
          pdfHeaderImageUrl: user.pdfHeaderImageUrl,
          pdfFooterImageUrl: user.pdfFooterImageUrl,
          pdfLogoUrl: user.pdfLogoUrl,
          pdfHeaderTitle: user.pdfHeaderTitle,
          pdfHeaderAddress: user.pdfHeaderAddress,
          pdfHeaderTableJson: user.pdfHeaderTableJson,
          pdfHeaderLayout: user.pdfHeaderLayout,
        };
      }
    } else {
      branding = {
        ...EMPTY_BRANDING,
        pdfHeaderTitle: "Portail comptable — Compta IA",
        pdfFooterText: `Export cabinet ${ctx.email} · ${new Date().toLocaleDateString("fr-FR")}`,
      };
    }

    const ownerForEnterprise = singleOwner ?? (ctx.mode === "owner" ? ctx.ownerUserId : null);
    const enterpriseName = ownerForEnterprise
      ? await resolvePdfEnterpriseName(ownerForEnterprise)
      : null;

    const { buffer, filename } = await pdfBufferFromInvoices(
      invoices,
      "portail_comptable",
      branding,
      { enterpriseName },
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Erreur export PDF portail:", error);
    return NextResponse.json({ error: "Erreur génération PDF." }, { status: 500 });
  }
}
