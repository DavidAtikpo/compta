import { PDFDocument, PDFPage, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { invoiceCurrencySymbol, isValidInvoiceCurrency } from "@/lib/invoice-currency";

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

/** Helvetica WinAnsi : pas d’espace fine insécable (U+202F) ni de caractères hors Latin-1. */
function pdfEncodeSafe(s: string): string {
  return String(s ?? "")
    .replace(/\u202f/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

function safePdfText(s: string, maxLen: number): string {
  const t = pdfEncodeSafe(String(s ?? ""))
    .replace(/\r|\n|\t/g, " ")
    .trim();
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}...` : t;
}

function drawCenteredText(
  page: PDFPage,
  raw: string,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
): void {
  const maxWidth = PAGE_W - 2 * MARGIN;
  const text = fitTextToWidth(raw, font, size, maxWidth);
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_W - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
}

/** Tronque avec « … » seulement si le texte dépasse la largeur disponible (évite les … abusifs à N caractères fixes). */
function fitTextToWidth(raw: string, font: PDFFont, size: number, maxWidthPt: number): string {
  const t = pdfEncodeSafe(String(raw ?? ""))
    .replace(/\r|\n|\t/g, " ")
    .trim();
  if (!t) return "—";
  if (maxWidthPt <= 6) return "…";
  try {
    if (font.widthOfTextAtSize(t, size) <= maxWidthPt) return t;
  } catch {
    return safePdfText(t, 200);
  }
  const ell = "...";
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

export type PdfInvoiceExportMeta = {
  /** Ex. « The Code » — affiché dans le titre principal. */
  enterpriseName?: string | null;
  /** Titre explicite ; sinon dérivé du type achat/vente + entreprise. */
  title?: string | null;
};

function invoiceKindLabel(kind: "achat" | "vente"): string {
  return kind === "vente" ? "Factures de vente" : "Factures d'achat";
}

function invoiceKindFromRow(inv: Record<string, unknown>): "achat" | "vente" {
  return String(inv.invoiceType ?? "achat").toLowerCase() === "vente" ? "vente" : "achat";
}

function invoiceCurrencyCode(inv: Record<string, unknown>): string {
  const c = String(inv.currency ?? "EUR").toUpperCase();
  return isValidInvoiceCurrency(c) ? c : "EUR";
}

function formatPdfAmount(amount: number, currency: string | null | undefined): string {
  const sym = invoiceCurrencySymbol(currency);
  if (!Number.isFinite(amount)) return "-";
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const [intRaw, dec = "00"] = abs.toFixed(2).split(".");
  const intWithSep = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const n = `${negative ? "-" : ""}${intWithSep},${dec}`;
  return pdfEncodeSafe(`${n} ${sym}`);
}

/** Titre principal du PDF exporté. */
export function resolvePdfExportTitle(
  invoices: Record<string, unknown>[],
  enterpriseName?: string | null,
): string {
  const kinds = new Set(invoices.map((i) => invoiceKindFromRow(i)));
  const kindLabel =
    kinds.size === 1
      ? invoiceKindLabel([...kinds][0]!)
      : "Factures";
  const name = String(enterpriseName ?? "").trim();
  return name ? `${kindLabel} — ${name}` : kindLabel;
}

function groupInvoicesByKindAndCurrency(invoices: Record<string, unknown>[]) {
  const byKind = new Map<"achat" | "vente", Map<string, Record<string, unknown>[]>>();
  for (const inv of invoices) {
    const kind = invoiceKindFromRow(inv);
    const currency = invoiceCurrencyCode(inv);
    if (!byKind.has(kind)) byKind.set(kind, new Map());
    const curMap = byKind.get(kind)!;
    const list = curMap.get(currency) ?? [];
    list.push(inv);
    curMap.set(currency, list);
  }
  return byKind;
}

export async function pdfBufferFromInvoices(
  invoices: Record<string, unknown>[],
  filenameBase: string,
  branding: UserPdfBranding,
  meta: PdfInvoiceExportMeta = {},
): Promise<{ buffer: Buffer; filename: string }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { headerDrawH, footerReserved, drawPageHeader, drawFooterSecondPass } =
    await measureAndPrepareHeaderFooter(pdfDoc, branding, font, fontBold);

  const startContentY = () =>
    PAGE_H - MARGIN_TOP - headerDrawH - (headerDrawH > 0 ? 10 : 18);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page);
  let y = startContentY();

  const title =
    meta.title?.trim() ||
    resolvePdfExportTitle(invoices, meta.enterpriseName);
  drawCenteredText(page, title, y, fontBold, 14);
  y -= 26;

  const col = { d: MARGIN, n: 86, f: 124, r: 228, c: 348, t: 468 };
  const colPad = 4;
  const colW = (left: number, right: number) => Math.max(16, right - left - colPad);

  const wD = colW(col.d, col.n);
  const wN = colW(col.n, col.f);
  const wF = colW(col.f, col.r);
  const wR = colW(col.r, col.c);
  const wC = colW(col.c, col.t);
  const wT = Math.max(28, PAGE_W - MARGIN - col.t - colPad);

  let pendingTableHeader = false;

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
    pendingTableHeader = false;
    return h;
  };

  const ensureSpace = (minRows = 3) => {
    if (y < MARGIN + footerReserved + LINE_H * minRows) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawPageHeader(page);
      y = startContentY();
      if (pendingTableHeader) {
        y = redrawTableHeader(page, y);
      }
    }
  };

  const drawSectionHeading = (text: string, size = 11) => {
    ensureSpace(4);
    y -= LINE_H * 0.5;
    page.drawText(fitTextToWidth(text, fontBold, size, PAGE_W - 2 * MARGIN), {
      x: MARGIN,
      y,
      size,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= LINE_H * 1.4;
  };

  const drawCurrencyTable = (currency: string, rows: Record<string, unknown>[]) => {
    const sym = invoiceCurrencySymbol(currency);
    drawSectionHeading(`Devise ${currency}${sym !== currency ? ` (${sym})` : ""}`);

    y = redrawTableHeader(page, y);
    pendingTableHeader = true;

    let sumTtc = 0;

    for (const inv of rows) {
      ensureSpace(2);
      const invoiceDate = (inv.invoiceDate ?? inv.createdAt) as string | Date | null;
      const d = formatDisplayDate(invoiceDate);
      const num = String(inv.numeroFacture ?? "—");
      const four = String(inv.fournisseur ?? inv.originalName ?? "—");
      const refName = String(inv.originalName ?? "—");
      const cat = String(inv.category ?? "—");
      const montantTTC = (inv.montantTTC ?? inv.amount) as number | null;
      const ttc =
        typeof montantTTC === "number" && !Number.isNaN(montantTTC)
          ? formatPdfAmount(montantTTC, currency)
          : "—";
      if (typeof montantTTC === "number" && !Number.isNaN(montantTTC)) {
        sumTtc += montantTTC;
      }

      page.drawText(fitTextToWidth(d, font, FONT_SIZE, wD), { x: col.d, y, size: FONT_SIZE, font });
      page.drawText(fitTextToWidth(num, font, FONT_SIZE, wN), { x: col.n, y, size: FONT_SIZE, font });
      page.drawText(fitTextToWidth(four, font, FONT_SIZE, wF), { x: col.f, y, size: FONT_SIZE, font });
      page.drawText(fitTextToWidth(refName, font, FONT_SIZE, wR), { x: col.r, y, size: FONT_SIZE, font });
      page.drawText(fitTextToWidth(cat, font, FONT_SIZE, wC), { x: col.c, y, size: FONT_SIZE, font });
      page.drawText(fitTextToWidth(ttc, font, FONT_SIZE, wT), { x: col.t, y, size: FONT_SIZE, font });
      y -= LINE_H;
    }

    ensureSpace(2);
    y -= LINE_H * 0.5;
    page.drawLine({
      start: { x: MARGIN, y: y + 6 },
      end: { x: PAGE_W - MARGIN, y: y + 6 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
    y -= LINE_H;
    const totalLabel = `Total TTC (${currency}) : ${formatPdfAmount(sumTtc, currency)}`;
    page.drawText(fitTextToWidth(totalLabel, fontBold, FONT_SIZE, PAGE_W - MARGIN - col.t + col.d), {
      x: col.d,
      y,
      size: FONT_SIZE,
      font: fontBold,
    });
    y -= LINE_H * 2;
    pendingTableHeader = false;
  };

  const grouped = groupInvoicesByKindAndCurrency(invoices);
  const kinds = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  const multipleKinds = kinds.length > 1;

  for (const kind of kinds) {
    const curMap = grouped.get(kind)!;
    const currencies = [...curMap.keys()].sort((a, b) => a.localeCompare(b));

    if (multipleKinds) {
      const sectionTitle = meta.enterpriseName?.trim()
        ? `${invoiceKindLabel(kind)} — ${meta.enterpriseName.trim()}`
        : invoiceKindLabel(kind);
      drawSectionHeading(sectionTitle, 12);
    }

    for (const currency of currencies) {
      drawCurrencyTable(currency, curMap.get(currency)!);
    }
  }

  const pages = pdfDoc.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    drawFooterSecondPass({ page: pages[i], pageIndex: i, totalPages: total, font });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `${filenameBase}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { buffer: Buffer.from(pdfBytes), filename };
}
