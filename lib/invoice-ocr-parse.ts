/** Normalise un montant OCR (espaces insécables, devise, séparateurs FR/EN). */
export function normalizeOcrAmount(input: string): number | null {
  const s = String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/[€$£¥₵]/g, "")
    .replace(/\bFCFA\b|\bXAF\b|\bXOF\b|\bGHS\b|\bEUR\b|\bGBP\b|\bUSD\b|\bCNY\b|\bCFA\b|\bBCEAO\b/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const FOURNISSEUR_SKIP =
  /^(ici|l'|l’|ac|el|a|e|de|ent|pai|pé|ma|auto|☑|☐|ob|cette|direction|date|compte|crédit|credit|montant|dépositeur|depositeur|numéro|numero|narration|vers|the|bank|pan|african|terminé|termine|succès|succes|avec|depot|dépôt|transaction|référence|reference)$/i;

const FOURNISSEUR_BOOST =
  /\b(assurances?|banque|bank|ecobank|sarl|sasu|sas|sa\b|eurl|ltd|gmbh|corp|cashxpress|sunu|orange|mtn|moov|togocel)\b/i;

function isLikelyFournisseurLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return false;
  if (FOURNISSEUR_SKIP.test(t)) return false;
  if (/^(facture|invoice|reçu|receipt)\b/i.test(t)) return false;
  if (/(siret|tva\s*intracom|iban|bic|rccm|rcs)\b/i.test(t)) return false;
  const digits = t.match(/\d/g)?.length || 0;
  if (digits > Math.max(6, Math.floor(t.length / 2))) return false;
  if (/^\d[\d\s./-]{8,}$/.test(t)) return false;
  if (t.split(/\s+/).length === 1 && t.length < 8 && !FOURNISSEUR_BOOST.test(t)) return false;
  return true;
}

/** Détecte le nom fournisseur / émetteur depuis le texte OCR. */
export function parseFournisseurFromOcr(text: string, originalName?: string): string | null {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let best: { line: string; score: number } | null = null;
  for (const line of lines) {
    if (!isLikelyFournisseurLine(line)) continue;
    let score = Math.min(line.length, 80);
    if (FOURNISSEUR_BOOST.test(line)) score += 40;
    if (/[A-ZÀ-Ü]{2,}/.test(line) && line.length >= 12) score += 15;
    if (!best || score > best.score) best = { line, score };
  }

  if (best) return best.line.slice(0, 120);

  const base = String(originalName || "").replace(/\.(pdf|png|jpg|jpeg|webp)$/i, "").trim();
  return base && base.length <= 80 ? base : null;
}

const OCR_CURRENCY_CODES =
  "XOF|XAF|EUR|USD|GBP|GHS|FCFA|CFA|F\\.CFA";
const OCR_CURRENCY_SYMBOLS = "€|\\$|£|₵|¥";

/** Symbole monétaire en tête de fragment (£440 — \\b ne matche pas avant £). */
const RE_AMOUNT_AFTER_SYMBOL = new RegExp(
  String.raw`(?:^|[^\w])(${OCR_CURRENCY_SYMBOLS})\s*([0-9][0-9\s\u00a0.,]{1,18})`,
  "gi",
);

const RE_AMOUNT_BEFORE_CODE = new RegExp(
  String.raw`\b([0-9][0-9\s\u00a0.,]{1,18})\s*(?:${OCR_CURRENCY_CODES}|${OCR_CURRENCY_SYMBOLS})\b`,
  "gi",
);

const RE_AMOUNT_AFTER_CODE = new RegExp(
  String.raw`\b(?:${OCR_CURRENCY_CODES})\s*([0-9][0-9\s\u00a0.,]{1,18})`,
  "gi",
);

const RE_LABELED_AMOUNT = new RegExp(
  String.raw`(?:montant(?:\s+ttc)?|total\s+ttc|ttc|net\s+[àa]\s+payer|amount\s+due|balance\s+due|grand\s+total|invoice\s+total|total|amount|payment|paid|subtotal)\s*[:\-]?\s*(?:${OCR_CURRENCY_CODES}|${OCR_CURRENCY_SYMBOLS})?\s*([0-9][0-9\s\u00a0.,]{1,18})`,
  "gi",
);

function pushOcrAmount(candidates: number[], value: string | null | undefined) {
  if (!value) return;
  const n = normalizeOcrAmount(value);
  if (n != null && n >= 1) candidates.push(n);
}

function scoreAmountLine(line: string): number {
  let s = 0;
  if (
    /(?:total\s*ttc|montant\s*ttc|\bttc\b|net\s+[àa]\s+payer|total\s+[àa]\s+payer|grand\s+total|amount\s+due|balance\s+due|invoice\s+total)/i.test(
      line,
    )
  )
    s += 5;
  if (/(?:^|\s)(?:total|amount|payment|paid|subtotal)\b/i.test(line)) s += 3;
  if (new RegExp(OCR_CURRENCY_SYMBOLS).test(line) || new RegExp(`\\b(?:${OCR_CURRENCY_CODES})\\b`, "i").test(line))
    s += 2;
  if (/\d/.test(line)) s += 1;
  return s;
}

function pickBestAmount(candidates: number[]): number | null {
  const plausible = candidates.filter((n) => n >= 10 && n <= 999_999_999);
  if (plausible.length > 0) return Math.max(...plausible);
  const small = candidates.filter((n) => n >= 1 && n <= 999_999_999);
  return small.length ? Math.max(...small) : null;
}

/** Extrait le montant TTC le plus probable (priorité montant avec devise). */
export function parseMontantTTCFromOcr(text: string, currencyHint?: string | null): number | null {
  const raw = String(text || "");
  const flat = raw.replace(/\s+/g, " ");
  const candidates: number[] = [];

  for (const re of [
    RE_AMOUNT_AFTER_SYMBOL,
    RE_AMOUNT_AFTER_CODE,
    RE_AMOUNT_BEFORE_CODE,
    RE_LABELED_AMOUNT,
    /(?:montant(?:\s+ttc)?|total\s+ttc|ttc|net\s+[àa]\s+payer|amount\s+due|balance\s+due)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
    /(?:^|\n)\s*montant\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{2,18})/gim,
    /(?:prime|cotisation|contribution|premium|assurance)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
    /(?:^|\n)\s*([0-9][0-9\s\u00a0.,]{2,18})\s*(?:FCFA|CFA|XOF|XAF)\b/gim,
  ]) {
    for (const m of flat.matchAll(re)) {
      const amountGroup = m.length >= 3 && /^\d/.test(String(m[2] || "")) ? m[2] : m[1];
      pushOcrAmount(candidates, amountGroup);
    }
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const codeLine = trimmed.match(
      new RegExp(String.raw`^(?:${OCR_CURRENCY_CODES})\s+([0-9][0-9\s\u00a0.,]+)$`, "i"),
    );
    pushOcrAmount(candidates, codeLine?.[1]);

    const symbolLine = trimmed.match(
      new RegExp(String.raw`^(?:${OCR_CURRENCY_SYMBOLS})\s*([0-9][0-9\s\u00a0.,]+)$`),
    );
    pushOcrAmount(candidates, symbolLine?.[1]);

    if (scoreAmountLine(trimmed) >= 3) {
      const sym = trimmed.match(
        new RegExp(String.raw`(?:^|[^\w])(?:${OCR_CURRENCY_SYMBOLS})\s*([0-9][0-9\s\u00a0.,]{1,18})`),
      );
      pushOcrAmount(candidates, sym?.[1]);

      const labeled = trimmed.match(
        /(?:total|amount|payment|paid|due|balance|ttc|subtotal)\s*[:\-]?\s*(?:[A-Z]{3}|€|\$|£|₵)?\s*([0-9][0-9\s\u00a0.,]{1,18})/i,
      );
      pushOcrAmount(candidates, labeled?.[1]);
    }
  }

  if (currencyHint) {
    const hint = currencyHint.toUpperCase();
    const hintPattern = new RegExp(
      String.raw`\b${hint}\s*([0-9][0-9\s\u00a0.,]{1,18})|([0-9][0-9\s\u00a0.,]{1,18})\s*\b${hint}\b`,
      "gi",
    );
    for (const m of flat.matchAll(hintPattern)) {
      pushOcrAmount(candidates, m[1] || m[2]);
    }
  }

  return pickBestAmount(candidates);
}

export function parseMontantTTCStringFromOcr(text: string): string | null {
  const n = parseMontantTTCFromOcr(text);
  return n != null ? String(n) : null;
}

/**
 * Fusionne montant issu d'une étiquette (Total TTC…) et heuristique devise/ligne.
 * Évite de conserver un « TTC 1 » OCR alors qu'un « XOF 2 500,00 » est présent.
 */
export function resolveMontantTTCFromOcr(
  raw: string,
  labeledAmountStr: string | null,
  options?: { labeledContext?: string; currencyHint?: string | null },
): number | null {
  const fromHeuristic = parseMontantTTCFromOcr(raw, options?.currencyHint);
  const fromLabel = labeledAmountStr ? normalizeOcrAmount(labeledAmountStr) : null;
  const ctx = options?.labeledContext ?? raw;

  if (fromHeuristic != null && fromLabel != null) {
    const explicitTtc = /(?:total\s+ttc|montant\s+ttc|\bttc\b|net\s+[àa]\s+payer|total\s+[àa]\s+payer)/i.test(ctx);
    if (explicitTtc && fromLabel >= 10 && fromLabel >= fromHeuristic * 0.85) return fromLabel;
    if (fromLabel < 10 && fromHeuristic >= 10) return fromHeuristic;
    return Math.max(fromHeuristic, fromLabel);
  }
  return fromHeuristic ?? fromLabel;
}
