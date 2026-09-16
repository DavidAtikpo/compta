import { createWorker } from "tesseract.js";

/** Google Cloud Vision DOCUMENT_TEXT_DETECTION (optional — falls back to Tesseract). */
async function ocrWithGoogleVision(imageDataUrl: string): Promise<string | null> {
  const key = process.env.OCR_API_KEY?.trim();
  if (!key) return null;

  const m = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m?.[2]) return null;

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: m[2] },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!res.ok) {
      console.warn("OCR Vision API error:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const payload = (await res.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
      }>;
    };
    const text =
      payload?.responses?.[0]?.fullTextAnnotation?.text ||
      payload?.responses?.[0]?.textAnnotations?.[0]?.description ||
      "";
    const out = String(text || "").trim();
    return out.length >= 10 ? out : null;
  } catch (e) {
    console.warn("OCR Vision API fetch failed:", (e as Error).message);
    return null;
  }
}

/** Local OCR fallback (works without OCR_API_KEY). */
async function ocrWithTesseract(imageDataUrl: string): Promise<string | null> {
  const worker = await createWorker("fra+eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl);
    const out = String(text || "").trim();
    return out.length >= 10 ? out : null;
  } catch (e) {
    console.warn("Tesseract OCR failed:", (e as Error).message);
    return null;
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR on a base64 image data URL.
 * Tries Google Vision when OCR_API_KEY is set, otherwise (or on failure) uses Tesseract.js.
 */
export async function ocrFromImageDataUrl(imageDataUrl: string): Promise<string | null> {
  if (!imageDataUrl?.startsWith("data:image/")) return null;

  const vision = await ocrWithGoogleVision(imageDataUrl);
  if (vision) return vision;

  if (process.env.OCR_API_KEY?.trim()) {
    console.log("Google Vision n'a pas renvoyé de texte — repli Tesseract.js");
  } else {
    console.log("OCR_API_KEY absente — OCR via Tesseract.js (serveur)");
  }

  return ocrWithTesseract(imageDataUrl);
}
