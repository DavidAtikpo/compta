import { prisma } from "@/lib/prisma";
import { getBearerToken, getUserIdFromJwt } from "@/lib/auth-request";

export type AdminRole = "super_admin" | "support_admin" | "read_only_admin";

function getSingleAdminEmail(): string | null {
  const direct = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (direct) return direct;

  // Backward compatible: allow ADMIN_EMAILS with a single value
  const raw = process.env.ADMIN_EMAILS || "";
  const first = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)[0];
  return first || null;
}

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  const emails = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

function parseEmailSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getRoleByEmail(email: string): AdminRole | null {
  const normalizedEmail = email.trim().toLowerCase();
  const single = getSingleAdminEmail();
  if (single && normalizedEmail === single) return "super_admin";

  // Backward compatible: if multiple emails were provided, treat them as super admins.
  if (getAdminEmails().has(normalizedEmail)) return "super_admin";

  // Legacy env vars (if still present): treat any match as super admin.
  if (parseEmailSet(process.env.ADMIN_SUPER_EMAILS).has(normalizedEmail)) return "super_admin";
  if (parseEmailSet(process.env.ADMIN_SUPPORT_EMAILS).has(normalizedEmail)) return "super_admin";
  if (parseEmailSet(process.env.ADMIN_READONLY_EMAILS).has(normalizedEmail)) return "super_admin";

  return null;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getRoleByEmail(email) !== null;
}

export function canAdminWrite(role: AdminRole): boolean {
  return role === "super_admin";
}

export function canAdminDelete(role: AdminRole): boolean {
  return role === "super_admin";
}

export async function getAdminUserFromRequest(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;
  const userId = getUserIdFromJwt(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!user) return null;
  const role = getRoleByEmail(user.email);
  if (!role) return null;
  return { ...user, role };
}
