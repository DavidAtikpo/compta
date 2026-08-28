import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export type AccountantPortalPayload = {
  role: "accountant";
  email: string;
  sub: string;
};

export function signAccountantPortalToken(email: string): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET must be set.");
  const normalized = email.trim().toLowerCase();
  return jwt.sign({ role: "accountant", email: normalized, sub: normalized }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyAccountantPortalToken(token: string): AccountantPortalPayload | null {
  if (!JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<AccountantPortalPayload>;
    if (payload.role !== "accountant" || typeof payload.email !== "string") return null;
    return {
      role: "accountant",
      email: payload.email.trim().toLowerCase(),
      sub: payload.sub ?? payload.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function accountantPortalLoginUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/accountant/portal?token=${encodeURIComponent(token)}`;
}

/** Vérifie qu'au moins un cabinet utilise cette adresse email. */
export async function isRegisteredAccountantEmail(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const result = await pool.query(
    `SELECT 1 FROM accountants WHERE LOWER(email) = $1 AND "deletedAt" IS NULL LIMIT 1`,
    [normalized],
  );
  return result.rows.length > 0;
}
