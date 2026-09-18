const EXTRACTION_OK_RE = /\[EXTRACTION_OK\]=[^\n]*/;

/** Marqueur ajouté en base après une extraction réussie. */
export function appendExtractionOkMarker(ocrText: string | null | undefined): string {
  const marker = `[EXTRACTION_OK]=${new Date().toISOString()}`;
  const base = String(ocrText ?? "").trim();
  if (!base) return marker;
  if (EXTRACTION_OK_RE.test(base)) return base.replace(EXTRACTION_OK_RE, marker);
  return `${base}\n${marker}`;
}

export function hasExtractionOkMarker(ocrText: string | null | undefined): boolean {
  return EXTRACTION_OK_RE.test(String(ocrText ?? ""));
}

/** Facture déjà passée par l'extraction (marqueur ou champs remplis avant le marqueur). */
export function isInvoiceExtractionDone(inv: {
  ocrText?: string | null;
  montantTTC?: number | null;
  amount?: number | null;
  fournisseur?: string | null;
  numeroFacture?: string | null;
  invoiceDate?: string | null;
}): boolean {
  if (hasExtractionOkMarker(inv.ocrText)) return true;
  const ttc = inv.montantTTC ?? inv.amount;
  if (ttc != null) return true;
  if (inv.fournisseur && (inv.numeroFacture || inv.invoiceDate)) return true;
  return false;
}
