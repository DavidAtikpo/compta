import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";

export const runtime = "nodejs";

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

    // Convert a Cloudinary PDF URL (raw or image type) to a JPG preview of page 1
    function cloudinaryPdfToImage(url: string): string | null {
      if (!url) return null;
      // raw/upload → image/upload with pg_1 transformation
      // https://res.cloudinary.com/cloud/raw/upload/v123/compta-ia/file.pdf
      // → https://res.cloudinary.com/cloud/image/upload/pg_1/v123/compta-ia/file.jpg
      const rawMatch = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/)raw(\/upload\/)(.+\.pdf)$/i);
      if (rawMatch) {
        return `${rawMatch[1]}image${rawMatch[2]}pg_1/${rawMatch[3].replace(/\.pdf$/i, ".jpg")}`;
      }
      // image/upload → add pg_1 transformation
      const imgMatch = url.match(/^(https:\/\/res\.cloudinary\.com\/.+\/upload\/)(.+\.pdf)$/i);
      if (imgMatch) {
        return `${imgMatch[1]}pg_1/${imgMatch[2].replace(/\.pdf$/i, ".jpg")}`;
      }
      return null;
    }

    // Determine the best image URL to send to GPT Vision
    let imageUrlForVision: string | null = null;
    if (fileUrl) {
      if (fileUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
        imageUrlForVision = fileUrl;
      } else if (fileUrl.match(/\.pdf$/i)) {
        imageUrlForVision = cloudinaryPdfToImage(fileUrl);
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
  "description": string | null,
  "compteComptable": string | null
}
Règles : montants en nombre décimal (ex: 120.50), tauxTVA en pourcentage (ex: 20), dateFacture au format YYYY-MM-DD.
Pour le compte comptable, utilise le plan comptable français (607=achats, 606=fournitures, 615=entretien, 622=honoraires, 625=déplacement, 626=télécom, 627=services bancaires, 641=salaires).`;

    const messages: object[] = [{ role: "system", content: systemPrompt }];

    if (imageUrlForVision) {
      // Vision : image ou PDF converti en image (première page)
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyse cette facture "${originalName}" et extrait toutes les données comptables.${ocrText ? `\n\nTexte OCR additionnel :\n${ocrText.slice(0, 2000)}` : ""}`,
          },
          { type: "image_url", image_url: { url: imageUrlForVision, detail: "high" } },
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

    // Persist extracted data to DB
    await pool.query(
      `UPDATE invoices SET
        "fournisseur" = COALESCE($1, "fournisseur"),
        "numeroFacture" = COALESCE($2, "numeroFacture"),
        "montantHT" = COALESCE($3, "montantHT"),
        "tauxTVA" = COALESCE($4, "tauxTVA"),
        "montantTVA" = COALESCE($5, "montantTVA"),
        "montantTTC" = COALESCE($6, amount),
        amount = COALESCE($6, amount),
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
