import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

export function getUserIdFromJwt(token: string): string | null {
  if (!JWT_SECRET) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: string };
    return typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

export function getAuthenticatedUserId(request: Request): string | null {
  const token = getBearerToken(request);
  if (!token) return null;
  return getUserIdFromJwt(token);
}
