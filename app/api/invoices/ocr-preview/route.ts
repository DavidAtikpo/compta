import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import {
  diagnoseResolveDocumentImageUrl,
  resolveDocumentImageDataUrl,
} from "@/lib/invoice-document-vision";
import { ocrFromImageDataUrl, probeVisionOcrApi } from "@/lib/server-ocr";
import { isOcrTextLooselyUsable, isOcrTextQualityGood } from "@/lib/ocr-quality";
import {
  parseFournisseurFromOcr,
  parseMontantTTCStringFromOcr,
} from "@/lib/invoice-ocr-parse";
import { detectCurrencyFromOcrText } from "@/lib/invoice-currency";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Diagnostic OCR_API_KEY + Google Vision (connecté, token Bearer). */
export async function GET(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json(
      {
        error: "Connexion requise.",
        hint: "Ouvrez le site connecté puis GET /api/invoices/ocr-preview (cookie de session) ou fetch avec Bearer token.",
      },
      { status: 401 },
    );
  }
  const result = await probeVisionOcrApi();
  return NextResponse.json({ ...result, endpoint: "/api/invoices/ocr-preview" });
}

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
      const reason = diagnoseResolveDocumentImageUrl(fileUrl);
      const hints: Record<string, string> = {
        empty_url: "Aucune URL fournie.",
        not_cloudinary:
          "Collez l’URL Cloudinary complète (https://res.cloudinary.com/…/image/upload/…), pas un lien /api/invoices/…/file.",
        cloudinary_download_failed:
          "Cloudinary n’a pas livré le fichier : vérifiez CLOUDINARY_* sur Vercel (même compte que l’upload) ou rouvrez la facture → copier l’URL de l’image.",
      };
      return NextResponse.json(
        {
          error: "Impossible de préparer le document pour l’OCR.",
          reason,
          hint: reason ? hints[reason] : undefined,
        },
        { status: 422 },
      );
    }

    const ocrRaw = await ocrFromImageDataUrl(visionDataUrl);
    if (!isOcrTextQualityGood(ocrRaw) && !isOcrTextLooselyUsable(ocrRaw)) {
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
