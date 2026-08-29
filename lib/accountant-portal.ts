import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export type AccountantPortalPayload = {
  role: "accountant";
  email: string;
  sub: string;
  mode?: "cabinet" | "owner";
  ownerUserId?: string;
};

export function signAccountantPortalToken(
  email: string,
  opts?: { mode?: "cabinet" | "owner"; ownerUserId?: string },
): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET must be set.");
  const normalized = email.trim().toLowerCase();
  const mode = opts?.mode ?? "cabinet";
  const payload: AccountantPortalPayload = {
    role: "accountant",
    email: normalized,
    sub: normalized,
    mode,
  };
  if (mode === "owner" && opts?.ownerUserId) {
    payload.ownerUserId = opts.ownerUserId;
    payload.sub = opts.ownerUserId;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
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
      mode: payload.mode === "owner" ? "owner" : "cabinet",
      ownerUserId: typeof payload.ownerUserId === "string" ? payload.ownerUserId : undefined,
    };
  } catch {
    return null;
  }
}

export function accountantPortalLoginUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/accountant/portal?token=${encodeURIComponent(token)}`;
}

export const ACCOUNTANT_PORTAL_LS_TOKEN = "compta-accountant-token";

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
