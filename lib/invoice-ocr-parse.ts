/** Normalise un montant OCR (espaces insécables, devise, séparateurs FR/EN). */
export function normalizeOcrAmount(input: string): number | null {
  const n = normalizeOcrAmountRaw(input);
  if (n == null || n <= 0) return null;
  return n;
}

/** Comme normalizeOcrAmount mais accepte 0 (factures gratuites / avoirs). */
export function normalizeOcrAmountAllowZero(input: string): number | null {
  const n = normalizeOcrAmountRaw(input);
  if (n == null || n < 0) return null;
  return n;
}

function normalizeOcrAmountRaw(input: string): number | null {
  const s = String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/[€$£¥₵]/g, "")
    .replace(/\bFCFA\b|\bXAF\b|\bXOF\b|\bGHS\b|\bEUR\b|\bGBP\b|\bUSD\b|\bCNY\b|\bCFA\b|\bBCEAO\b/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
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

/** Pied de page légal (capital social, RCS…) — à exclure des montants facture. */
const LEGAL_FOOTER_RE =
  /capital\s+social|au capital de|share\s+capital|r\.?\s*c\.?\s*s\.?|rcs\b|si[èe]ge\s+social|n[°ºo]?\s*de\s+licence|tva\s+intracom|intracommunautaire|identification.*tva|amazon\s+eu|s\.?à?\s*r\.?\s*l\.?|société anonyme|registered\s+office|company\s+registration|shareholders?\s+equity|\bnif\b|code\s*ape|\bape\s*\d/i;

type ScoredAmount = { value: number; score: number };

function isLegalFooterLine(line: string): boolean {
  return LEGAL_FOOTER_RE.test(line);
}

/** Montant situé après « Capital social / RCS » dans le flux OCR (pied de page). */
function isAfterLegalFooterMarker(flat: string, index: number): boolean {
  const markers = [
    /capital\s+social/i,
    /au capital de/i,
    /r\.?\s*c\.?\s*s\.?\s*luxembourg/i,
    /share\s+capital/i,
    /\brcs\b/i,
    /\bnif\b/i,
    /identification.*tva/i,
    /société anonyme/i,
  ];
  for (const re of markers) {
    const m = flat.match(re);
    if (m && m.index != null && index >= m.index - 5) return true;
  }
  return false;
}

function contextAround(flat: string, index: number, radius = 55): string {
  return flat.slice(Math.max(0, index - radius), Math.min(flat.length, index + radius));
}

/** SIREN/RCS/NIF, capital social, n° IATA/document — pas des montants facture. */
function looksLikeRegistrationOrLegalId(value: string, context: string): boolean {
  const raw = String(value || "").trim();
  const ctx = String(context || "");
  const digits = raw.replace(/\D/g, "");

  if (/capital\s+social|au capital de/i.test(ctx) && digits.length >= 5) return true;
  if (/\brcs\b|siren|siret|\bnif\b|identification.*tva|code\s*ape|\bape\s*\d/i.test(ctx)) {
    if (digits.length === 9 || digits.length === 14) return true;
    if (/^\d{3}\s+\d{3}\s+\d{3}$/.test(raw)) return true;
  }
  if (/\bfr\s*\d{2}\b/i.test(ctx) && digits.length >= 9 && digits.length <= 11) return true;
  if (/iata\s*n/i.test(ctx) && digits.length >= 6 && digits.length <= 10) return true;
  if (/numero du document|num[ée]ro du document|document\s*n[°o]/i.test(ctx) && digits.length >= 10)
    return true;

  return false;
}

function isImplausibleInvoiceAmount(n: number, score: number): boolean {
  if (n <= 0) return false;
  if (n >= 100_000_000) return true;
  if (n > 5_000_000 && score < 85) return true;
  if (n > 500_000 && score < 50) return true;
  return false;
}

function pushScoredAmount(
  list: ScoredAmount[],
  value: string | null | undefined,
  score: number,
  options?: { line?: string; flat?: string; index?: number; allowZero?: boolean },
) {
  const ctx =
    options?.line ??
    (options?.flat != null && options.index != null
      ? contextAround(options.flat, options.index)
      : "");
  if (options?.line && isLegalFooterLine(options.line)) return;
  if (!value) return;
  if (looksLikeRegistrationOrLegalId(value, ctx)) return;
  const n = options?.allowZero ? normalizeOcrAmountAllowZero(value) : normalizeOcrAmount(value);
  if (n == null) return;
  if (n > 0 && isImplausibleInvoiceAmount(n, score)) return;
  list.push({ value: n, score });
}

function parseExplicitLabeledAmount(flat: string, field: "ttc" | "ht"): number | null {
  const patterns =
    field === "ttc"
      ? [
          /(?:net\s+[àa]\s+payer|total\s+[àa]\s+payer|total\s+ttc|montant\s+ttc|facture\s+total)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{0,18})/gi,
        ]
      : [/(?:total\s+ht|montant\s+ht|montant\s+unitaire\s+h\.t\.)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{0,18})/gi];

  for (const re of patterns) {
    for (const m of flat.matchAll(re)) {
      if (isAfterLegalFooterMarker(flat, m.index ?? 0)) continue;
      const ctx = contextAround(flat, m.index ?? 0);
      if (looksLikeRegistrationOrLegalId(m[1] ?? "", ctx)) continue;
      const n = normalizeOcrAmountAllowZero(m[1] ?? "");
      if (n != null) return n;
    }
  }
  return null;
}

function scoreTtcContext(line: string): number {
  if (isLegalFooterLine(line)) return -100;
  let s = 0;
  const l = line.toLowerCase();
  if (/facture\s+total|total\s+[àa]\s+payer|total\s+ttc|montant\s+ttc|net\s+[àa]\s+payer|amount\s+due|balance\s+due|grand\s+total|invoice\s+total/i.test(l))
    s += 70;
  if (/\btotal\s+ttc\b/i.test(l)) s += 55;
  if (/^total\s/i.test(l) && /€|\beur\b|\$|£/i.test(l)) s += 40;
  if (/(?:^|\s)total\b/i.test(l)) s += 25;
  if (/€|\beur\b|\$|£|fcfa|xof|xaf/i.test(l)) s += 8;
  if (/prix\s+unitaire|unit\s+price|capital\s+social|taux\s+tva/i.test(l)) s -= 40;
  return s;
}

function scoreHtContext(line: string): number {
  if (isLegalFooterLine(line)) return -100;
  let s = 0;
  const l = line.toLowerCase();
  if (/total\s+ht|montant\s+ht|total\s+h\.t\./i.test(l)) s += 70;
  if (/\btotal\s+ht\b/i.test(l)) s += 55;
  if (/^total\s/i.test(l) && /€|\beur\b/i.test(l)) s += 35;
  if (/prix\s+unitaire\s+ht|unit\s+price/i.test(l)) s -= 30;
  if (/capital\s+social|taux\s+tva\s*$/i.test(l)) s -= 40;
  return s;
}

function pickBestScoredAmount(candidates: ScoredAmount[]): number | null {
  const valid = candidates.filter((c) => c.score > 0);
  if (valid.length === 0) return null;

  valid.sort((a, b) => b.score - a.score || a.value - b.value);
  const topScore = valid[0]!.score;
  const tier = valid.filter((c) => c.score >= topScore - 8);

  // Montant confirmé plusieurs fois (ex. « 8,87 € » sur page 1 et 2)
  const freq = new Map<number, { score: number; count: number }>();
  for (const c of tier) {
    const rounded = Math.round(c.value * 100) / 100;
    const prev = freq.get(rounded) ?? { score: 0, count: 0 };
    freq.set(rounded, { score: prev.score + c.score, count: prev.count + 1 });
  }
  let bestVal: number | null = null;
  let bestKey = -1;
  for (const [val, meta] of freq) {
    const key = meta.score + meta.count * 15;
    if (key > bestKey) {
      bestKey = key;
      bestVal = val;
    }
  }
  return bestVal;
}

function collectAmountsFromText(
  raw: string,
  field: "ttc" | "ht",
  currencyHint?: string | null,
): ScoredAmount[] {
  const flat = raw.replace(/\s+/g, " ");
  const lines = raw.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const scored: ScoredAmount[] = [];
  const scoreLine = field === "ttc" ? scoreTtcContext : scoreHtContext;

  const labeledPatterns =
    field === "ttc"
      ? [
          /(?:facture\s+total|total\s+[àa]\s+payer|total\s+ttc|montant\s+ttc|net\s+[àa]\s+payer|amount\s+due|balance\s+due|grand\s+total|invoice\s+total)\s*[:\-]?\s*(?:€|\$|£|(?:EUR|USD|GBP|XOF|XAF)\b)?\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
          /(?:^|\n)\s*total\s*[àa]\s+payer\s*\n?\s*([0-9][0-9\s\u00a0.,]{1,18})\s*(?:€|EUR)?/gim,
        ]
      : [
          /(?:total\s+ht|montant\s+ht|total\s+h\.t\.)\s*[:\-]?\s*(?:€|\$|£|(?:EUR|USD|GBP)\b)?\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
          /(?:^|\n)\s*total\s+ht\s*\n?\s*([0-9][0-9\s\u00a0.,]{1,18})\s*(?:€|EUR)?/gim,
        ];

  for (const re of labeledPatterns) {
    for (const m of flat.matchAll(re)) {
      const idx = m.index ?? 0;
      if (isAfterLegalFooterMarker(flat, idx)) continue;
      pushScoredAmount(scored, m[1], field === "ttc" ? 75 : 72, {
        flat,
        index: idx,
        allowZero: true,
      });
    }
  }

  // Tableau récap TVA (Amazon page 2) : ligne « Total » HT + TVA
  if (field === "ht") {
    const dualTotal = flat.match(
      /\btotal\s+([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)\s*([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)/i,
    );
    if (dualTotal?.[1] && !isAfterLegalFooterMarker(flat, dualTotal.index ?? 0)) {
      pushScoredAmount(scored, dualTotal[1], 82, { flat, index: dualTotal.index ?? 0 });
    }
    const tableMatch = flat.match(
      /total\s+ht[\s\S]{0,400}?\btotal\b[^0-9]{0,40}([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)/i,
    );
    if (tableMatch?.[1] && !isAfterLegalFooterMarker(flat, tableMatch.index ?? 0)) {
      pushScoredAmount(scored, tableMatch[1], 75, { flat, index: tableMatch.index ?? 0 });
    }
    const htCol = flat.match(
      /total\s+ht[\s\S]{0,250}?([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)/i,
    );
    if (htCol?.[1] && !isAfterLegalFooterMarker(flat, htCol.index ?? 0)) {
      pushScoredAmount(scored, htCol[1], 70, { flat, index: htCol.index ?? 0 });
    }
  }

  const symbolRe = new RegExp(
    String.raw`(?:^|[^\w])(?:${OCR_CURRENCY_SYMBOLS})\s*([0-9][0-9\s\u00a0.,]{1,18})`,
    "gi",
  );
  for (const m of flat.matchAll(symbolRe)) {
    if (isAfterLegalFooterMarker(flat, m.index ?? 0)) continue;
    const ctxStart = Math.max(0, (m.index ?? 0) - 80);
    const ctx = flat.slice(ctxStart, (m.index ?? 0) + 40);
    const lineScore = scoreLine(ctx);
    if (lineScore > 0)
      pushScoredAmount(scored, m[1], lineScore, { flat, index: m.index ?? 0 });
  }

  const beforeCodeRe = new RegExp(
    String.raw`\b([0-9][0-9\s\u00a0.,]{1,18})\s*(?:${OCR_CURRENCY_CODES}|${OCR_CURRENCY_SYMBOLS})\b`,
    "gi",
  );
  for (const m of flat.matchAll(beforeCodeRe)) {
    if (isAfterLegalFooterMarker(flat, m.index ?? 0)) continue;
    const ctxStart = Math.max(0, (m.index ?? 0) - 80);
    const ctx = flat.slice(ctxStart, (m.index ?? 0) + 40);
    if (/capital\s+social|au capital de/i.test(ctx)) continue;
    const lineScore = scoreLine(ctx);
    if (lineScore > 0)
      pushScoredAmount(scored, m[1], lineScore, { flat, index: m.index ?? 0 });
    else if (field === "ttc" && /facture\s+total|total\s+[àa]\s+payer/i.test(ctx)) {
      pushScoredAmount(scored, m[1], 65, { flat, index: m.index ?? 0 });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prev = lines[i - 1] ?? "";
    const combined = `${prev} ${line}`;
    const lineScore = scoreLine(combined);
    if (lineScore <= 0) continue;

    const sym = line.match(
      new RegExp(String.raw`(?:^|[^\w])(?:${OCR_CURRENCY_SYMBOLS})\s*([0-9][0-9\s\u00a0.,]{1,18})`),
    );
    pushScoredAmount(scored, sym?.[1], lineScore + 5, { line });

    const plain = line.match(/^([0-9][0-9\s\u00a0.,]{1,18})\s*(?:€|EUR|USD|GBP|FCFA|XOF|XAF)?$/i);
    pushScoredAmount(scored, plain?.[1], lineScore + 3, { line });

    if (/^total\s/i.test(line)) {
      const inline = line.match(/([0-9][0-9\s\u00a0.,]{1,18})\s*(?:€|EUR)?/i);
      pushScoredAmount(scored, inline?.[1], lineScore + 10, { line, allowZero: true });
    }
  }

  if (currencyHint && field === "ttc") {
    const hint = currencyHint.toUpperCase();
    const hintRe = new RegExp(
      String.raw`\b${hint}\s*([0-9][0-9\s\u00a0.,]{1,18})|([0-9][0-9\s\u00a0.,]{1,18})\s*\b${hint}\b`,
      "gi",
    );
    for (const m of flat.matchAll(hintRe)) {
      if (isAfterLegalFooterMarker(flat, m.index ?? 0)) continue;
      pushScoredAmount(scored, m[1] || m[2], 15, { flat, index: m.index ?? 0 });
    }
  }

  return scored;
}

/** Extrait le montant TTC le plus probable (priorité libellés facture, exclusion pied de page). */
export function parseMontantTTCFromOcr(text: string, currencyHint?: string | null): number | null {
  const raw = String(text || "");
  const explicit = parseExplicitLabeledAmount(raw.replace(/\s+/g, " "), "ttc");
  if (explicit != null) return explicit;
  return pickBestScoredAmount(collectAmountsFromText(raw, "ttc", currencyHint));
}

/** Extrait le montant HT (Total HT, tableau TVA…). */
export function parseMontantHTFromOcr(text: string): number | null {
  const raw = String(text || "");
  const flat = raw.replace(/\s+/g, " ");

  const explicit = parseExplicitLabeledAmount(flat, "ht");
  if (explicit != null) return explicit;

  // Ligne récap « Total 7,39 € 1,48 € » (HT + TVA) — Amazon, etc.
  const dualTotal = flat.match(
    /\btotal\s+([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)\s*([0-9][0-9\s\u00a0.,]{1,12})\s*(?:€|eur)/i,
  );
  if (dualTotal?.[1] && !isAfterLegalFooterMarker(flat, dualTotal.index ?? 0)) {
    const n = normalizeOcrAmount(dualTotal[1]);
    if (n != null) return n;
  }

  const htAfterLabel = flat.match(
    /(?:total\s+ht|montant\s+ht|montant\s+unitaire\s+h\.t\.)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{0,12})/i,
  );
  if (htAfterLabel?.[1] && !isAfterLegalFooterMarker(flat, htAfterLabel.index ?? 0)) {
    const ctx = contextAround(flat, htAfterLabel.index ?? 0);
    if (!looksLikeRegistrationOrLegalId(htAfterLabel[1], ctx)) {
      const n = normalizeOcrAmountAllowZero(htAfterLabel[1]);
      if (n != null) return n;
    }
  }

  return pickBestScoredAmount(collectAmountsFromText(raw, "ht"));
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
  const fromLabel = labeledAmountStr
    ? normalizeOcrAmountAllowZero(labeledAmountStr)
    : null;
  const ctx = options?.labeledContext ?? raw;

  if (fromHeuristic != null && fromLabel != null) {
    const explicitTtc =
      /(?:facture\s+total|total\s+ttc|montant\s+ttc|\bttc\b|net\s+[àa]\s+payer|total\s+[àa]\s+payer)/i.test(ctx);
    if (explicitTtc && fromLabel >= 0) return fromLabel;
    if (fromLabel < 10 && fromHeuristic >= 10) return fromHeuristic;
    if (fromHeuristic < 10 && fromLabel >= 10) return fromLabel;
    // Ne pas préférer le plus grand (capital social) — garder le montant étiqueté ou heuristique
    if (/capital\s+social/i.test(ctx) && fromHeuristic < fromLabel) return fromHeuristic;
    return fromHeuristic;
  }
  return fromHeuristic ?? fromLabel;
}

export function resolveMontantHTFromOcr(
  raw: string,
  labeledAmountStr: string | null,
): number | null {
  const fromHeuristic = parseMontantHTFromOcr(raw);
  const fromLabel = labeledAmountStr
    ? normalizeOcrAmountAllowZero(labeledAmountStr)
    : null;
  if (fromHeuristic != null && fromLabel != null) {
    if (/total\s+ht|montant\s+ht|montant\s+unitaire\s+h\.t\./i.test(raw) && fromLabel >= 0)
      return fromLabel;
    return fromHeuristic;
  }
  return fromHeuristic ?? fromLabel;
}
