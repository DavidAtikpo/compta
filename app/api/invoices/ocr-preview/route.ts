import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveDocumentImageDataUrl } from "@/lib/invoice-document-vision";
import { ocrFromImageDataUrl } from "@/lib/server-ocr";
import { isOcrTextQualityGood } from "@/lib/ocr-quality";
import {
  parseFournisseurFromOcr,
  parseMontantTTCStringFromOcr,
} from "@/lib/invoice-ocr-parse";
import { detectCurrencyFromOcrText } from "@/lib/invoice-currency";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
    const originalName = typeof body?.originalName === "string" ? body.originalName : "document";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : null;

    if (!fileUrl) {
      return NextResponse.json({ error: "fileUrl requis." }, { status: 400 });
    }

    const visionDataUrl = await resolveDocumentImageDataUrl(fileUrl, originalName, mimeType);
    if (!visionDataUrl) {
      return NextResponse.json(
        { error: "Impossible de préparer le document pour l’OCR." },
        { status: 422 },
      );
    }

    const ocrRaw = await ocrFromImageDataUrl(visionDataUrl);
    if (!isOcrTextQualityGood(ocrRaw)) {
      return NextResponse.json(
        { error: "Texte illisible — reprenez la photo à plat, bien éclairée." },
        { status: 422 },
      );
    }
    const text = String(ocrRaw);

    const flat = text.replace(/\s+/g, " ");
    const fournisseur = parseFournisseurFromOcr(text, originalName);
    const dateMatch =
      flat.match(/(?:date(?:\s+de)?\s+(?:transaction|facture)|date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ??
      flat.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
    const montant = parseMontantTTCStringFromOcr(text);
    const currency = detectCurrencyFromOcrText(text);

    return NextResponse.json({
      success: true,
      preview: {
        fournisseur,
        dateFacture: dateMatch?.[1] ?? null,
        montant,
        currency,
        textSample: String(text).slice(0, 600),
      },
    });
  } catch (error) {
    console.error("ocr-preview:", error);
    return NextResponse.json({ error: "Erreur lors de l’aperçu OCR." }, { status: 500 });
  }
}
