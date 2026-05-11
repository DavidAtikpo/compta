import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";
import { isAdminEmail } from "@/lib/admin";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in environment variables.");
}

function adminRoleFromEmail(email: string): "super_admin" | "support_admin" | "read_only_admin" | null {
  const normalized = email.trim().toLowerCase();
  const direct = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (direct && normalized === direct) return "super_admin";

  const parseEmails = (value: string | undefined) =>
    new Set(
      (value || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    );
  if (parseEmails(process.env.ADMIN_EMAILS).has(normalized)) return "super_admin";

  // Backward compatible legacy vars: treat as super admin
  if (parseEmails(process.env.ADMIN_SUPER_EMAILS).has(normalized)) return "super_admin";
  if (parseEmails(process.env.ADMIN_SUPPORT_EMAILS).has(normalized)) return "super_admin";
  if (parseEmails(process.env.ADMIN_READONLY_EMAILS).has(normalized)) return "super_admin";
  return null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Token manquant." }, { status: 401 });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as {
      sub?: string;
      email: string;
      name?: string | null;
    };
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          imageUrl: true,
          pdfHeaderText: true,
          pdfFooterText: true,
          pdfHeaderImageUrl: true,
          pdfFooterImageUrl: true,
          pdfLogoUrl: true,
          pdfHeaderTitle: true,
          pdfHeaderAddress: true,
          pdfHeaderTableJson: true,
          pdfHeaderLayout: true,
          aiCreditsBalance: true,
          billingPlan: true,
        },
      });
      if (user) {
        return NextResponse.json({
          email: user.email,
          name: user.name || "",
          isAdmin: isAdminEmail(user.email),
          adminRole: adminRoleFromEmail(user.email),
          imageUrl: user.imageUrl || "",
          pdfHeaderText: user.pdfHeaderText || "",
          pdfFooterText: user.pdfFooterText || "",
          pdfHeaderImageUrl: user.pdfHeaderImageUrl || "",
          pdfFooterImageUrl: user.pdfFooterImageUrl || "",
          pdfLogoUrl: user.pdfLogoUrl || "",
          pdfHeaderTitle: user.pdfHeaderTitle || "",
          pdfHeaderAddress: user.pdfHeaderAddress || "",
          pdfHeaderTableJson: user.pdfHeaderTableJson || "",
          pdfHeaderLayout: user.pdfHeaderLayout || "stacked",
          aiCreditsBalance: user.aiCreditsBalance ?? 0,
          billingPlan: user.billingPlan || "starter",
        });
      }
    }
    return NextResponse.json({
      email: payload.email,
      name: payload.name || "",
      isAdmin: isAdminEmail(payload.email),
      adminRole: adminRoleFromEmail(payload.email),
      imageUrl: "",
      pdfHeaderText: "",
      pdfFooterText: "",
      pdfHeaderImageUrl: "",
      pdfFooterImageUrl: "",
      pdfLogoUrl: "",
      pdfHeaderTitle: "",
      pdfHeaderAddress: "",
      pdfHeaderTableJson: "",
      pdfHeaderLayout: "stacked",
      aiCreditsBalance: 0,
      billingPlan: "starter",
    });
  } catch {
    return NextResponse.json({ error: "Token invalide." }, { status: 401 });
  }
}
