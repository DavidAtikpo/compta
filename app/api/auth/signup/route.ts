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
  const name = body.name?.toString()?.trim();

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email et mot de passe (6 caractères minimum) sont requis." },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
    },
  });

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: "7d",
  });

  return NextResponse.json({ token, email: user.email, name: user.name || "" });
}
