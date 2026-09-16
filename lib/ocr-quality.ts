/** Strip internal markers added during client OCR preview. */
export function stripOcrMarkers(text: string): string {
  return String(text || "").replace(/\s*\[OCR_CURRENCY\]=[A-Z]{3}\s*/gi, " ").trim();
}

/**
 * Heuristic: reject Tesseract noise (symbols, isolated chars) while keeping real invoice OCR.
 */
export function isOcrTextQualityGood(text: string | null | undefined): boolean {
  const t = stripOcrMarkers(String(text || ""));
  if (!t) return false;
  if (/^erreur\s+ocr\b/i.test(t)) return false;
  if (/aucun\s+texte\s+d[ée]tect[ée]\b/i.test(t)) return false;
  if (t.length < 20) return false;

  const letters = (t.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const alnum = letters + digits;
  if (alnum / t.length < 0.32) return false;

  const words = t.match(/[a-zA-ZÀ-ÿ]{3,}/g) || [];
  if (words.length < 4) return false;

  const hasInvoiceSignal =
    /facture|invoice|total|ttc|\bht\b|tva|montant|amount|date|fournisseur|supplier|client|siret|tva\s*intra|€|\beur\b|\bfcfa\b|\bxof\b|\bxaf\b|\bghs\b|\busd\b|\bgbp\b/i.test(
      t,
    );

  if (t.length > 80 && !hasInvoiceSignal && words.length < 10) return false;

  return true;
}

export function isOcrTextUsable(text: string | null | undefined): text is string {
  return isOcrTextQualityGood(text);
}
