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

    const messages: object[] = [
      {
        role: "system",
        content: `Tu es un expert en comptabilité. Extrait les données comptables structurées d'une facture.
Réponds UNIQUEMENT en JSON avec exactement ces champs (null si non trouvé) :
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
Pour le compte comptable, utilise le plan comptable français (ex: 607 pour achats, 606 pour fournitures, 615 pour entretien, 622 pour honoraires, etc.)`,
      },
    ];

    if (fileUrl && fileUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyse cette facture (${originalName}) et extrait les données comptables.${ocrText ? `\n\nTexte OCR disponible :\n${ocrText}` : ""}`,
          },
          { type: "image_url", image_url: { url: fileUrl, detail: "high" } },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Analyse cette facture (${originalName}) et extrait les données comptables.\n\nTexte OCR :\n${ocrText || "Non disponible"}`,
      });
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
