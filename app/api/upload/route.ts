import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

// Allow up to 20MB for file uploads
export const maxDuration = 60;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(request: Request) {
  try {
    // Verify Cloudinary config
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Cloudinary config manquante:", { cloudName: !!cloudName, apiKey: !!apiKey, apiSecret: !!apiSecret });
      return NextResponse.json(
        { error: "Configuration Cloudinary manquante (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)." },
        { status: 500 }
      );
    }

    // Re-configure with the latest env values (normalized to lowercase)
    cloudinary.config({
      cloud_name: cloudName.toLowerCase().trim(),
      api_key: apiKey.trim(),
      api_secret: apiSecret.trim(),
      secure: true,
    });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
    }

    // Check file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|pdf)$/i)) {
      return NextResponse.json(
        { error: `Type de fichier non supporté : ${file.type || "inconnu"}. Acceptés : images et PDF.` },
        { status: 400 }
      );
    }

    console.log(`Upload Cloudinary: "${file.name}" (${file.type || "type inconnu"}, ${(file.size / 1024).toFixed(1)} KB)`);
    console.log(`Cloudinary config: cloud=${cloudName}, key=${apiKey?.slice(0, 6)}...`);

    const buffer = Buffer.from(await file.arrayBuffer());
    // For PDFs, use the proper mime type; Cloudinary handles PDFs as images
    const mimeType = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    const base64 = `data:${mimeType};base64,${buffer.toString("base64")}`;

    // PDFs → resource_type "raw" so they are served as real downloadable PDF files
    // Images → resource_type "image" for transformations (OCR, Vision AI)
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const resourceType = isPdf ? "raw" : "image";

    const result = await cloudinary.uploader.upload(base64, {
      folder: "compta-ia",
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      filename_override: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
    });

    console.log(`Upload réussi: ${result.secure_url}`);

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    });
  } catch (error) {
    // Cloudinary throws objects like { error: { message: "..." }, http_code: 401 }
    let msg = "Erreur inconnue";
    if (error instanceof Error) {
      msg = error.message;
    } else if (typeof error === "object" && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.error && typeof e.error === "object") {
        const inner = e.error as Record<string, unknown>;
        msg = String(inner.message ?? JSON.stringify(e.error));
      } else if (e.message) {
        msg = String(e.message);
      } else {
        msg = JSON.stringify(error);
      }
    } else {
      msg = String(error);
    }
    console.error("Erreur Cloudinary upload (raw):", JSON.stringify(error, null, 2));
    console.error("Erreur Cloudinary upload (msg):", msg);
    return NextResponse.json(
      { error: `Erreur Cloudinary : ${msg}` },
      { status: 500 }
    );
  }
}
