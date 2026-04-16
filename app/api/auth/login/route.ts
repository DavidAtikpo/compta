import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
}

export async function POST(request: Request) {
  const body = await request.json();
  const email = body.email?.toString().trim().toLowerCase();
  const password = body.password?.toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe sont requis." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return NextResponse.json({ error: "Email ou mot de passe invalide." }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Email ou mot de passe invalide." }, { status: 401 });
  }

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: "7d",
  });

  return NextResponse.json({ token, email: user.email, name: user.name || "" });
}
