import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../lib/prisma";

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
