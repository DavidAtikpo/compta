import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { detectBankFormat, parseBankFile } from "@/lib/bank-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId } = await resolveInvoiceWorkspace(userId);

  let content = "";
  let fileName = "import.csv";
  let format: "csv" | "ofx" | "qif" | null = null;
  let bankAccountId: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    format = (form.get("format") as "csv" | "ofx" | "qif" | null) ?? null;
    bankAccountId = (form.get("bankAccountId") as string | null) ?? null;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    }
    fileName = file.name;
    content = await file.text();
  } else {
    const body = await request.json().catch(() => ({}));
    content = String(body.content ?? "");
    fileName = String(body.fileName ?? "import.csv");
    format = body.format ?? null;
    bankAccountId = body.bankAccountId ?? null;
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "Contenu vide." }, { status: 400 });
  }

  const detected = format ?? detectBankFormat(fileName, content);
  const parsed = parseBankFile(content, detected);
  if (!parsed.length) {
    return NextResponse.json({ error: "Aucune transaction reconnue dans le fichier." }, { status: 422 });
  }

  const batch = await prisma.bankImportBatch.create({
    data: {
      userId: workspaceOwnerId,
      format: detected,
      fileName,
      rowCount: parsed.length,
    },
  });

  const created = await prisma.$transaction(
    parsed.map((row) =>
      prisma.bankTransaction.create({
        data: {
          userId: workspaceOwnerId,
          bankAccountId,
          importBatchId: batch.id,
          transactionDate: row.date,
          label: row.label,
          amount: row.amount,
          reference: row.reference ?? null,
          rawData: row.raw ?? null,
        },
      }),
    ),
  );

  return NextResponse.json({
    batch,
    imported: created.length,
    format: detected,
    transactions: created,
  });
}
