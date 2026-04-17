import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import { pool } from "../../../../../lib/postgres";

export const runtime = "nodejs";

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

function getDeliveryUrl(fileUrl: string): string {
  if (!fileUrl) return fileUrl;

  // For image/upload PDFs (our new default): add fl_attachment so browser downloads instead of rendering
  const imgPdfMatch = fileUrl.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)(.+\.pdf)$/i
  );
  if (imgPdfMatch) {
    return `${imgPdfMatch[1]}fl_attachment/${imgPdfMatch[2]}${imgPdfMatch[3]}`;
  }

  // For image/upload non-PDF (jpg, png): return as-is (publicly accessible)
  if (fileUrl.includes("/image/upload/")) {
    return fileUrl;
  }

  // For raw/upload (old files): try to generate a signed URL
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key  = process.env.CLOUDINARY_API_KEY?.trim();
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !sec) return fileUrl;

  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });

  const m = fileUrl.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/raw\/upload\/(?:v(\d+)\/)?(.+)$/i
  );
  if (!m) return fileUrl;

  try {
    const opts: Record<string, unknown> = {
      resource_type: "raw",
      sign_url: true,
      secure: true,
      type: "upload",
    };
    if (m[1]) opts.version = Number(m[1]);
    return cloudinary.url(m[2], opts) || fileUrl;
  } catch {
    return fileUrl;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  if (!JWT_SECRET) {
    return NextResponse.json({ error: "Configuration serveur." }, { status: 500 });
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  try {
    const r = await pool.query(`SELECT "fileUrl" FROM invoices WHERE id = $1`, [id]);
    const fileUrl = r.rows[0]?.fileUrl as string | null | undefined;
    if (!fileUrl) {
      return NextResponse.json({ error: "Aucun fichier pour cette facture." }, { status: 404 });
    }

    const deliveryUrl = getDeliveryUrl(fileUrl);
    console.log("Delivery URL:", deliveryUrl.slice(0, 120));
    return NextResponse.json({ url: deliveryUrl });
  } catch (e) {
    console.error("GET invoice file:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
