import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUserId } from "../../../lib/auth-request";
import { pool } from "../../../lib/postgres";
import { SQL_TABLES } from "../../../lib/sql-tables";

type Provider = "openai" | "claude" | "perplexity";
type Usage = { inputTokens: number; outputTokens: number; model: string };
type AiCallResult = { answer: string; usage: Usage };

const CREDIT_EUR = 0.01;
const PROVIDER_MULTIPLIER: Record<Provider, number> = {
  openai: 3,
  claude: 3.5,
  perplexity: 4,
};

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const body = await request.json();
  const region: string = body.region || "france";
  const prompt: string = body.prompt || "Optimise ma fiscalité comptable.";
  const invoiceId: string | undefined = body.invoiceId;
  const ocrText: string | undefined = body.ocrText;
  const businessType: string = body.businessType || "entreprise";
  const context: string = body.context || "";
  const provider: Provider = body.provider === "claude" ? "claude"
    : body.provider === "perplexity" ? "perplexity"
    : "openai";
  const conversationHistory: Array<{ role: string; content: string }> =
    Array.isArray(body.history) ? body.history : [];

  if (invoiceId) {
    const own = await pool.query(
      `SELECT id FROM ${SQL_TABLES.invoices} WHERE id = $1 AND "userId" = $2`,
      [invoiceId, userId],
    );
    if (own.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }
  }

  const systemMessage = buildSystemMessage(region, businessType);

  const userMessage = `Type d'entreprise / situation : ${businessType}
Pays / Région fiscal : ${region}
${ocrText ? `\nTexte OCR / facture :\n${ocrText.slice(0, 3000)}` : ""}
${context ? `\nContexte supplémentaire :\n${context}` : ""}

Question / Demande d'optimisation :
${prompt}

Donne une réponse STRUCTURÉE, PRÉCISE et ACTIONNÉE avec chiffres, taux actuels et textes de loi.`;

  const userBalanceRes = await pool.query(
    `SELECT "aiCreditsBalance" FROM ${SQL_TABLES.user} WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const availableCredits = Number(userBalanceRes.rows[0]?.aiCreditsBalance ?? 0);
  if (!Number.isFinite(availableCredits) || availableCredits <= 0) {
    return NextResponse.json(
      { error: "Crédits IA insuffisants. Rechargez votre compte pour continuer.", code: "INSUFFICIENT_CREDITS" },
      { status: 402 },
    );
  }

  let aiResult: AiCallResult;

  try {
    if (provider === "claude") {
      aiResult = await callClaude(systemMessage, conversationHistory, userMessage);
    } else if (provider === "perplexity") {
      aiResult = await callPerplexity(systemMessage, conversationHistory, userMessage);
    } else {
      aiResult = await callOpenAI(systemMessage, conversationHistory, userMessage);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const answer = aiResult.answer;
  const usage = aiResult.usage;
  const estimatedCost = estimateCostEur(provider, usage.inputTokens, usage.outputTokens);
  const creditsToDebit = Math.max(1, Math.ceil((estimatedCost * PROVIDER_MULTIPLIER[provider]) / CREDIT_EUR));

  const debitRes = await pool.query(
    `UPDATE ${SQL_TABLES.user}
     SET "aiCreditsBalance" = "aiCreditsBalance" - $2, "updatedAt" = NOW()
     WHERE id = $1 AND "aiCreditsBalance" >= $2
     RETURNING "aiCreditsBalance"`,
    [userId, creditsToDebit],
  );
  if (debitRes.rows.length === 0) {
    return NextResponse.json(
      { error: "Crédits IA insuffisants pour cette requête.", code: "INSUFFICIENT_CREDITS" },
      { status: 402 },
    );
  }

  try {
    await pool.query(
      `INSERT INTO ${SQL_TABLES.aiOptimizations} (id, "userId", "invoiceId", prompt, response, region, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [userId ?? null, invoiceId ?? null, prompt, answer, region],
    );
  } catch { /* non-bloquant */ }

  try {
    await pool.query(
      `INSERT INTO ${SQL_TABLES.aiUsageLogs} (id, "userId", provider, model, "promptChars", "responseChars", "inputTokens", "outputTokens", "estimatedCost", "creditsDebited", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [userId, provider, usage.model, userMessage.length, answer.length, usage.inputTokens, usage.outputTokens, estimatedCost, creditsToDebit],
    );
  } catch { /* non-bloquant */ }

  return NextResponse.json({
    answer,
    billing: {
      provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCost,
      creditsDebited: creditsToDebit,
      creditsRemaining: Number(debitRes.rows[0].aiCreditsBalance ?? 0),
    },
  });
}

/* ─── OpenAI ─────────────────────────────────────────────────────────────── */
async function callOpenAI(
  system: string,
  history: Array<{ role: string; content: string }>,
  userMsg: string,
): Promise<AiCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurée dans .env");

  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMsg },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o", messages, temperature: 0.2, max_tokens: 4000 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  return {
    answer: payload?.choices?.[0]?.message?.content || "Aucune réponse.",
    usage: {
      inputTokens: Number(payload?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(payload?.usage?.completion_tokens ?? 0),
      model: String(payload?.model || "gpt-4o"),
    },
  };
}

/* ─── Anthropic Claude ────────────────────────────────────────────────────── */
async function callClaude(
  system: string,
  history: Array<{ role: string; content: string }>,
  userMsg: string,
): Promise<AiCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée. Ajoutez-la dans votre fichier .env");

  const messages = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMsg },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      system,
      messages,
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  return {
    answer: payload?.content?.[0]?.text || "Aucune réponse.",
    usage: {
      inputTokens: Number(payload?.usage?.input_tokens ?? 0),
      outputTokens: Number(payload?.usage?.output_tokens ?? 0),
      model: String(payload?.model || "claude-opus-4-5"),
    },
  };
}

/* ─── Perplexity ──────────────────────────────────────────────────────────── */
async function callPerplexity(
  system: string,
  history: Array<{ role: string; content: string }>,
  userMsg: string,
): Promise<AiCallResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY non configurée. Ajoutez-la dans votre fichier .env");

  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMsg },
  ];

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages,
      temperature: 0.2,
      max_tokens: 4000,
      search_recency_filter: "month",
    }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  return {
    answer: payload?.choices?.[0]?.message?.content || "Aucune réponse.",
    usage: {
      inputTokens: Number(payload?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(payload?.usage?.completion_tokens ?? 0),
      model: String(payload?.model || "llama-3.1-sonar-large-128k-online"),
    },
  };
}

function estimateCostEur(provider: Provider, inputTokens: number, outputTokens: number): number {
  const safeIn = Math.max(0, inputTokens);
  const safeOut = Math.max(0, outputTokens);

  if (provider === "openai") {
    return (safeIn / 1_000_000) * 5 + (safeOut / 1_000_000) * 15;
  }
  if (provider === "claude") {
    return (safeIn / 1_000_000) * 15 + (safeOut / 1_000_000) * 75;
  }
  return (safeIn / 1_000_000) * 5 + (safeOut / 1_000_000) * 20;
}

/* ─── System Prompt ───────────────────────────────────────────────────────── */
function buildSystemMessage(region: string, businessType: string): string {
  const year = new Date().getFullYear();
  return `Tu es un expert en fiscalité internationale de haut niveau, spécialisé dans l'optimisation des structures holding, la remontée de dividendes entre pays et la fiscalité française. Tu travailles pour des entrepreneurs multi-pays.

## TON OBJECTIF PRINCIPAL
Aider à trouver le pays optimal pour implanter une holding ou société-mère afin de :
1. Minimiser la retenue à la source (WHT) sur les dividendes remontés depuis la France (cible : ≤ 5%)
2. Minimiser l'impôt local sur les dividendes dans le pays de destination (cible : ≤ 10%)
3. Garantir une structure légale, non abusive, durable et conforme au droit OCDE/BEPS
4. Fournir des conseils fiscaux France complets (IR, IS, TVA, charges, optimisations légales)

## DONNÉES FISCALES FRANCE ${year}

### Impôt sur le Revenu (IR) — Barème ${year}
- 0% : jusqu'à 11 497 €
- 11% : 11 498 € à 29 315 €
- 30% : 29 316 € à 83 823 €
- 41% : 83 824 € à 180 294 €
- 45% : au-delà de 180 294 €
- Flat tax (PFU) dividendes : 30% (12,8% IR + 17,2% PS)
- Abattement 40% dividendes si option barème IR

### IS France
- Taux réduit PME : 15% jusqu'à 42 500 € (CA < 10 M€, capital entièrement libéré)
- Taux normal : 25%
- Contribution sociale IS : 3,3% au-delà de 763 000 € de bénéfice

### TVA France
- 20% normal, 10% intermédiaire, 5,5% réduit, 2,1% super-réduit
- Franchise CA < 37 500 € (prestations) / 85 000 € (ventes) en 2025

### Retenue à la source France sur dividendes versés à l'étranger (sans convention : 30%)

## CONVENTIONS FISCALES FRANCE — RETENUE À LA SOURCE DIVIDENDES (WHT)

### WHT ≤ 5% (favorable — cible atteinte)
| Pays | WHT dividendes | Condition | IS local | Div. locaux | Total approx. |
|------|---------------|-----------|----------|-------------|---------------|
| Bulgarie | 5% | participation ≥ 10% | 10% | 5% | ~10% total |
| Luxembourg | 5% | participation ≥ 10% | 17-24% | 0% (holding SOPARFI) | ~5-7% |
| Pays-Bas | 5% | participation ≥ 10% | 15-25,8% | 15% | ~20% |
| Singapour | 5% | participation ≥ 10% (conv. 2015) | 17% | 0% | ~5% |
| Île Maurice | 5% | convention 2011 | 3-15% | 0% | ~5% |
| Malte | 5% | participation ≥ 10% | 5% net (remboursement) | 0-5% | ~5-10% |
| Émirats Arabes Unis | 0% | convention 1989 | 0% Free Zone | 0% | ~0% |
| Qatar | 0% | convention 2008 | 0-10% | 0% | ~0% |
| Bahreïn | 0% | convention 2010 | 0% | 0% | ~0% |
| Géorgie | 0-5% | convention 2009 | 15% | 5% | ~10% |
| Suisse | 5% | participation ≥ 10% | 8,5-14,5% | 35% (remboursable) | ~5% net |

### WHT 7,5-15% (moins favorable)
| Pays | WHT | Condition |
|------|-----|-----------|
| Maroc | 7,5% | participation ≥ 25% (15% sinon) |
| Tunisie | 0% | entre sociétés (convention 1973) |
| Algérie | 15% | convention 1982 |
| Sénégal | 15% | participation ≥ 10% |
| Côte d'Ivoire | 15% | |
| Cameroun | 15% | |
| Belgique | 5% | participation ≥ 25% (15% sinon) |
| Espagne | 10% | participation ≥ 25% (15% sinon) |
| Portugal | 5% | participation ≥ 25% (15% sinon) |
| Chypre | 10% | |
| Pologne | 5% | participation ≥ 10% (15% sinon) |

### Pas de convention fiscale France (WHT = 30% standard)
- Cambodge : AUCUNE CONVENTION (négociations en cours 2024-2025, pas encore ratifiée)
- Thaïlande : convention signée 1974, WHT 20% dividendes
- Hong Kong : WHT 30% (pas de convention)
- Vietnam : WHT 30% (pas de convention générale)
- Togo : WHT 30% (pas de convention dividendes)

## ANALYSE PAYS PAR PAYS — DÉTAIL

### 🇧🇬 BULGARIE (recommandation EU #1)
- Convention France-Bulgarie (signée 1988, en vigueur) : WHT 5% si participation ≥ 10%, sinon 10%
- IS Bulgarie : 10% (plus bas de l'UE)
- Dividendes locaux : 5% (retenue libératoire)
- Avantages : membre UE, directive mère-fille applicable (0% WHT si ≥ 10% et durée 2 ans), droit communautaire, réseau bancaire EU, coût vie bas, facilité création société
- Risques : substance économique requise (BEPS Action 5-6), ne pas créer une coquille vide
- Coût réel : France→Bulgarie : 5% WHT + 5% div. = ~10% total (ou 0% via directive mère-fille)
- Délai création : 2-4 semaines, capital minimum 2 BGN (~1 €)
- Recommandé si : activité réelle ou présence physique possible

### 🇲🇺 ÎLE MAURICE (recommandation hors-EU)
- Convention France-Maurice (signée 2011) : WHT 5%
- IS Maurice : 3% (zone franche), 15% standard
- Dividendes locaux : EXONÉRÉS (0%)
- Avantages : 0% sur dividendes locaux, hub financier reconnu, droit anglais, anglophone
- Risques : liste grise OCDE parfois (suivi FATF), substance économique requise, coût de structure plus élevé qu'EU
- Coût réel : France→Maurice : 5% WHT + 0% div. = ~5% total
- Recommandé si : activité Afrique/Asie, holding pure

### 🇦🇪 ÉMIRATS ARABES UNIS (Dubai / Abu Dhabi)
- Convention France-EAU (signée 1989) : 0% WHT sur dividendes
- IS Free Zones : 0% (pendant 15-50 ans selon zone)
- IS hors Free Zone : 9% depuis 2023
- Dividendes : 0%
- Avantages : 0% partout, hub international majeur, infrastructure excellente
- Risques : potentiellement sur liste noire UE, substance économique très stricte (ESR), coût de vie élevé, nécessite présence physique réelle
- Coût réel : 0% total (si conditions substance remplies)

### 🇰🇭 CAMBODGE — SITUATION 2025 (À NE PAS UTILISER MAINTENANT)
- Aucune convention fiscale France-Cambodge à ce jour (avril 2025)
- WHT actuelle : 30% (retenue source standard France)
- Négociations : des discussions existent entre la France et le Cambodge mais AUCUN ACCORD SIGNÉ ni en cours de ratification à la date d'avril 2025 à l'Assemblée nationale française
- IS Cambodge : 20% standard, 0% zone économique spéciale
- Dividendes Cambodge : 14%
- Recommandation : NE PAS STRUCTURER VERS LE CAMBODGE ACTUELLEMENT — coût total trop élevé (30%+14%) et risque juridique. Surveiller le JO français pour signature d'une convention.
- Quand structurer : UNIQUEMENT après ratification d'une convention avec WHT favorable (espéré ≤ 5-10%)

### 🇲🇦 MAROC (Maghreb — meilleur de la région)
- Convention France-Maroc (1970, mise à jour) : WHT 7,5% si participation ≥ 25%, 15% sinon
- IS Maroc : 20% (< 100 M MAD), 26-35% au-delà
- Dividendes locaux : 15%
- Avantages : proximité, francophone, accord avec France, ZLECAF
- Inconvénients : taux moins compétitifs que Bulgarie

### 🇹🇳 TUNISIE (Maghreb)
- Convention France-Tunisie (1973) : 0% WHT dividendes entre sociétés
- IS Tunisie : 15% (exportateurs), 25% standard
- Dividendes locaux : 0% si réinvestis, 10% sinon
- Avantages : 0% WHT, faible coût, francophone
- Inconvénients : instabilité politique, remontée des fonds parfois complexe

### 🇩🇿 ALGÉRIE
- Convention France-Algérie (1982) : WHT 15%
- IS Algérie : 19-26%
- Moins avantageux — à éviter pour optimisation dividendes

## STRATÉGIE RECOMMANDÉE PAR OBJECTIF

### Objectif : minimum WHT + minimum impôt local (coût total ≤ 5-10%)
1. **Bulgarie** : 5% WHT + 5% div. = 10% (ou 0% via directive mère-fille EU si ≥ 2 ans)
2. **Île Maurice** : 5% WHT + 0% div. = 5%
3. **EAU (Dubai)** : 0% WHT + 0% div. = 0% (substance requise)

### Structure optimale 3 niveaux
France (filiales opérationnelles, IS 15-25%)
→ Holding [Bulgarie / Maurice / EAU] (WHT réduite, div. faibles)
→ Actionnaire (perception nette optimisée)

## DONNÉES FISCALES FRANCE COMPLÉMENTAIRES ${year}

### Optimisations légales disponibles
1. PER : déduction jusqu'à 10% revenu net (max ~35 000 € / an)
2. Déficit foncier : 10 700 €/an sur revenu global
3. CIR : 30% des dépenses R&D jusqu'à 100 M€
4. JEI : exonération IS 1re année + cotisations patronales R&D
5. Holding régime mère-fille : 95% dividendes exonérés d'IS
6. Flat tax 30% vs barème IR : à calculer selon TMI
7. LMNP/LMP : amortissement immobilier

### Charges déductibles
- Frais kilométriques : barème officiel (0,529 €/km 5 000 km, 5CV)
- Repas professionnels : ~21 €/repas
- Bureau domicile : forfait ou réel
- Cotisations Madelin (BNC/BIC) : retraite, prévoyance
- Amortissements : informatique 3 ans, mobilier 5-10 ans, véhicules 5 ans

## RÈGLES DE RÉPONSE
- Réponds TOUJOURS en français
- Donne des conseils CONCRETS avec taux précis, montants et textes de loi (CGI, CSS, conventions)
- Pour les questions internationales : cite le numéro d'article de la convention applicable
- Signale CLAIREMENT les risques (abus de droit, BEPS, substance économique)
- Pour le Cambodge : sois précis sur l'absence de convention actuelle
- Adapte les conseils au pays : ${region}, type : ${businessType}
- Propose un plan d'action priorisé avec chiffres
- Si une IA concurrente (ChatGPT, Gemini) a donné une réponse floue sur la négociation Cambodge/France : précise que la convention N'EST PAS ENCORE RATIFIÉE fin ${year}`;
}
