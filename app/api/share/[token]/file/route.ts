import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/postgres";
import { signedUrlFromStoredCloudinaryUrl } from "../../../../../lib/cloudinary-delivery";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const r = await pool.query(
      `SELECT "fileUrl" FROM invoices WHERE "shareToken" = $1`,
      [token]
    );
    const fileUrl = r.rows[0]?.fileUrl as string | null | undefined;
    if (!fileUrl) {
      return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
    }

    const signed = signedUrlFromStoredCloudinaryUrl(fileUrl);
    if (!signed) {
      return NextResponse.json({ error: "Fichier indisponible." }, { status: 400 });
    }

    return NextResponse.redirect(signed, 302);
  } catch (e) {
    console.error("GET share file:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
