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

/** Extrait le montant TTC le plus probable (priorité montant avec devise). */
export function parseMontantTTCFromOcr(text: string): number | null {
  const raw = String(text || "");
  const flat = raw.replace(/\s+/g, " ");

  const candidates: number[] = [];
  const pushMatch = (m: RegExpMatchArray | null) => {
    if (!m?.[1]) return;
    const n = normalizeOcrAmount(m[1]);
    if (n != null && n >= 1) candidates.push(n);
  };

  const patterns: RegExp[] = [
    /\b(?:XOF|XAF|EUR|USD|GBP|GHS|FCFA|CFA|F\.CFA|€|\$|£|₵)\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
    /\b([0-9][0-9\s\u00a0.,]{1,18})\s*(?:XOF|XAF|EUR|USD|GBP|GHS|FCFA|CFA|F\.CFA|€|\$|£|₵)\b/gi,
    /(?:montant(?:\s+ttc)?|total\s+ttc|ttc|net\s+[àa]\s+payer|amount\s+due|balance\s+due)\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{1,18})/gi,
    /(?:^|\n)\s*montant\s*[:\-]?\s*([0-9][0-9\s\u00a0.,]{2,18})/gim,
  ];

  for (const re of patterns) {
    for (const m of flat.matchAll(re)) pushMatch(m);
  }

  // Lignes du type « XOF 2 500,00 » sur une ligne seule
  for (const line of raw.split("\n")) {
    const m = line.trim().match(
      /^(?:XOF|XAF|EUR|USD|GBP|GHS|FCFA|CFA)\s+([0-9][0-9\s\u00a0.,]+)$/i,
    );
    pushMatch(m);
  }

  const plausible = candidates.filter((n) => n >= 10 && n <= 999_999_999);
  if (plausible.length === 0) {
    const small = candidates.filter((n) => n >= 1 && n <= 999_999_999);
    return small.length ? Math.max(...small) : null;
  }
  return Math.max(...plausible);
}

export function parseMontantTTCStringFromOcr(text: string): string | null {
  const n = parseMontantTTCFromOcr(text);
  return n != null ? String(n) : null;
}
