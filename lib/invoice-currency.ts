/**
 * Devise facture : détection depuis le texte OCR (client Tesseract + serveur Vision / règles).
 * Codes alignés sur la colonne `currency` en base et sur `CURRENCY_OPTIONS` côté UI.
 */
export const VALID_INVOICE_CURRENCY_CODES = ["EUR", "GBP", "USD", "CNY", "GHS", "XAF", "XOF"] as const;
export type InvoiceCurrencyCode = (typeof VALID_INVOICE_CURRENCY_CODES)[number];

const OCR_CURRENCY_MARKER = /\[OCR_CURRENCY\]\s*=\s*([A-Z]{3})\b/i;

export function isValidInvoiceCurrency(code: string): boolean {
  return VALID_INVOICE_CURRENCY_CODES.includes(code.toUpperCase() as InvoiceCurrencyCode);
}

/** Lit le marqueur ajouté par l’OCR client (prioritaire pour l’extraction). */
export function parseOcrCurrencyMarker(text: string): string | null {
  const m = String(text || "").match(OCR_CURRENCY_MARKER);
  if (!m?.[1]) return null;
  const c = m[1].toUpperCase();
  return isValidInvoiceCurrency(c) ? c : null;
}

/** Remplace ou ajoute `[OCR_CURRENCY]=XXX` en fin de texte OCR. */
export function mergeOcrCurrencyMarker(ocrBody: string, currency: string): string {
  const c = currency.toUpperCase();
  if (!isValidInvoiceCurrency(c)) return ocrBody;
  const body = String(ocrBody || "").replace(/\n?\[OCR_CURRENCY\]\s*=\s*[A-Z]{3}\s*/gi, "").trimEnd();
  return body ? `${body}\n[OCR_CURRENCY]=${c}` : `[OCR_CURRENCY]=${c}`;
}

/** Indice si la ligne ressemble à un total / TTC / net à payer (pour prioriser la devise à côté du montant). */
function scoreTotalLine(line: string): number {
  let s = 0;
  if (
    /(?:total\s*ttc|montant\s*ttc|\bttc\b|net\s+[àa]\s+payer|total\s+[àa]\s+payer|grand\s+total|amount\s+due|balance\s+due|total\s+due|subtotal|invoice\s+total)/i.test(
      line,
    )
  )
    s += 4;
  if (/(?:total\s*ht|montant\s*ht|\bht\b(?!\w)|sub-?total\s+ht)/i.test(line)) s += 2;
  if (/\d/.test(line)) s += 1;
  return s;
}

/**
 * Détecte la devise sur un fragment (ligne ou bloc) : codes ISO, symboles, FCFA, mots-clés.
 * Retourne null si aucun signal clair.
 */
export function currencyFromFragment(t: string): string | null {
  const f = String(t || "");
  if (!f.trim()) return null;
  if (/\bXAF\b/i.test(f)) return "XAF";
  if (/\bXOF\b/i.test(f)) return "XOF";
  if (/\bGHS\b/i.test(f)) return "GHS";
  if (/\bCNY\b|\bRMB\b|\brenminbi\b/i.test(f)) return "CNY";
  if (/\bGBP\b/i.test(f)) return "GBP";
  if (/\bUSD\b|\bUS\$\b/i.test(f)) return "USD";
  if (/\bEUR\b/i.test(f)) return "EUR";
  if (/₵/.test(f)) return "GHS";
  if (/¥|元/.test(f)) return "CNY";
  if (/£/.test(f)) return "GBP";
  if (/\bFCFA\b|\bF\.CFA\b|\bCFA\b/i.test(f)) {
    const xofCountries =
      /s[ée]n[ée]gal|c[oô]te\s+d.ivoire|mali|burkina|b[ée]nin|togo|niger|guinea.bissau|guinée.bissau/i;
    const xafCountries =
      /cameroun|cameroon|gabon|congo|centrafrique|centrafricain|tchad|guinée\s+[ée]quatoriale|equatorial\s+guinea/i;
    if (xofCountries.test(f)) return "XOF";
    if (xafCountries.test(f)) return "XAF";
    return "XOF";
  }
  if (/\$/.test(f)) return "USD";
  if (/€/.test(f)) return "EUR";
  if (/\byuan\b/i.test(f)) return "CNY";
  if (/\bpound\b|\bsterling\b/i.test(f)) return "GBP";
  if (/\bcedi\b/i.test(f)) return "GHS";
  return null;
}

/**
 * Détection complète : marqueur OCR > lignes de total > reste du document > EUR par défaut.
 */
export function detectCurrencyFromOcrText(raw: string): string {
  const marker = parseOcrCurrencyMarker(raw);
  if (marker) return marker;

  const normalized = String(raw || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  let bestLine: string | null = null;
  let bestScore = 0;
  for (const line of lines) {
    const sc = scoreTotalLine(line);
    if (sc > bestScore) {
      bestScore = sc;
      bestLine = line;
    }
  }
  if (bestLine && bestScore >= 4) {
    const fromLine = currencyFromFragment(bestLine);
    if (fromLine) return fromLine;
  }

  const sorted = lines.map((line) => ({ line, score: scoreTotalLine(line) })).sort((a, b) => b.score - a.score);
  const chunk = sorted.filter((x) => x.score >= 2).slice(0, 8).map((x) => x.line).join("\n");
  const fromChunk = currencyFromFragment(chunk);
  if (fromChunk) return fromChunk;

  const flat = normalized.replace(/\s+/g, " ");
  const fromDoc = currencyFromFragment(flat);
  if (fromDoc) return fromDoc;

  return "EUR";
}

/** Devise uniquement si le texte contient un signal explicite (évite d’écraser le choix utilisateur pour une facture « neutre »). */
export function getExplicitCurrencyFromText(raw: string): string | null {
  const marker = parseOcrCurrencyMarker(raw);
  if (marker) return marker;
  const normalized = String(raw || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  let bestLine: string | null = null;
  let bestScore = 0;
  for (const line of lines) {
    const sc = scoreTotalLine(line);
    if (sc > bestScore) {
      bestScore = sc;
      bestLine = line;
    }
  }
  if (bestLine && bestScore >= 4) {
    const c = currencyFromFragment(bestLine);
    if (c) return c;
  }
  const sorted = lines.map((line) => ({ line, score: scoreTotalLine(line) })).sort((a, b) => b.score - a.score);
  const chunk = sorted.filter((x) => x.score >= 2).slice(0, 8).map((x) => x.line).join("\n");
  const fromChunk = currencyFromFragment(chunk);
  if (fromChunk) return fromChunk;
  return currencyFromFragment(normalized.replace(/\s+/g, " "));
}
