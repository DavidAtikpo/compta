"use client";

/**
 * OCR dans le navigateur (Tesseract.js) — secours sur mobile quand l’OCR serveur échoue
 * (photos caméra, connexion lente, limites serverless).
 */
export async function ocrImageFileInBrowser(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    return null;
  }
  if (file.size > 12 * 1024 * 1024) return null;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra+eng", 1, {
    logger: () => {},
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    const out = String(text || "").trim();
    return out.length >= 8 ? out : null;
  } catch (e) {
    console.warn("Client OCR:", (e as Error).message);
    return null;
  } finally {
    await worker.terminate();
  }
}
