import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";
import { parsePdfTable } from "../../../../lib/pdf-invoice-export";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
}

const MAX_PDF_BLOCK = 4000;
const MAX_TITLE = 400;
const MAX_ADDR = 3000;

function validHttps(u: string): boolean {
  return u.startsWith("https://");
}

export async function PATCH(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let userId: string;
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: string };
    if (typeof p.sub !== "string") {
      return NextResponse.json({ error: "Session invalide." }, { status: 401 });
    }
    userId = p.sub;
  } catch {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const data: Record<string, string | string[] | null> = {};

  if ("name" in body) {
    const n = body.name;
    data.name = typeof n === "string" ? n.trim() || null : null;
  }
  if ("imageUrl" in body) {
    const u = body.imageUrl;
    if (u === null || u === "") {
      data.imageUrl = null;
    } else if (typeof u === "string") {
      const s = u.trim();
      if (!validHttps(s)) {
        return NextResponse.json({ error: "URL de photo invalide." }, { status: 400 });
      }
      data.imageUrl = s;
    }
  }

  const urlFields = [
    "pdfHeaderImageUrl",
    "pdfFooterImageUrl",
    "pdfLogoUrl",
  ] as const;
  for (const key of urlFields) {
    if (!(key in body)) continue;
    const u = body[key];
    if (u === null || u === "") {
      data[key] = null;
    } else if (typeof u === "string") {
      const s = u.trim();
      if (!validHttps(s)) {
        return NextResponse.json({ error: `URL ${key} invalide.` }, { status: 400 });
      }
      data[key] = s;
    }
  }

  if ("pdfHeaderTitle" in body) {
    const t = body.pdfHeaderTitle;
    if (t === null || t === "") data.pdfHeaderTitle = null;
    else if (typeof t === "string") {
      if (t.length > MAX_TITLE) {
        return NextResponse.json({ error: "Titre d’en-tête trop long." }, { status: 400 });
      }
      data.pdfHeaderTitle = t.trim() || null;
    }
  }
  if ("pdfHeaderAddress" in body) {
    const t = body.pdfHeaderAddress;
    if (t === null || t === "") data.pdfHeaderAddress = null;
    else if (typeof t === "string") {
      if (t.length > MAX_ADDR) {
        return NextResponse.json({ error: "Adresse d’en-tête trop longue." }, { status: 400 });
      }
      data.pdfHeaderAddress = t;
    }
  }
  if ("pdfHeaderTableJson" in body) {
    const t = body.pdfHeaderTableJson;
    if (t === null || t === "") {
      data.pdfHeaderTableJson = null;
    } else if (typeof t === "string") {
      const parsed = parsePdfTable(t);
      if (!parsed) {
        return NextResponse.json(
          { error: "Tableau PDF invalide (attendu : 2 lignes × 4 colonnes)." },
          { status: 400 },
        );
      }
      data.pdfHeaderTableJson = JSON.stringify(parsed);
    }
  }
  if ("pdfHeaderText" in body) {
    const t = body.pdfHeaderText;
    if (t === null || t === "") data.pdfHeaderText = null;
    else if (typeof t === "string") {
      if (t.length > MAX_PDF_BLOCK) {
        return NextResponse.json({ error: "Texte d’en-tête trop long." }, { status: 400 });
      }
      data.pdfHeaderText = t;
    }
  }
  if ("pdfFooterText" in body) {
    const t = body.pdfFooterText;
    if (t === null || t === "") data.pdfFooterText = null;
    else if (typeof t === "string") {
      if (t.length > MAX_PDF_BLOCK) {
        return NextResponse.json({ error: "Pied de page trop long." }, { status: 400 });
      }
      data.pdfFooterText = t;
    }
  }

  const prismaData = data as Record<string, string | null>;

  if (Object.keys(prismaData).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: prismaData,
    select: {
      email: true,
      name: true,
      imageUrl: true,
      pdfHeaderText: true,
      pdfFooterText: true,
      pdfHeaderImageUrl: true,
      pdfFooterImageUrl: true,
      pdfLogoUrl: true,
      pdfHeaderTitle: true,
      pdfHeaderAddress: true,
      pdfHeaderTableJson: true,
    },
  });

  const newToken = jwt.sign(
    { sub: userId, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" },
  );

  return NextResponse.json({
    token: newToken,
    email: user.email,
    name: user.name || "",
    imageUrl: user.imageUrl || "",
    pdfHeaderText: user.pdfHeaderText || "",
    pdfFooterText: user.pdfFooterText || "",
    pdfHeaderImageUrl: user.pdfHeaderImageUrl || "",
    pdfFooterImageUrl: user.pdfFooterImageUrl || "",
    pdfLogoUrl: user.pdfLogoUrl || "",
    pdfHeaderTitle: user.pdfHeaderTitle || "",
    pdfHeaderAddress: user.pdfHeaderAddress || "",
    pdfHeaderTableJson: user.pdfHeaderTableJson || "",
  });
}
