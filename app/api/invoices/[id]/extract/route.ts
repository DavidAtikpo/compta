import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { pool } from "../../../../../lib/postgres";

export const runtime = "nodejs";
export const maxDuration = 60;

function setupCloudinary(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key  = process.env.CLOUDINARY_API_KEY?.trim();
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !sec) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });
  return true;
}

/** Extract public_id from a Cloudinary URL (strips version prefix, keeps folder/name.ext) */
function extractPublicId(url: string): { publicId: string; resourceType: "image" | "raw" } | null {
  const m = url.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/i
  );
  if (!m) return null;
  return { publicId: m[2], resourceType: m[1].toLowerCase() as "image" | "raw" };
}

/**
 * Convert a Cloudinary PDF (stored as image/upload) to JPEG data URL.
 * Strategy 1 (fast): Apply inline transformation pg_1,f_jpg on the image/upload URL directly.
 * Strategy 2 (fallback): Re-upload using base64 from a Cloudinary eager transform.
 */
async function pdfCloudinaryToJpegDataUrl(fileUrl: string): Promise<string | null> {
  // Strategy 1: image/upload URL → add transformation pg_1,f_jpg inline (no re-upload needed)
  // Works when the PDF was uploaded as image type (our new default)
  const imgUploadMatch = fileUrl.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)(.+\.pdf)$/i
  );
  if (imgUploadMatch) {
    const transformedUrl = `${imgUploadMatch[1]}pg_1,f_jpg,q_auto,w_1600,c_limit/${imgUploadMatch[2]}${imgUploadMatch[3]}`;
    console.log("Tentative transformation inline:", transformedUrl.slice(0, 100));
    const result = await imageUrlToDataUrl(transformedUrl);
    if (result) return result;
    // Try without version segment
    const noVersionUrl = `${imgUploadMatch[1]}pg_1,f_jpg,q_auto,w_1600,c_limit/${imgUploadMatch[3]}`;
    const result2 = await imageUrlToDataUrl(noVersionUrl);
    if (result2) return result2;
  }

  // Strategy 2 (for old raw/upload PDFs): re-upload the PDF bytes via Cloudinary API
  if (!setupCloudinary()) {
    console.warn("Cloudinary non configuré");
    return null;
  }

  const parsed = extractPublicId(fileUrl);
  if (!parsed) {
    console.warn("URL Cloudinary non reconnue:", fileUrl);
    return null;
  }

  // Generate a signed URL for our own asset — Cloudinary SDK can access it
  const signedUrl = cloudinary.url(parsed.publicId, {
    resource_type: parsed.resourceType,
    sign_url: true,
    secure: true,
    type: "upload",
  });

  console.log("Téléchargement PDF signé…");
  const pdfRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30000) });
  if (!pdfRes.ok) {
    console.warn(`PDF 401/404 même avec URL signée (${pdfRes.status}). Ce fichier est inaccessible.`);
    return null;
  }

  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  if (pdfBuf.length < 100) return null;

  const tempPublicId = `compta-ia/extract-tmp-${Date.now()}`;
  let uploadedPublicId: string | null = null;

  try {
    const up = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${pdfBuf.toString("base64")}`,
      {
        public_id: tempPublicId,
        resource_type: "image",
        overwrite: true,
        eager: [{ width: 1600, crop: "limit", format: "jpg", page: 1 }],
        eager_async: false,
      }
    );
    uploadedPublicId = up.public_id;
    const jpgUrl = up?.eager?.[0]?.secure_url as string | undefined;
    if (jpgUrl) {
      const data = await imageUrlToDataUrl(jpgUrl);
      if (data) return data;
    }
  } catch (e) {
    console.error("pdfCloudinaryToJpegDataUrl re-upload:", e);
  } finally {
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: "image", invalidate: true });
      } catch { /* ignore */ }
    }
  }
  return null;
}

/** For regular image URLs: fetch and return as base64 data URL */
async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.warn(`Téléchargement image échoué: ${res.status} ${url.slice(0, 100)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) return null;
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("imageUrlToDataUrl:", (e as Error).message);
    return null;
  }
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

    const { ocrText, originalName, fileUrl } = invoiceRes.rows[0] as {
      ocrText: string | null;
      originalName: string;
      fileUrl: string | null;
    };

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY non configurée." }, { status: 400 });
    }

    // Build vision data URL
    let visionDataUrl: string | null = null;

    if (fileUrl) {
      const isPdf   = /\.pdf(\?|$)/i.test(fileUrl);
      const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(fileUrl);

      if (isImage) {
        visionDataUrl = await imageUrlToDataUrl(fileUrl);
      } else if (isPdf) {
        console.log("Conversion PDF→JPG via Cloudinary API…");
        visionDataUrl = await pdfCloudinaryToJpegDataUrl(fileUrl);
        if (!visionDataUrl) {
          console.warn("Conversion PDF échouée — repli sur OCR si disponible");
        }
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
      return NextResponse.json(
        { error: "Aucune image/PDF ni texte OCR disponible. Ré-uploadez le document depuis la page factures." },
        { status: 422 }
      );
    }

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

    await pool.query(
      `UPDATE invoices SET
        "fournisseur"   = COALESCE($1, "fournisseur"),
        "numeroFacture" = COALESCE($2, "numeroFacture"),
        "montantHT"     = COALESCE($3, "montantHT"),
        "tauxTVA"       = COALESCE($4, "tauxTVA"),
        "montantTVA"    = COALESCE($5, "montantTVA"),
        "montantTTC"    = COALESCE($6, "montantTTC"),
        amount          = COALESCE($6, amount),
        "invoiceDate"   = COALESCE($8::timestamptz, "invoiceDate"),
        "updatedAt"     = NOW()
      WHERE id = $7`,
      [
        extracted.fournisseur || null,
        extracted.numeroFacture || null,
        extracted.montantHT    || null,
        extracted.tauxTVA      || null,
        extracted.montantTVA   || null,
        extracted.montantTTC   || null,
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
