import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pool } from "../../../../lib/postgres";
import { MAX_PDF_INVOICES } from "../../../../lib/pdf-export";

export const runtime = "nodejs";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const LINE_H = 11;
const FONT_SIZE = 8;

function formatDisplayDate(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
}

function safePdfText(s: string, maxLen: number): string {
  const t = String(s ?? "")
    .replace(/\r|\n|\t/g, " ")
    .trim();
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

async function pdfBufferFromInvoices(
  invoices: Record<string, unknown>[],
  subtitleLines: string[],
  filenameBase: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const title = "Export factures (sélection)";
  page.drawText(title, {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 22;

  const sub = subtitleLines.filter(Boolean).join(" · ");
  page.drawText(safePdfText(sub, 130), {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= LINE_H * 2;

  const col = { d: MARGIN, n: 86, f: 124, r: 228, c: 348, t: 468 };
  const headerY = y;
  page.drawText("Date", { x: col.d, y: headerY, size: FONT_SIZE, font: fontBold });
  page.drawText("N°", { x: col.n, y: headerY, size: FONT_SIZE, font: fontBold });
  page.drawText("Fournisseur", { x: col.f, y: headerY, size: FONT_SIZE, font: fontBold });
  page.drawText("Référence", { x: col.r, y: headerY, size: FONT_SIZE, font: fontBold });
  page.drawText("Catégorie", { x: col.c, y: headerY, size: FONT_SIZE, font: fontBold });
  page.drawText("TTC", { x: col.t, y: headerY, size: FONT_SIZE, font: fontBold });
  y -= LINE_H * 1.5;
  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: PAGE_W - MARGIN, y: y + 4 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= LINE_H;

  const ensureSpace = () => {
    if (y < MARGIN + 40) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  let sumTtc = 0;

  for (const inv of invoices) {
    ensureSpace();
    const invoiceDate = (inv.invoiceDate ?? inv.createdAt) as string | Date | null;
    const d = formatDisplayDate(invoiceDate);
    const num = safePdfText(String(inv.numeroFacture ?? "—"), 12);
    const four = safePdfText(String(inv.fournisseur ?? inv.originalName ?? "—"), 16);
    const refName = String(inv.originalName ?? "—");
    const refEmail = String(inv.accountant_email ?? "").trim();
    const ref = safePdfText(
      refEmail ? `${refName} · ${refEmail}` : refName,
      28,
    );
    const cat = safePdfText(String(inv.category ?? "—"), 16);
    const montantTTC = (inv.montantTTC ?? inv.amount ?? 0) as number;
    const ttc =
      typeof montantTTC === "number" && !Number.isNaN(montantTTC)
        ? montantTTC.toFixed(2)
        : "—";
    if (typeof montantTTC === "number" && !Number.isNaN(montantTTC)) {
      sumTtc += montantTTC;
    }

    page.drawText(safePdfText(d, 14), { x: col.d, y, size: FONT_SIZE, font });
    page.drawText(num, { x: col.n, y, size: FONT_SIZE, font });
    page.drawText(four, { x: col.f, y, size: FONT_SIZE, font });
    page.drawText(ref, { x: col.r, y, size: FONT_SIZE, font });
    page.drawText(cat, { x: col.c, y, size: FONT_SIZE, font });
    page.drawText(ttc, { x: col.t, y, size: FONT_SIZE, font });
    y -= LINE_H;
  }

  ensureSpace();
  y -= LINE_H;
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_W - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= LINE_H;
  page.drawText(`Total TTC : ${sumTtc.toFixed(2)} €`, {
    x: col.t - 20,
    y,
    size: FONT_SIZE,
    font: fontBold,
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { buffer: Buffer.from(pdfBytes), filename };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const raw = body?.ids;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Corps JSON invalide : attendu { \"ids\": [\"id\", ...] }." },
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
      ...(skipped > 0
        ? [`${skipped} id(s) ignoré(s) (inconnu ou brouillon)`]
        : []),
    ];

    const { buffer, filename } = await pdfBufferFromInvoices(
      invoices,
      subtitleLines,
      "factures_selection",
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
