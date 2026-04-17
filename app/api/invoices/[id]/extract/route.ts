import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { pool } from "../../../../../lib/postgres";
import { signCloudinaryUrlIfApplicable } from "../../../../../lib/cloudinary-delivery";

export const runtime = "nodejs";

function configureCloudinary(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !secret) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret, secure: true });
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const invoiceRes = await pool.query(
      `SELECT "ocrText", "originalName", "fileUrl" FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceRes.rows.length === 0) {
      return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    }

    const { ocrText, originalName, fileUrl } = invoiceRes.rows[0];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY non configurée." }, { status: 400 });
    }

    // URLs Cloudinary (surtout image/fetch) échouent souvent côté OpenAI → on télécharge côté serveur et on envoie en data URL
    function cloudinaryPdfToRasterUrls(url: string): string[] {
      if (!url || !url.toLowerCase().includes(".pdf")) return [];

      const cloudMatch = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\//i);
      const cloudName = cloudMatch?.[1];
      if (!cloudName) return [];

      const tx = "pg_1,f_jpg,q_auto,w_1600,c_limit";

      if (url.includes("/raw/upload/")) {
        const enc = encodeURIComponent(url);
        return [`https://res.cloudinary.com/${cloudName}/image/fetch/${tx}/${enc}`];
      }

      const up = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/)image\/upload\/((?:v\d+\/)?.+\.pdf)$/i);
      if (up) {
        return [`${up[1]}image/upload/${tx}/${up[2]}`];
      }

      return [];
    }

    async function fileUrlToVisionDataUrl(url: string): Promise<string | null> {
      const lower = url.toLowerCase();
      const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(lower);
      const isPdf = /\.pdf(\?|$)/i.test(lower);

      const tryFetch = async (u: string): Promise<string | null> => {
        const resolved = signCloudinaryUrlIfApplicable(u);
        const res = await fetch(resolved, { signal: AbortSignal.timeout(45000) });
        if (!res.ok) {
          console.warn(`Vision fetch failed ${res.status}: ${u.slice(0, 120)}…`);
          return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 64) return null;
        const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        if (!ct.startsWith("image/")) {
          console.warn(`Vision fetch unexpected type ${ct}`);
          return null;
        }
        return `data:${ct};base64,${buf.toString("base64")}`;
      };

      if (isImage) return tryFetch(url);

      if (isPdf) {
        for (const rasterUrl of cloudinaryPdfToRasterUrls(url)) {
          const data = await tryFetch(rasterUrl);
          if (data) return data;
        }

        // Repli : re-upload temporaire du PDF (API signée) → eager page 1 en JPG → data URL → suppression
        const pdfRes = await fetch(signCloudinaryUrlIfApplicable(url), {
          signal: AbortSignal.timeout(45000),
        });
        if (!pdfRes.ok) {
          console.warn("Impossible de télécharger le PDF pour l’extraction.");
          return null;
        }
        const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
        if (pdfBuf.length < 100) return null;

        if (!configureCloudinary()) {
          console.warn("Cloudinary non configuré — impossible le repli PDF→image.");
          return null;
        }

        const tempId = `temp-extract/${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        let uploadedPublicId: string | null = null;
        try {
          const up = await cloudinary.uploader.upload(
            `data:application/pdf;base64,${pdfBuf.toString("base64")}`,
            {
              folder: "compta-ia",
              public_id: tempId,
              resource_type: "image",
              overwrite: true,
              eager: [{ width: 1600, crop: "limit", format: "jpg", page: 1 }],
              eager_async: false,
            }
          );
          uploadedPublicId = up.public_id;
          const eagerUrl = up?.eager?.[0]?.secure_url as string | undefined;
          if (eagerUrl) {
            const data = await tryFetch(eagerUrl);
            if (data) return data;
          }
        } catch (e) {
          console.error("Repli Cloudinary PDF→JPG:", e);
        } finally {
          if (uploadedPublicId) {
            try {
              await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: "image", invalidate: true });
            } catch {
              /* ignore */
            }
          }
        }
        return null;
      }

      return null;
    }

    let visionDataUrl: string | null = null;
    if (fileUrl) {
      visionDataUrl = await fileUrlToVisionDataUrl(fileUrl);
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
  "description": string | null,
  "compteComptable": string | null
}
Règles : montants en nombre décimal (ex: 120.50), tauxTVA en pourcentage (ex: 20), dateFacture au format YYYY-MM-DD.
Pour le compte comptable, utilise le plan comptable français (607=achats, 606=fournitures, 615=entretien, 622=honoraires, 625=déplacement, 626=télécom, 627=services bancaires, 641=salaires).`;

    const messages: object[] = [{ role: "system", content: systemPrompt }];

    if (visionDataUrl) {
      // Vision : data URL (téléchargée par notre serveur) — évite invalid_image_url côté OpenAI sur les URLs Cloudinary
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
      // Texte OCR uniquement
      messages.push({
        role: "user",
        content: `Analyse cette facture "${originalName}" à partir du texte OCR ci-dessous et extrait toutes les données comptables.\n\nTexte OCR :\n${ocrText.slice(0, 4000)}`,
      });
    } else {
      // Aucune donnée disponible — retourne immédiatement
      return NextResponse.json(
        { error: "Aucune image ni texte OCR disponible pour cette facture. Uploadez d'abord le document." },
        { status: 422 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content || "{}";
    const extracted = JSON.parse(raw);

    let invoiceDateVal: Date | null = null;
    if (extracted.dateFacture) {
      const d = new Date(String(extracted.dateFacture));
      if (!Number.isNaN(d.getTime())) invoiceDateVal = d;
    }

    // Persist extracted data to DB
    await pool.query(
      `UPDATE invoices SET
        "fournisseur" = COALESCE($1, "fournisseur"),
        "numeroFacture" = COALESCE($2, "numeroFacture"),
        "montantHT" = COALESCE($3, "montantHT"),
        "tauxTVA" = COALESCE($4, "tauxTVA"),
        "montantTVA" = COALESCE($5, "montantTVA"),
        "montantTTC" = COALESCE($6, "montantTTC"),
        amount = COALESCE($6, amount),
        "invoiceDate" = COALESCE($8::timestamptz, "invoiceDate"),
        "updatedAt" = NOW()
      WHERE id = $7`,
      [
        extracted.fournisseur || null,
        extracted.numeroFacture || null,
        extracted.montantHT || null,
        extracted.tauxTVA || null,
        extracted.montantTVA || null,
        extracted.montantTTC || null,
        id,
        invoiceDateVal,
      ]
    );

    return NextResponse.json({ success: true, data: extracted });
  } catch (error) {
    console.error("Erreur extraction comptable:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'extraction comptable." },
      { status: 500 }
    );
  }
}
