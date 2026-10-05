import jwt from "jsonwebtoken";
import { verifyAccountantPortalToken, type AccountantPortalPayload } from "./accountant-portal";

const JWT_SECRET = process.env.JWT_SECRET as string;

export type PortalRequestContext = AccountantPortalPayload;

export function getPortalContextFromRequest(request: Request): PortalRequestContext | null {
  const token = getBearerToken(request);
  if (!token) return null;
  return verifyAccountantPortalToken(token);
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

function getComptaTokenFromCookie(request: Request): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    if (name !== "compta-token") continue;
    const value = trimmed.slice(eq + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function getAuthTokenFromRequest(request: Request): string | null {
  return getBearerToken(request) || getComptaTokenFromCookie(request);
}

export function getUserIdFromJwt(token: string): string | null {
  if (!JWT_SECRET) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: string; role?: string };
    if (p.role === "accountant") return null;
    return typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

export function getAccountantEmailFromRequest(request: Request): string | null {
  return getPortalContextFromRequest(request)?.email ?? null;
}

export function getAuthenticatedUserId(request: Request): string | null {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  return getUserIdFromJwt(token);
}
