import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { isPrismaConnectionError, prisma, resetPrismaClient } from "../../../../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
}

export async function POST(request: Request) {
  const body = await request.json();
  const email = body.email?.toString().trim().toLowerCase();
  const password = body.password?.toString().trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe sont requis." }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
    });
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      resetPrismaClient();
      try {
        user = await prisma.user.findUnique({
          where: { email },
        });
      } catch (retryError) {
        if (isPrismaConnectionError(retryError)) {
          return NextResponse.json(
            {
              error:
                "Base de données indisponible (Neon en veille ou réseau). Réessayez dans quelques secondes.",
            },
            { status: 503 },
          );
        }
        throw retryError;
      }
    } else {
      throw error;
    }
  }

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
