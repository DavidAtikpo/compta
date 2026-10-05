import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { probeVisionOcrApi } from "@/lib/server-ocr";

export const runtime = "nodejs";

/** Vérifie OCR_API_KEY + réponse Google Vision (utilisateur connecté). */
export async function GET(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const result = await probeVisionOcrApi();
  return NextResponse.json(result);
}
