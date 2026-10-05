import { createWorker } from "tesseract.js";

export type VisionOcrDiagnostic = {
  ok: boolean;
  httpStatus?: number;
  googleStatus?: string;
  message?: string;
  at: number;
};

let lastVisionDiagnostic: VisionOcrDiagnostic | null = null;

/** Dernier échec/succès Vision (logs + message utilisateur en cas d’échec OCR). */
export function getLastVisionOcrDiagnostic(): VisionOcrDiagnostic | null {
  return lastVisionDiagnostic;
}

function setVisionDiagnostic(partial: Omit<VisionOcrDiagnostic, "at">) {
  lastVisionDiagnostic = { ...partial, at: Date.now() };
}

/** Message court pour l’UI quand l’OCR échoue malgré OCR_API_KEY. */
export function visionOcrHintForUser(): string | null {
  const d = lastVisionDiagnostic;
  if (!d || d.ok) return null;
  const msg = String(d.message || "").toLowerCase();
  const status = String(d.googleStatus || "");

  if (msg.includes("referer") || msg.includes("referrer") || msg.includes("android apps")) {
    return "La clé Google est limitée aux navigateurs : sur Vercel, créez une clé « sans restriction applicative » (appels serveur) avec l’API Cloud Vision activée.";
  }
  if (
    status === "PERMISSION_DENIED" ||
    msg.includes("has not been used") ||
    msg.includes("is disabled") ||
    msg.includes("cloud vision api")
  ) {
    return "Activez « Cloud Vision API » dans Google Cloud Console (même projet que la clé OCR_API_KEY) et vérifiez la facturation.";
  }
  if (msg.includes("api key not valid") || msg.includes("invalid api key") || d.httpStatus === 400) {
    return "OCR_API_KEY refusée par Google : vérifiez la valeur sur Vercel (Production) et redéployez.";
  }
  if (d.httpStatus === 403) {
    return "Google Vision a refusé la requête (403) : droits API ou restrictions de la clé.";
  }
  return null;
}

/** Google Cloud Vision DOCUMENT_TEXT_DETECTION (optional — falls back to Tesseract). */
async function ocrWithGoogleVision(imageDataUrl: string): Promise<string | null> {
  const key = process.env.OCR_API_KEY?.trim();
  if (!key) return null;

  const m = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m?.[2]) return null;

  const b64 = m[2];
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > 18 * 1024 * 1024) {
    console.warn("OCR Vision: image > 18 Mo, risque de rejet API");
  }

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: b64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      },
    );

    const rawBody = await res.text().catch(() => "");
    if (!res.ok) {
      let googleMessage = rawBody.slice(0, 500);
      try {
        const errJson = JSON.parse(rawBody) as { error?: { message?: string; status?: string } };
        googleMessage = errJson.error?.message || googleMessage;
        setVisionDiagnostic({
          ok: false,
          httpStatus: res.status,
          googleStatus: errJson.error?.status,
          message: googleMessage,
        });
      } catch {
        setVisionDiagnostic({ ok: false, httpStatus: res.status, message: googleMessage });
      }
      console.warn("OCR Vision API error:", res.status, googleMessage);
      return null;
    }

    const payload = JSON.parse(rawBody) as {
      responses?: Array<{
        error?: { message?: string; code?: number; status?: string };
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
      }>;
    };

    const first = payload?.responses?.[0];
    if (first?.error) {
      setVisionDiagnostic({
        ok: false,
        googleStatus: first.error.status,
        message: first.error.message,
      });
      console.warn("OCR Vision document error:", first.error);
      return null;
    }

    const text =
      first?.fullTextAnnotation?.text || first?.textAnnotations?.[0]?.description || "";
    const out = String(text || "").trim();
    if (out.length >= 10) {
      setVisionDiagnostic({ ok: true });
      return out;
    }

    setVisionDiagnostic({ ok: true, message: "Vision: document sans texte (API OK)" });
    return null;
  } catch (e) {
    const message = (e as Error).message;
    setVisionDiagnostic({ ok: false, message });
    console.warn("OCR Vision API fetch failed:", message);
    return null;
  }
}

/** Local OCR fallback (works without OCR_API_KEY). Often unreliable on Vercel serverless. */
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

function pickBestOcrText(...candidates: (string | null | undefined)[]): string | null {
  const valid = candidates
    .map((t) => String(t || "").trim())
    .filter((t) => t.length >= 10);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.length - a.length);
  return valid[0] ?? null;
}

/**
 * OCR on a base64 image data URL.
 * With OCR_API_KEY: Google Vision first; Tesseract only en local ou si Vision échoue (pas en parallèle sur Vercel).
 */
/** Test rapide de la clé OCR_API_KEY (admin / diagnostic). */
export async function probeVisionOcrApi(): Promise<{
  keyConfigured: boolean;
  apiReachable: boolean;
  hint: string | null;
}> {
  const keyConfigured = Boolean(process.env.OCR_API_KEY?.trim());
  if (!keyConfigured) {
    return { keyConfigured: false, apiReachable: false, hint: "OCR_API_KEY absente sur ce déploiement." };
  }
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await ocrWithGoogleVision(tinyPng);
  const d = lastVisionDiagnostic;
  const hint = visionOcrHintForUser();
  const apiReachable = Boolean(d?.ok) && !hint;
  return { keyConfigured: true, apiReachable, hint };
}

export async function ocrFromImageDataUrl(imageDataUrl: string): Promise<string | null> {
  if (!imageDataUrl?.startsWith("data:image/")) return null;

  const hasVisionKey = Boolean(process.env.OCR_API_KEY?.trim());
  const onVercel = Boolean(process.env.VERCEL);

  const vision = hasVisionKey ? await ocrWithGoogleVision(imageDataUrl) : null;
  if (vision) return vision;

  const skipTesseractOnVercel = hasVisionKey && onVercel;
  if (skipTesseractOnVercel) {
    console.warn(
      "OCR: Vision sans texte — Tesseract ignoré sur Vercel (préférez corriger OCR_API_KEY / Cloud Vision API).",
    );
    return null;
  }

  const tess = await ocrWithTesseract(imageDataUrl);
  const best = pickBestOcrText(vision, tess);

  if (!best && !hasVisionKey) {
    console.log("OCR_API_KEY absente — OCR via Tesseract.js (serveur)");
  }

  return best;
}
