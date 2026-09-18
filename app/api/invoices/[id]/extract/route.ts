import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import {
  detectCurrencyFromOcrText,
  getExplicitCurrencyFromText,
  isValidInvoiceCurrency,
} from "@/lib/invoice-currency";
import { resolveClassificationFromExtract } from "@/lib/classification";
import { ocrFromImageDataUrl } from "@/lib/server-ocr";
import { isOcrTextQualityGood, isOcrTextUsable } from "@/lib/ocr-quality";
import { resolveDocumentImageDataUrl } from "@/lib/invoice-document-vision";
import {
  parseFournisseurFromOcr,
  resolveMontantHTFromOcr,
  resolveMontantTTCFromOcr,
} from "@/lib/invoice-ocr-parse";
import { appendExtractionOkMarker } from "@/lib/invoice-extraction-marker";

export const runtime = "nodejs";
export const maxDuration = 120;

type ExtractProvider = "openai" | "claude" | "perplexity" | "rules";

function isOpenAiInsufficientQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return msg.includes("insufficient_quota") || msg.includes("You exceeded your current quota");
}

function isMissingApiKeyError(err: unknown, keyName: string): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return msg.toLowerCase().includes(keyName.toLowerCase()) && msg.toLowerCase().includes("non configur");
}

function isNetworkFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (/fetch failed|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ENETUNREACH|EAI_AGAIN|network/i.test(msg)) {
    return true;
  }
  const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
  if (cause instanceof AggregateError) {
    return cause.errors.some((e) => isNetworkFetchError(e));
  }
  if (cause && typeof cause === "object" && "code" in cause) {
    const code = String((cause as { code?: string }).code || "");
    return ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ENETUNREACH", "EAI_AGAIN"].includes(code);
  }
  return false;
}

async function resolveOcrTextForRules(
  ocrText: string | null,
  fileUrl: string | null,
  originalName: string,
  mimeType: string | null,
  invoiceId: string,
  workspaceOwnerId: string,
  options?: { forceServer?: boolean },
): Promise<string | null> {
  const forceServer = options?.forceServer === true;
  const clientText = isOcrTextQualityGood(ocrText) ? String(ocrText).trim() : null;
  const hasVisionKey = Boolean(process.env.OCR_API_KEY?.trim());
  const needServer = forceServer || hasVisionKey || !clientText;

  if (!fileUrl) return clientText;
  if (!needServer) return clientText;

  const visionDataUrl = await resolveDocumentImageDataUrl(fileUrl, originalName, mimeType);

  if (!visionDataUrl?.startsWith("data:image/")) return null;

  const ocr = await ocrFromImageDataUrl(visionDataUrl);
  if (!ocr) return clientText;

  const ocrTextToUse =
    isOcrTextQualityGood(ocr) || !clientText
      ? ocr
      : isOcrTextQualityGood(clientText)
        ? clientText
        : ocr.length >= clientText.length
          ? ocr
          : clientText;
  try {
    const replaceOcr =
      forceServer || !isOcrTextQualityGood(clientText) || isOcrTextQualityGood(ocrTextToUse);
    await pool.query(
      replaceOcr
        ? `UPDATE invoices SET "ocrText" = $1, "updatedAt" = NOW()
           WHERE id = $2 AND "userId" = $3 AND ("deletedAt" IS NULL)`
        : `UPDATE invoices SET "ocrText" = COALESCE(NULLIF("ocrText", ''), $1), "updatedAt" = NOW()
           WHERE id = $2 AND "userId" = $3 AND ("deletedAt" IS NULL)`,
      [ocrTextToUse, invoiceId, workspaceOwnerId],
    );
  } catch (e) {
    console.warn("OCR persist failed:", (e as Error).message);
  }
  return ocrTextToUse;
}

function rulesExtractHasData(extracted: Record<string, unknown>): boolean {
  return (
    Boolean(extracted.fournisseur) ||
    Boolean(extracted.numeroFacture) ||
    Boolean(extracted.dateFacture) ||
    typeof extracted.montantTTC === "number" ||
    typeof extracted.montantHT === "number" ||
    typeof extracted.montantTVA === "number" ||
    typeof extracted.tauxTVA === "number" ||
    Boolean(extracted.description) ||
    Boolean(extracted.compteComptable)
  );
}

async function persistRulesExtract(
  extracted: Record<string, unknown>,
  ocrTextToUse: string,
  invoiceId: string,
  workspaceOwnerId: string,
): Promise<Record<string, unknown>> {
  let invoiceDateVal: Date | null = null;
  if (extracted.dateFacture) {
    const d = new Date(String(extracted.dateFacture));
    if (!Number.isNaN(d.getTime())) invoiceDateVal = d;
  }
  const classification = resolveClassificationFromExtract(extracted);
  await pool.query(
    `UPDATE invoices SET
      "fournisseur"   = COALESCE($1, "fournisseur"),
      "numeroFacture" = COALESCE($2, "numeroFacture"),
      "montantHT"     = COALESCE($3, "montantHT"),
      "tauxTVA"       = COALESCE($4, "tauxTVA"),
      "montantTVA"    = COALESCE($5, "montantTVA"),
      "montantTTC"    = COALESCE($6, "montantTTC"),
      amount          = CASE WHEN $6 IS NOT NULL THEN $6 ELSE amount END,
      "ocrText"       = COALESCE(NULLIF($13, ''), "ocrText"),
      "invoiceDate"   = COALESCE($8::timestamptz, "invoiceDate"),
      currency        = COALESCE($10, currency),
      category        = COALESCE($11, category),
      "accountCode"   = COALESCE($12, "accountCode"),
      "updatedAt"     = NOW()
    WHERE id = $7 AND "userId" = $9 AND ("deletedAt" IS NULL)`,
    [
      (extracted.fournisseur as string | null) || null,
      (extracted.numeroFacture as string | null) || null,
      (extracted.montantHT as number | null) ?? null,
      (extracted.tauxTVA as number | null) ?? null,
      (extracted.montantTVA as number | null) ?? null,
      (extracted.montantTTC as number | null) ?? null,
      invoiceId,
      invoiceDateVal,
      workspaceOwnerId,
      (extracted.currency as string | null) || null,
      classification.category,
      classification.accountCode,
      appendExtractionOkMarker(ocrTextToUse),
    ],
  );
  return { ...extracted, ...classification };
}

async function tryRulesFallbackResponse(
  ocrText: string | null,
  fileUrl: string | null,
  originalName: string,
  mimeType: string | null,
  invoiceId: string,
  workspaceOwnerId: string,
  warning: string,
): Promise<NextResponse | null> {
  const ocrTextToUse = await resolveOcrTextForRules(
    ocrText,
    fileUrl,
    originalName,
    mimeType,
    invoiceId,
    workspaceOwnerId,
  );
  if (!isOcrTextUsable(ocrTextToUse)) return null;
  const extracted = extractStructuredFromOcr(ocrTextToUse!, originalName);
  if (!rulesExtractHasData(extracted)) return null;
  const data = await persistRulesExtract(extracted, ocrTextToUse!, invoiceId, workspaceOwnerId);
  return NextResponse.json({ success: true, data, fallback: "rules", warning });
}

function normalizeNumber(input: string): number | null {
  const s = String(input || "")
    .replace(/\s+/g, "")
    .replace(/[€$£¥₵]/g, "")
    .replace(/\bFCFA\b|\bXAF\b|\bXOF\b|\bGHS\b|\bEUR\b|\bGBP\b|\bUSD\b|\bCNY\b/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // 1.234,56 -> 1234,56
    .replace(/,(?=\d{3}(\D|$))/g, "") // 1,234.56 -> 1234.56
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    const v = m?.[1] ? String(m[1]).trim() : "";
    if (v) return v;
  }
  return null;
}

function parseInvoiceDate(text: string): string | null {
  const t = String(text || "");
  // Prefer dates near keywords
  const candidates: string[] = [];
  const reList = [
    /(?:date(?:\s+de)?\s+facture|date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:date(?:\s+de)?\s+facture|date)\s*[:\-]?\s*(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i,
    /\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/,
    /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/,
  ];
  for (const re of reList) {
    const m = t.match(re);
    if (m?.[1]) candidates.push(m[1]);
  }
  for (const raw of candidates) {
    const s = raw.replace(/\./g, "/").replace(/-/g, "/");
    const iso = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    let y: number | null = null;
    let mo: number | null = null;
    let d: number | null = null;
    if (iso) {
      y = Number(iso[1]); mo = Number(iso[2]); d = Number(iso[3]);
    } else if (fr) {
      d = Number(fr[1]); mo = Number(fr[2]);
      const yy = Number(fr[3]);
      y = yy < 100 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy;
    }
    if (!y || !mo || !d) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (Number.isNaN(dt.getTime())) continue;
    // guard: same parts
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) continue;
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function pickAccountingCode(text: string): string | null {
  const t = String(text || "").toLowerCase();
  if (/(honoraires?|avocat|juridique|expert[-\s]?comptable|consultant|conseil)/i.test(t)) return "622";
  if (/(hotel|h[ôo]tel|uber|taxi|train|sncf|avion|parking|peage|péage|carburant)/i.test(t)) return "625";
  if (/(telephone|t[ée]l[ée]phone|internet|fibre|box|mobile|forfait|t[ée]l[ée]com)/i.test(t)) return "626";
  if (/(banque|frais\s+bancaires?|commission\s+bancaire|cb\s+pro|carte\s+bancaire)/i.test(t)) return "627";
  if (/(entretien|maintenance|r[ée]paration|depannage|d[ée]pannage)/i.test(t)) return "615";
  if (/(fournitures?|papeterie|cartouche|encre|papier|bureau)/i.test(t)) return "606";
  if (/(achat|marchandises?|mat[ée]riel|ordinateur|imprimante)/i.test(t)) return "607";
  return null;
}

function extractStructuredFromOcr(ocrText: string, originalName: string): Record<string, unknown> {
  const raw = String(ocrText || "");
  const normalized = raw.replace(/\r\n/g, "\n");
  const flat = normalized.replace(/\s+/g, " ");

  const numeroFacture =
    pickFirstMatch(normalized, [
      /(?:n[°ºo]\s*(?:facture|invoice)|(?:num(?:[ée]ro)?\s*(?:facture|invoice)?)|(?:facture|invoice)\s*(?:n[°ºo]|no|num(?:[ée]ro)?))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
      /\b(?:facture|invoice)\b[^\n]{0,40}\b([A-Z0-9][A-Z0-9\-\/]{3,})\b/i,
    ]) || null;

  const dateFacture = parseInvoiceDate(normalized);

  const CUR_AFTER = String.raw`(?:\s*(?:€|eur|£|gbp|\$|usd|¥|元|cny|₵|ghs|fcfa|f\.cfa|cfa|xaf|xof))?`;
  const montantTTCStr =
    pickFirstMatch(normalized, [
      new RegExp(String.raw`(?:facture\s+total|total\s+ttc|montant\s+ttc|ttc)\s*[:\-]?\s*([0-9][0-9\s.,]{1,18})${CUR_AFTER}`, "i"),
      new RegExp(String.raw`(?:net\s+[àa]\s+payer|total\s+[àa]\s+payer|balance\s+due|amount\s+due)\s*[:\-]?\s*([0-9][0-9\s.,]{1,18})${CUR_AFTER}`, "i"),
      new RegExp(String.raw`(?:^|\n)\s*montant\s*[:\-]?\s*([0-9][0-9\s.,]{2,18})${CUR_AFTER}`, "im"),
      new RegExp(String.raw`(?:d[ée]p[oô]t|transaction|cr[ée]dit)\b[^\n]{0,80}?\b([0-9][0-9\s.,]{2,18})${CUR_AFTER}`, "i"),
    ]);
  const montantHTStr =
    pickFirstMatch(normalized, [
      new RegExp(String.raw`(?:total\s+ht|montant\s+ht)\s*[:\-]?\s*([0-9][0-9\s.,]{1,18})${CUR_AFTER}`, "i"),
    ]);
  const montantTVAStr =
    pickFirstMatch(normalized, [
      new RegExp(String.raw`(?:montant\s+tva|total\s+tva|tva)\s*[:\-]?\s*([0-9][0-9\s.,]{0,18})${CUR_AFTER}`, "i"),
    ]);

  const currency = detectCurrencyFromOcrText(raw);
  const montantTTC = resolveMontantTTCFromOcr(raw, montantTTCStr, {
    labeledContext: normalized,
    currencyHint: currency !== "EUR" ? currency : getExplicitCurrencyFromText(raw),
  });
  const montantHT = resolveMontantHTFromOcr(raw, montantHTStr);
  const montantTVA = montantTVAStr ? normalizeNumber(montantTVAStr) : null;

  let tauxTVA: number | null = null;
  const tauxStr = pickFirstMatch(flat, [
    /(?:taux\s+tva|tva)\s*[:\-]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i,
    /\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:tva|vat)\b/i,
  ]);
  if (tauxStr) {
    const n = normalizeNumber(tauxStr);
    if (n != null && n >= 0 && n <= 30) tauxTVA = n;
  } else if (montantHT != null && montantTVA != null && montantHT > 0) {
    const computed = (montantTVA / montantHT) * 100;
    if (Number.isFinite(computed) && computed >= 0 && computed <= 30) {
      tauxTVA = Math.round(computed * 100) / 100;
    }
  }

  const estReglee =
    /\b(pay[ée]e?|r[ée]gl[ée]e?|acquitt[ée]e?|paid|settled)\b/i.test(flat) ? true : null;
  const montantRegle = estReglee ? montantTTC : null;

  const fournisseur = parseFournisseurFromOcr(raw, originalName);

  const description =
    pickFirstMatch(normalized, [
      /(?:objet|description|d[ée]signation)\s*[:\-]?\s*(.{3,120})/i,
    ]) || null;

  const compteComptable = pickAccountingCode(flat);

  return {
    fournisseur,
    numeroFacture,
    dateFacture,
    montantHT,
    tauxTVA,
    montantTVA,
    montantTTC,
    montantRegle,
    estReglee,
    description,
    compteComptable,
    currency,
    _source: "rules",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
      await resolveInvoiceWorkspace(userId);
    const agentClause = restrictAgentToOwnSubmissions
      ? ` AND "submittedByUserId" = $3`
      : "";
    const selParams = restrictAgentToOwnSubmissions
      ? [id, workspaceOwnerId, actorUserId]
      : [id, workspaceOwnerId];
    const invoiceRes = await pool.query(
      `SELECT "ocrText", "originalName", "fileUrl", "mimeType" FROM invoices WHERE id = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)${agentClause}`,
      selParams
    );

    if (invoiceRes.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    let { ocrText, originalName, fileUrl, mimeType } = invoiceRes.rows[0] as {
      ocrText: string | null;
      originalName: string;
      fileUrl: string | null;
      mimeType: string | null;
    };

    const body = await request.json().catch(() => ({}));
    const provider: ExtractProvider =
      body?.provider === "rules"
        ? "rules"
        : body?.provider === "claude"
          ? "claude"
          : body?.provider === "perplexity"
            ? "perplexity"
            : "openai";

    // Toujours tenter un OCR serveur (Google Vision) si le texte client est absent ou bruité.
    if (fileUrl) {
      const serverOcr = await resolveOcrTextForRules(
        ocrText,
        fileUrl,
        originalName,
        mimeType,
        id,
        workspaceOwnerId,
        { forceServer: !isOcrTextQualityGood(ocrText) },
      );
      if (isOcrTextQualityGood(serverOcr)) ocrText = serverOcr;
    }

    // Extraction facture : « rules » = OCR + règles (sans LLM) ; autres = vision + LLM
    if (provider === "rules") {
      const ocrTextToUse = isOcrTextUsable(ocrText) ? String(ocrText).trim() : null;

      if (!ocrTextToUse) {
        console.warn("Extraction 422: provider=rules mais aucun ocrText", {
          invoiceId: id,
          provider,
          mimeType,
          originalName,
          hasFileUrl: Boolean(fileUrl),
        });
        return NextResponse.json(
          {
            error:
              "Extraction (OCR) indisponible : impossible de lire le texte du document. Ré-uploadez une image plus nette ou un PDF lisible.",
            ...(process.env.NODE_ENV !== "production"
              ? {
                  details: {
                    provider,
                    hasOcrText: Boolean(ocrTextToUse),
                    hasFileUrl: Boolean(fileUrl),
                    mimeType: mimeType || null,
                    originalName,
                  },
                }
              : {}),
          },
          { status: 422 },
        );
      }
      const extracted = extractStructuredFromOcr(ocrTextToUse, originalName);

      if (!rulesExtractHasData(extracted)) {
        return NextResponse.json(
          {
            error:
              "Extraction (OCR) effectuée mais aucune donnée exploitable n’a été trouvée. Essayez une photo plus nette ou le mode « Avec IA ».",
            ...(process.env.NODE_ENV !== "production"
              ? { details: { provider, originalName, mimeType: mimeType || null } }
              : {}),
          },
          { status: 422 },
        );
      }

      const data = await persistRulesExtract(extracted, ocrTextToUse, id, workspaceOwnerId);
      const warning =
        extracted.montantTTC == null
          ? "Fournisseur ou date détecté(s), mais montant introuvable dans le document. Essayez « Avec IA (Claude) » ou une capture plus nette."
          : undefined;
      return NextResponse.json({ success: true, data, ...(warning ? { warning } : {}) });
    }

    // ── Extraction avec IA (vision + LLM) ──
    // Build vision data URL
    let visionDataUrl: string | null = null;

    if (fileUrl) {
      visionDataUrl = await resolveDocumentImageDataUrl(fileUrl, originalName, mimeType);
      if (!visionDataUrl) {
        console.warn("Conversion document→image échouée — repli sur OCR si disponible");
      }
    }

    const systemPrompt = `Tu es un expert-comptable. Extrait les données comptables structurées depuis une facture.
Réponds UNIQUEMENT en JSON valide avec exactement ces champs (null si non trouvé) :
{
  "fournisseur": string | null,
  "numeroFacture": string | null,
  "dateFacture": string | null,
  "montantHT": number | null,
  "tauxTVA": number | null,
  "montantTVA": number | null,
  "montantTTC": number | null,
  "montantRegle": number | null,
  "estReglee": boolean | null,
  "description": string | null,
  "compteComptable": string | null,
  "currency": string | null
}
Règles : montants en nombre décimal (ex: 120.50), tauxTVA en pourcentage (ex: 20), dateFacture au format YYYY-MM-DD.
Pour le compte comptable, utilise le plan comptable français (607=achats, 606=fournitures, 615=entretien, 622=honoraires, 625=déplacement, 626=télécom, 627=services bancaires, 641=salaires).
Pour currency, utilise le code ISO 4217 (EUR, GBP, USD, CNY, GHS, XAF, XOF). Détecte la devise d'après les symboles (€ → EUR, £ → GBP, $ → USD, ¥ → CNY, ₵ → GHS) ou les codes explicites (FCFA → XOF par défaut, sauf si contexte CEMAC → XAF).`;

    const messages: object[] = [{ role: "system", content: systemPrompt }];

    if (visionDataUrl) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyse cette facture "${originalName}" et extrait toutes les données comptables.${ocrText ? `\n\nTexte OCR additionnel :\n${ocrText.slice(0, 2000)}` : ""}`,
          },
          { type: "image_url", image_url: { url: visionDataUrl, detail: "high" } },
        ],
      });
    } else if (ocrText) {
      messages.push({
        role: "user",
        content: `Analyse cette facture "${originalName}" à partir du texte OCR ci-dessous et extrait toutes les données comptables.\n\nTexte OCR :\n${ocrText.slice(0, 4000)}`,
      });
    } else {
      console.warn("Extraction 422: aucun support d'entrée", {
        invoiceId: id,
        provider,
        mimeType,
        originalName,
        fileUrlPrefix: fileUrl ? String(fileUrl).slice(0, 80) : null,
      });
      return NextResponse.json(
        {
          error:
            "Aucune image/PDF ni texte OCR disponible. Ré-uploadez le document depuis la page factures.",
          ...(process.env.NODE_ENV !== "production"
            ? {
                details: {
                  provider,
                  hasOcrText: false,
                  hasFileUrl: Boolean(fileUrl),
                  mimeType: mimeType || null,
                  originalName,
                  cloudinaryConfigured: Boolean(
                    process.env.CLOUDINARY_CLOUD_NAME &&
                      process.env.CLOUDINARY_API_KEY &&
                      process.env.CLOUDINARY_API_SECRET
                  ),
                },
              }
            : {}),
        },
        { status: 422 }
      );
    }

    let raw: string;
    let providerUsed: Exclude<ExtractProvider, "rules"> = provider;
    try {
      raw = await extractWithProvider(provider, systemPrompt, messages, ocrText, originalName, visionDataUrl);
    } catch (e) {
      // OpenAI quota exceeded → automatic fallback to Claude if available
      if (provider === "openai" && isOpenAiInsufficientQuotaError(e) && process.env.ANTHROPIC_API_KEY) {
        console.warn("OpenAI quota exceeded — fallback to Claude.");
        providerUsed = "claude";
        try {
          raw = await extractWithProvider("claude", systemPrompt, messages, ocrText, originalName, visionDataUrl);
        } catch (claudeErr) {
          if (isNetworkFetchError(claudeErr)) {
            console.warn("Extraction IA : Claude injoignable après repli OpenAI, OCR+règles…", claudeErr);
            const fallback = await tryRulesFallbackResponse(
              ocrText,
              fileUrl,
              originalName,
              mimeType,
              id,
              workspaceOwnerId,
              "L’API IA est injoignable (timeout réseau). Extraction effectuée en mode Sans IA (OCR).",
            );
            if (fallback) return fallback;
          }
          throw claudeErr;
        }
      } else if (provider === "openai" && isOpenAiInsufficientQuotaError(e)) {
        return NextResponse.json(
          { error: "Quota OpenAI dépassé. Rechargez votre crédit ou choisissez Claude.", code: "insufficient_quota" },
          { status: 402 }
        );
      } else if (
        isMissingApiKeyError(e, "OPENAI_API_KEY") ||
        isMissingApiKeyError(e, "ANTHROPIC_API_KEY") ||
        isMissingApiKeyError(e, "PERPLEXITY_API_KEY")
      ) {
        return NextResponse.json(
          { error: (e as Error).message || "Clé API manquante.", code: "missing_api_key" },
          { status: 422 }
        );
      } else if (isNetworkFetchError(e)) {
        console.warn("Extraction IA : erreur réseau, repli Sans IA (OCR+règles)…", e);
        const fallback = await tryRulesFallbackResponse(
          ocrText,
          fileUrl,
          originalName,
          mimeType,
          id,
          workspaceOwnerId,
          "L’API IA est injoignable (timeout réseau). Extraction effectuée en mode Sans IA (OCR).",
        );
        if (fallback) return fallback;
        return NextResponse.json(
          {
            error:
              "Connexion à l’API IA impossible (timeout réseau). Choisissez « Sans IA (OCR) » ou vérifiez votre connexion / pare-feu.",
            code: "ai_network_error",
          },
          { status: 503 },
        );
      } else {
        throw e;
      }
    }
    const extracted = safeParseExtractedJson(raw);
    if (providerUsed !== provider) {
      console.log("Extraction provider fallback:", { requested: provider, used: providerUsed });
    }

    let invoiceDateVal: Date | null = null;
    if (extracted.dateFacture) {
      const d = new Date(String(extracted.dateFacture));
      if (!Number.isNaN(d.getTime())) invoiceDateVal = d;
    }

    // Persist AI "paid" markers inside ocrText so list page can read both OCR + IA result
    const paidAmountFromAi =
      typeof extracted.montantRegle === "number" && !Number.isNaN(extracted.montantRegle)
        ? extracted.montantRegle
        : null;
    const paidFlagFromAi =
      typeof extracted.estReglee === "boolean" ? extracted.estReglee : null;
    const aiPaidMarkerParts: string[] = [];
    if (paidAmountFromAi != null) aiPaidMarkerParts.push(`[AI_PAID_AMOUNT]=${paidAmountFromAi}`);
    if (paidFlagFromAi != null) aiPaidMarkerParts.push(`[AI_PAID_FLAG]=${paidFlagFromAi ? "true" : "false"}`);
    const aiPaidMarkers = appendExtractionOkMarker(
      aiPaidMarkerParts.length > 0 ? aiPaidMarkerParts.join("\n") : null,
    );

    const extractedCurrency =
      typeof extracted.currency === "string" && isValidInvoiceCurrency(String(extracted.currency))
        ? String(extracted.currency).toUpperCase()
        : detectCurrencyFromOcrText(ocrText ?? "");

    const classification = resolveClassificationFromExtract(extracted);

    await pool.query(
      `UPDATE invoices SET
        "fournisseur"   = COALESCE($1, "fournisseur"),
        "numeroFacture" = COALESCE($2, "numeroFacture"),
        "montantHT"     = COALESCE($3, "montantHT"),
        "tauxTVA"       = COALESCE($4, "tauxTVA"),
        "montantTVA"    = COALESCE($5, "montantTVA"),
        "montantTTC"    = COALESCE($6, "montantTTC"),
        amount          = CASE WHEN $6 IS NOT NULL THEN $6 ELSE amount END,
        "ocrText"       = CASE
                            WHEN $9::text IS NULL OR $9::text = '' THEN "ocrText"
                            WHEN "ocrText" IS NULL OR "ocrText" = '' THEN $9::text
                            ELSE "ocrText" || E'\n' || $9::text
                          END,
        "invoiceDate"   = COALESCE($8::timestamptz, "invoiceDate"),
        currency        = COALESCE($11, currency),
        category        = COALESCE($12, category),
        "accountCode"   = COALESCE($13, "accountCode"),
        "updatedAt"     = NOW()
      WHERE id = $7 AND "userId" = $10 AND ("deletedAt" IS NULL)`,
      [
        (extracted.fournisseur as string | null) || null,
        (extracted.numeroFacture as string | null) || null,
        (extracted.montantHT as number | null) ?? null,
        (extracted.tauxTVA as number | null) ?? null,
        (extracted.montantTVA as number | null) ?? null,
        (extracted.montantTTC as number | null) ?? null,
        id,
        invoiceDateVal,
        aiPaidMarkers || null,
        workspaceOwnerId,
        extractedCurrency,
        classification.category,
        classification.accountCode,
      ]
    );

    return NextResponse.json({ success: true, data: { ...extracted, ...classification } });
  } catch (error) {
    console.error("Erreur extraction comptable:", error);
    if (isNetworkFetchError(error)) {
      return NextResponse.json(
        {
          error:
            "Erreur réseau lors de l’extraction. Utilisez « Sans IA (OCR) » ou vérifiez la connexion Internet et les clés API.",
          code: "network_error",
        },
        { status: 503 },
      );
    }
    const msg = error instanceof Error ? error.message : "Erreur lors de l'extraction comptable.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function safeParseExtractedJson(raw: string): Record<string, unknown> {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return {};

  // 1) direct JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2) markdown fenced block ```json ... ```
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  // 3) fallback: extract first {...} block
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  throw new Error("Réponse IA non JSON exploitable.");
}

async function extractWithProvider(
  provider: Exclude<ExtractProvider, "rules">,
  systemPrompt: string,
  messages: object[],
  ocrText: string | null,
  originalName: string,
  visionDataUrl: string | null,
): Promise<string> {
  if (provider === "claude") {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY non configurée.");

    const userText = `Analyse cette facture "${originalName}" et extrait toutes les données comptables.${ocrText ? `\n\nTexte OCR:\n${ocrText.slice(0, 4000)}` : ""}`;
    const content: object[] = [{ type: "text", text: userText }];
    if (visionDataUrl?.startsWith("data:image/")) {
      const m = visionDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m?.[1] && m?.[2]) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: m[1],
            data: m[2],
          },
        });
      }
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        system: systemPrompt,
        max_tokens: 1200,
        temperature: 0.1,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`Claude error: ${await res.text()}`);
    const payload = await res.json();
    return payload?.content?.[0]?.text || "{}";
  }

  if (provider === "perplexity") {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) throw new Error("PERPLEXITY_API_KEY non configurée.");
    if (!ocrText) {
      throw new Error("Perplexity extraction nécessite du texte OCR.");
    }
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${perplexityKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyse cette facture "${originalName}" à partir du texte OCR ci-dessous et réponds uniquement en JSON.\n\n${ocrText.slice(0, 4000)}`,
          },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`Perplexity error: ${await res.text()}`);
    const payload = await res.json();
    return payload?.choices?.[0]?.message?.content || "{}";
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY non configurée.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`OpenAI error: ${txt}`);
  }
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "{}";
}
