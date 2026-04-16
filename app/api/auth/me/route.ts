import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Token manquant." }, { status: 401 });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as { email: string; name?: string };
    return NextResponse.json({ email: payload.email, name: payload.name || "" });
  } catch (error) {
    return NextResponse.json({ error: "Token invalide." }, { status: 401 });
  }
}
