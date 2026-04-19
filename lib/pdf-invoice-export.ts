import { PDFDocument, PDFPage, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";

export const PAGE_W = 595;
export const PAGE_H = 842;
const MARGIN = 40;
/** Marge depuis le bord supérieur de la page (plus d’air qu’en bas / côtés). */
const MARGIN_TOP = 58;
const LINE_H = 11;
const FONT_SIZE = 8;
const MAX_CHARS_LINE = 92;
const MAX_EXTRA_HEADER_LINES = 8;
const MAX_FOOTER_LINES = 10;

export const PDF_HEADER_LAYOUT_STACKED = "stacked" as const;
export const PDF_HEADER_LAYOUT_LOGO_TABLE_ROW = "logo_table_row" as const;
export type PdfHeaderLayoutId =
  | typeof PDF_HEADER_LAYOUT_STACKED
  | typeof PDF_HEADER_LAYOUT_LOGO_TABLE_ROW;

export function normalizePdfHeaderLayout(v: string | null | undefined): PdfHeaderLayoutId {
  if (v === PDF_HEADER_LAYOUT_LOGO_TABLE_ROW) return PDF_HEADER_LAYOUT_LOGO_TABLE_ROW;
  return PDF_HEADER_LAYOUT_STACKED;
}

export type UserPdfBranding = {
  pdfHeaderText: string | null;
  pdfFooterText: string | null;
  pdfHeaderImageUrl: string | null;
  pdfFooterImageUrl: string | null;
  pdfLogoUrl: string | null;
  pdfHeaderTitle: string | null;
  pdfHeaderAddress: string | null;
  pdfHeaderTableJson: string | null;
  pdfHeaderLayout: string | null;
};

function safePdfText(s: string, maxLen: number): string {
  const t = String(s ?? "")
    .replace(/\r|\n|\t/g, " ")
    .trim();
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

/** Tronque avec « … » seulement si le texte dépasse la largeur disponible (évite les … abusifs à N caractères fixes). */
function fitTextToWidth(raw: string, font: PDFFont, size: number, maxWidthPt: number): string {
  const t = String(raw ?? "")
    .replace(/\r|\n|\t/g, " ")
    .trim();
  if (!t) return "—";
  if (maxWidthPt <= 6) return "…";
  try {
    if (font.widthOfTextAtSize(t, size) <= maxWidthPt) return t;
  } catch {
    return safePdfText(t, 200);
  }
  const ell = "…";
  for (let n = t.length; n >= 1; n--) {
    const s = n === t.length ? t : `${t.slice(0, n - 1)}${ell}`;
    try {
      if (font.widthOfTextAtSize(s, size) <= maxWidthPt) return s;
    } catch {
      break;
    }
  }
  return ell;
}

export function formatDisplayDate(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
}

function expandLines(raw: string | null | undefined, maxLines: number): string[] {
  if (!raw?.trim()) return [];
  const lines: string[] = [];
  for (const block of raw.replace(/\r\n/g, "\n").split("\n")) {
    let s = block.trim();
    if (!s) continue;
    while (s.length > MAX_CHARS_LINE) {
      lines.push(s.slice(0, MAX_CHARS_LINE));
      s = s.slice(MAX_CHARS_LINE);
      if (lines.length >= maxLines) return lines;
    }
    if (s.length) lines.push(s);
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  return lines.slice(0, maxLines);
}

export function parsePdfTable(json: string | null | undefined): string[][] | null {
  if (!json?.trim()) return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v) || v.length !== 2) return null;
    const rows: string[][] = [];
    for (const row of v) {
      if (!Array.isArray(row) || row.length !== 4) return null;
      rows.push(
        row.map((c) =>
          typeof c === "string" ? c.trim().slice(0, 160) : String(c ?? "").trim().slice(0, 160),
        ),
      );
    }
    return rows;
  } catch {
    return null;
  }
}

async function fetchEmbedImage(
  pdfDoc: PDFDocument,
  url: string,
): Promise<{ image: PDFImage; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    let image: PDFImage;
    try {
      image = await pdfDoc.embedPng(bytes);
    } catch {
      try {
        image = await pdfDoc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
    const sz = image.scale(1);
    return { image, w: sz.width, h: sz.height };
  } catch {
    return null;
  }
}

function drawPdfTable(
  page: PDFPage,
  table: string[][],
  tableLeftX: number,
  tableBottomY: number,
  totalWidth: number,
  font: PDFFont,
  cellFs: number,
  rowH: number,
) {
  const cw = totalWidth / 4;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const x0 = tableLeftX + c * cw;
      const y0 = tableBottomY + (1 - r) * rowH;
      page.drawRectangle({
        x: x0,
        y: y0,
        width: cw - 0.2,
        height: rowH,
        borderColor: rgb(0.78, 0.78, 0.82),
        borderWidth: 0.55,
      });
      const cell = table[r]?.[c] ?? "";
      page.drawText(fitTextToWidth(cell, font, cellFs, cw - 7), {
        x: x0 + 3,
        y: y0 + 5,
        size: cellFs,
        font,
        color: rgb(0.2, 0.2, 0.22),
      });
    }
  }
}

type MeasureResult = {
  headerDrawH: number;
  footerReserved: number;
  drawPageHeader: (page: PDFPage) => void;
  drawFooterSecondPass: (opts: {
    page: PDFPage;
    pageIndex: number;
    totalPages: number;
    font: PDFFont;
  }) => void;
};

async function measureAndPrepareHeaderFooter(
  pdfDoc: PDFDocument,
  b: UserPdfBranding,
  font: PDFFont,
  fontBold: PDFFont,
): Promise<MeasureResult> {
  const footerTextLines = expandLines(b.pdfFooterText, MAX_FOOTER_LINES);

  let footerImgEmb: { image: PDFImage; w: number; h: number } | null = null;
  if (b.pdfFooterImageUrl?.trim()) {
    footerImgEmb = await fetchEmbedImage(pdfDoc, b.pdfFooterImageUrl.trim());
  }
  let footerImgDrawH = 0;
  if (footerImgEmb) {
    const maxW = PAGE_W - 2 * MARGIN;
    const maxH = 72;
    const scale = Math.min(maxW / footerImgEmb.w, maxH / footerImgEmb.h, 1);
    footerImgDrawH = footerImgEmb.h * scale;
  }

  const headerImgEmb = b.pdfHeaderImageUrl?.trim()
    ? await fetchEmbedImage(pdfDoc, b.pdfHeaderImageUrl.trim())
    : null;

  if (headerImgEmb) {
    const maxW = PAGE_W - 2 * MARGIN;
    const maxH = 110;
    const scale = Math.min(maxW / headerImgEmb.w, maxH / headerImgEmb.h, 1);
    const drawW = headerImgEmb.w * scale;
    const drawH = headerImgEmb.h * scale;
    const headerDrawH = drawH + 10;

    const drawHeader = (page: PDFPage) => {
      const x = (PAGE_W - drawW) / 2;
      const yBottom = PAGE_H - MARGIN_TOP - drawH;
      page.drawImage(headerImgEmb!.image, {
        x,
        y: yBottom,
        width: drawW,
        height: drawH,
      });
    };

    const footerReserved = Math.max(
      36,
      footerImgDrawH + 8 + footerTextLines.length * LINE_H + 18,
    );

    const drawFooterSecondPass: MeasureResult["drawFooterSecondPass"] = ({
      page,
      pageIndex,
      totalPages,
      font: f,
    }) => {
      const fsFoot = FONT_SIZE - 1;
      const pageStr = `Page ${pageIndex + 1} / ${totalPages}`;
      const twp = f.widthOfTextAtSize(pageStr, fsFoot);
      page.drawText(pageStr, {
        x: (PAGE_W - twp) / 2,
        y: MARGIN,
        size: fsFoot,
        font: f,
        color: rgb(0.45, 0.45, 0.45),
      });
      let yAbove = MARGIN + fsFoot + 6;
      if (footerImgEmb) {
        const maxW = PAGE_W - 2 * MARGIN;
        const maxH = 72;
        const scale = Math.min(maxW / footerImgEmb.w, maxH / footerImgEmb.h, 1);
        const dw = footerImgEmb.w * scale;
        const dh = footerImgEmb.h * scale;
        const x = (PAGE_W - dw) / 2;
        page.drawImage(footerImgEmb.image, { x, y: yAbove, width: dw, height: dh });
        yAbove += dh + 4;
      }
      for (const line of footerTextLines) {
        page.drawText(safePdfText(line, MAX_CHARS_LINE + 8), {
          x: MARGIN,
          y: yAbove,
          size: FONT_SIZE - 1,
          font: f,
          color: rgb(0.42, 0.42, 0.45),
        });
        yAbove += LINE_H;
      }
    };

    return { headerDrawH, footerReserved, drawPageHeader: drawHeader, drawFooterSecondPass };
  }

  const logoEmb = b.pdfLogoUrl?.trim() ? await fetchEmbedImage(pdfDoc, b.pdfLogoUrl.trim()) : null;
  let logoDrawW = 0;
  let logoDrawH = 0;
  if (logoEmb) {
    const maxLogo = 52;
    const scale = Math.min(maxLogo / logoEmb.w, maxLogo / logoEmb.h, 1);
    logoDrawW = logoEmb.w * scale;
    logoDrawH = logoEmb.h * scale;
  }

  const title = (b.pdfHeaderTitle || "").trim();
  const titleLines = title ? [title] : [];
  const addressLines = expandLines(b.pdfHeaderAddress ?? null, 6);
  const table = parsePdfTable(b.pdfHeaderTableJson);
  const hasTable =
    table &&
    table.some((row) => row.some((c) => c.trim().length > 0));
  const extraHeaderLines = expandLines(b.pdfHeaderText, MAX_EXTRA_HEADER_LINES);

  const CELL_FS = 6.5;
  const ROW_H = 18;
  const TABLE_GAP = 8;
  const tableH = hasTable ? ROW_H * 2 + 10 : 0;
  const titleBlockH = titleLines.length * 15 + addressLines.length * LINE_H;

  const layout = normalizePdfHeaderLayout(b.pdfHeaderLayout);
  const useLogoTableRow =
    layout === PDF_HEADER_LAYOUT_LOGO_TABLE_ROW &&
    logoEmb !== null &&
    hasTable &&
    table !== null;

  let blockH: number;
  if (useLogoTableRow) {
    const flexH = Math.max(logoDrawH, ROW_H * 2 + 8);
    blockH =
      titleBlockH +
      TABLE_GAP +
      flexH +
      (extraHeaderLines.length > 0 ? TABLE_GAP + extraHeaderLines.length * LINE_H : 0) +
      8;
  } else {
    blockH =
      Math.max(logoDrawH, titleLines.length * 14 + addressLines.length * LINE_H) +
      (hasTable ? TABLE_GAP + tableH : 0) +
      (extraHeaderLines.length > 0 ? TABLE_GAP + extraHeaderLines.length * LINE_H : 0) +
      8;
  }

  if (!logoEmb && titleLines.length === 0 && addressLines.length === 0 && !hasTable && extraHeaderLines.length === 0) {
    blockH = 0;
  }

  const headerDrawH = blockH > 0 ? blockH + 8 : 0;

  const drawComposedHeader = (page: PDFPage) => {
    if (blockH === 0) return;

    if (useLogoTableRow && logoEmb && table) {
      let y = PAGE_H - MARGIN_TOP;
      let textY = y;
      const titleWRow = PAGE_W - 2 * MARGIN - 4;
      for (const tl of titleLines) {
        page.drawText(fitTextToWidth(tl, fontBold, 12, titleWRow), {
          x: MARGIN,
          y: textY,
          size: 12,
          font: fontBold,
          color: rgb(0.08, 0.08, 0.1),
        });
        textY -= 15;
      }
      const addrWRow = PAGE_W - 2 * MARGIN - 4;
      for (const al of addressLines) {
        page.drawText(fitTextToWidth(al, font, FONT_SIZE, addrWRow), {
          x: MARGIN,
          y: textY,
          size: FONT_SIZE,
          font,
          color: rgb(0.25, 0.25, 0.28),
        });
        textY -= LINE_H;
      }
      const flexBottom = textY - TABLE_GAP;
      page.drawImage(logoEmb.image, {
        x: MARGIN,
        y: flexBottom,
        width: logoDrawW,
        height: logoDrawH,
      });
      const tableLeft = MARGIN + logoDrawW + 8;
      const tableW = PAGE_W - MARGIN - tableLeft;
      drawPdfTable(page, table, tableLeft, flexBottom, tableW, font, CELL_FS, ROW_H);
      let cursorY = flexBottom - 10;
      for (const ex of extraHeaderLines) {
        page.drawText(fitTextToWidth(ex, font, FONT_SIZE, addrWRow), {
          x: MARGIN,
          y: cursorY,
          size: FONT_SIZE,
          font,
          color: rgb(0.15, 0.15, 0.18),
        });
        cursorY -= LINE_H;
      }
      return;
    }

    let y = PAGE_H - MARGIN_TOP;
    const leftText = MARGIN + (logoDrawW > 0 ? logoDrawW + 10 : 0);

    if (logoEmb) {
      const yLogoBottom = y - logoDrawH + 2;
      page.drawImage(logoEmb.image, {
        x: MARGIN,
        y: yLogoBottom,
        width: logoDrawW,
        height: logoDrawH,
      });
    }

    let textY = y;
    const titleWStack = PAGE_W - leftText - MARGIN - 4;
    for (const tl of titleLines) {
      page.drawText(fitTextToWidth(tl, fontBold, 12, titleWStack), {
        x: leftText,
        y: textY,
        size: 12,
        font: fontBold,
        color: rgb(0.08, 0.08, 0.1),
      });
      textY -= 15;
    }
    const addrWStack = PAGE_W - leftText - MARGIN - 4;
    for (const al of addressLines) {
      page.drawText(fitTextToWidth(al, font, FONT_SIZE, addrWStack), {
        x: leftText,
        y: textY,
        size: FONT_SIZE,
        font,
        color: rgb(0.25, 0.25, 0.28),
      });
      textY -= LINE_H;
    }

    let afterTextY = textY;
    if (logoEmb) {
      const logoBottom = y - logoDrawH;
      afterTextY = Math.min(afterTextY, logoBottom - 4);
    }

    let cursorY = afterTextY - (titleLines.length || addressLines.length ? 6 : 0);

    if (hasTable && table) {
      cursorY -= 4;
      const tw = PAGE_W - 2 * MARGIN;
      const tableBottom = cursorY - TABLE_GAP;
      drawPdfTable(page, table, MARGIN, tableBottom, tw, font, CELL_FS, ROW_H);
      cursorY = tableBottom - 6;
    }

    const extraW = PAGE_W - 2 * MARGIN - 4;
    for (const ex of extraHeaderLines) {
      page.drawText(fitTextToWidth(ex, font, FONT_SIZE, extraW), {
        x: MARGIN,
        y: cursorY,
        size: FONT_SIZE,
        font,
        color: rgb(0.15, 0.15, 0.18),
      });
      cursorY -= LINE_H;
    }
  };

  const footerReserved = Math.max(
    36,
    footerImgDrawH + 8 + footerTextLines.length * LINE_H + 18,
  );

  const drawFooterSecondPass: MeasureResult["drawFooterSecondPass"] = ({
    page,
    pageIndex,
    totalPages,
    font: f,
  }) => {
    const fsFoot = FONT_SIZE - 1;
    const pageStr = `Page ${pageIndex + 1} / ${totalPages}`;
    const twp = f.widthOfTextAtSize(pageStr, fsFoot);
    page.drawText(pageStr, {
      x: (PAGE_W - twp) / 2,
      y: MARGIN,
      size: fsFoot,
      font: f,
      color: rgb(0.45, 0.45, 0.45),
    });
    let yAbove = MARGIN + fsFoot + 6;
    if (footerImgEmb) {
      const maxW = PAGE_W - 2 * MARGIN;
      const maxH = 72;
      const scale = Math.min(maxW / footerImgEmb.w, maxH / footerImgEmb.h, 1);
      const dw = footerImgEmb.w * scale;
      const dh = footerImgEmb.h * scale;
      const x = (PAGE_W - dw) / 2;
      page.drawImage(footerImgEmb.image, { x, y: yAbove, width: dw, height: dh });
      yAbove += dh + 4;
    }
    for (const line of footerTextLines) {
      page.drawText(safePdfText(line, MAX_CHARS_LINE + 8), {
        x: MARGIN,
        y: yAbove,
        size: FONT_SIZE - 1,
        font: f,
        color: rgb(0.42, 0.42, 0.45),
      });
      yAbove += LINE_H;
    }
  };

  return {
    headerDrawH,
    footerReserved,
    drawPageHeader: drawComposedHeader,
    drawFooterSecondPass,
  };
}

export async function pdfBufferFromInvoices(
  invoices: Record<string, unknown>[],
  subtitleLines: string[],
  filenameBase: string,
  branding: UserPdfBranding,
): Promise<{ buffer: Buffer; filename: string }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { headerDrawH, footerReserved, drawPageHeader, drawFooterSecondPass } =
    await measureAndPrepareHeaderFooter(pdfDoc, branding, font, fontBold);

  /** Espace sous l’en-tête personnalisé ; sans en-tête, marge supplémentaire sous le haut de page. */
  const startContentY = () =>
    PAGE_H - MARGIN_TOP - headerDrawH - (headerDrawH > 0 ? 10 : 18);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page);
  let y = startContentY();

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
  const subMaxW = PAGE_W - 2 * MARGIN - 4;
  page.drawText(fitTextToWidth(sub, font, FONT_SIZE, subMaxW), {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= LINE_H * 2;

  const col = { d: MARGIN, n: 86, f: 124, r: 228, c: 348, t: 468 };
  const colPad = 4;
  const colW = (left: number, right: number) => Math.max(16, right - left - colPad);
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

  const redrawTableHeader = (p: PDFPage, yy: number) => {
    let h = yy;
    p.drawText("Date", { x: col.d, y: h, size: FONT_SIZE, font: fontBold });
    p.drawText("N°", { x: col.n, y: h, size: FONT_SIZE, font: fontBold });
    p.drawText("Fournisseur", { x: col.f, y: h, size: FONT_SIZE, font: fontBold });
    p.drawText("Référence", { x: col.r, y: h, size: FONT_SIZE, font: fontBold });
    p.drawText("Catégorie", { x: col.c, y: h, size: FONT_SIZE, font: fontBold });
    p.drawText("TTC", { x: col.t, y: h, size: FONT_SIZE, font: fontBold });
    h -= LINE_H * 1.5;
    p.drawLine({
      start: { x: MARGIN, y: h + 4 },
      end: { x: PAGE_W - MARGIN, y: h + 4 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
    h -= LINE_H;
    return h;
  };

  const ensureSpace = () => {
    if (y < MARGIN + footerReserved + 36) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawPageHeader(page);
      y = startContentY();
      y = redrawTableHeader(page, y);
    }
  };

  let sumTtc = 0;

  const wD = colW(col.d, col.n);
  const wN = colW(col.n, col.f);
  const wF = colW(col.f, col.r);
  const wR = colW(col.r, col.c);
  const wC = colW(col.c, col.t);
  const wT = Math.max(28, PAGE_W - MARGIN - col.t - colPad);

  for (const inv of invoices) {
    ensureSpace();
    const invoiceDate = (inv.invoiceDate ?? inv.createdAt) as string | Date | null;
    const d = formatDisplayDate(invoiceDate);
    const num = String(inv.numeroFacture ?? "—");
    const four = String(inv.fournisseur ?? inv.originalName ?? "—");
    const refName = String(inv.originalName ?? "—");
    const refEmail = String(inv.accountant_email ?? "").trim();
    const refRaw = refEmail ? `${refName} · ${refEmail}` : refName;
    const cat = String(inv.category ?? "—");
    const montantTTC = (inv.montantTTC ?? inv.amount ?? 0) as number;
    const ttc =
      typeof montantTTC === "number" && !Number.isNaN(montantTTC)
        ? `${montantTTC.toFixed(2)} €`
        : "—";
    if (typeof montantTTC === "number" && !Number.isNaN(montantTTC)) {
      sumTtc += montantTTC;
    }

    page.drawText(fitTextToWidth(d, font, FONT_SIZE, wD), { x: col.d, y, size: FONT_SIZE, font });
    page.drawText(fitTextToWidth(num, font, FONT_SIZE, wN), { x: col.n, y, size: FONT_SIZE, font });
    page.drawText(fitTextToWidth(four, font, FONT_SIZE, wF), { x: col.f, y, size: FONT_SIZE, font });
    page.drawText(fitTextToWidth(refRaw, font, FONT_SIZE, wR), { x: col.r, y, size: FONT_SIZE, font });
    page.drawText(fitTextToWidth(cat, font, FONT_SIZE, wC), { x: col.c, y, size: FONT_SIZE, font });
    page.drawText(fitTextToWidth(ttc, font, FONT_SIZE, wT), { x: col.t, y, size: FONT_SIZE, font });
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

  const pages = pdfDoc.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    drawFooterSecondPass({ page: pages[i], pageIndex: i, totalPages: total, font });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { buffer: Buffer.from(pdfBytes), filename };
}
