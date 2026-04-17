import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { pool } from "../../../../../lib/postgres";
import { signedUrlFromStoredCloudinaryUrl } from "../../../../../lib/cloudinary-delivery";

export const runtime = "nodejs";

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

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
      return NextResponse.json({ error: "Aucun fichier." }, { status: 404 });
    }

    const signed = signedUrlFromStoredCloudinaryUrl(fileUrl);
    if (!signed) {
      return NextResponse.json({ error: "Lien fichier invalide." }, { status: 400 });
    }

    return NextResponse.redirect(signed, 302);
  } catch (e) {
    console.error("GET invoice file:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
