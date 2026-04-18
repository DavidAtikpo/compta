/**
 * API Judilibre (Cour de cassation / ordre judiciaire) via PISTE.
 * Clé : PISTE_JUDILIBRE_KEY_ID (affichée dans votre application PISTE après souscription).
 * Sandbox : PISTE_SANDBOX=1
 * @see https://github.com/Cour-de-cassation/judilibre-search
 */

export interface JudilibreSearchHit {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
}

function judilibreBaseUrl(): string {
  if (process.env.PISTE_SANDBOX === "1" || process.env.PISTE_SANDBOX === "true") {
    return "https://sandbox-api.piste.gouv.fr/cassation/judilibre/v1.0";
  }
  return "https://api.piste.gouv.fr/cassation/judilibre/v1.0";
}

function legifranceSearchUrl(ecli: string): string {
  const q = encodeURIComponent(ecli);
  return `https://www.legifrance.gouv.fr/search/juri?tab_selection=juri&searchField=ALL&query=${q}`;
}

interface JudilibreApiResult {
  id?: string;
  ecli?: string;
  number?: string;
  summary?: string;
  text?: string;
  decision_date?: string;
}

interface JudilibreSearchResponse {
  results?: JudilibreApiResult[];
}

async function searchOnce(
  keyId: string,
  query: string,
  pageSize: number,
): Promise<JudilibreApiResult[]> {
  const base = judilibreBaseUrl();
  const url = new URL(`${base}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("page", "0");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      KeyId: keyId,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    console.error("Judilibre search:", res.status, await res.text().catch(() => ""));
    return [];
  }

  const data = (await res.json()) as JudilibreSearchResponse;
  return data.results ?? [];
}

function toHit(r: JudilibreApiResult): JudilibreSearchHit | null {
  const ecli = r.ecli?.trim();
  const summary = (r.summary || "").trim();
  const num = (r.number || "").trim();
  const title =
    summary.slice(0, 180) ||
    (ecli ? `Décision ${ecli}` : num ? `Pourvoi ${num}` : "Décision Judilibre");
  const descSource = summary || (r.text || "").replace(/\s+/g, " ").trim();
  const description = descSource.slice(0, 320);
  const link = ecli ? legifranceSearchUrl(ecli) : "https://www.courdecassation.fr/recherche-judilibre";
  const pubDate = r.decision_date || new Date().toISOString().slice(0, 10);
  if (!title) return null;
  return {
    title: ecli ? `[Judilibre] ${ecli}` : `[Judilibre] ${title.slice(0, 120)}`,
    description,
    link,
    pubDate,
    source: "judilibre.courdecassation.fr",
  };
}

/** Requêtes ciblées fiscalité / entreprise (résultats réels API PISTE). */
const FISCAL_QUERIES = [
  "TVA déductible",
  "abus de droit fiscal",
  "contrôle fiscal",
  "requalification revenu",
  "intégration fiscale société",
];

export async function fetchJudilibreFiscalHits(
  keyId: string,
  maxTotal = 12,
): Promise<JudilibreSearchHit[]> {
  const seen = new Set<string>();
  const hits: JudilibreSearchHit[] = [];

  for (const q of FISCAL_QUERIES) {
    if (hits.length >= maxTotal) break;
    const results = await searchOnce(keyId, q, 4);
    for (const r of results) {
      const key = (r.ecli || r.id || r.number || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const hit = toHit(r);
      if (hit) hits.push(hit);
      if (hits.length >= maxTotal) break;
    }
  }

  return hits;
}
