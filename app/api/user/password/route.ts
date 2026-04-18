import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
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

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;

  const currentPassword = body?.currentPassword?.toString() ?? "";
  const newPassword = body?.newPassword?.toString() ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Mot de passe actuel et nouveau mot de passe sont requis." },
      { status: 400 },
    );
  }
  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 6 caractères." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  const newToken = jwt.sign(
    { sub: userId, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" },
  );

  return NextResponse.json({ token: newToken, ok: true });
}
