import { prisma } from "@/lib/prisma";

/** Limite par export PDF (côté API et UI). */
export const MAX_PDF_INVOICES = 500;

/** Nom affiché dans le titre PDF : entreprise du propriétaire, pas le nom utilisateur. */
export async function resolvePdfEnterpriseName(ownerUserId: string): Promise<string | null> {
  const enterprise = await prisma.enterprise.findFirst({
    where: { ownerId: ownerUserId },
    select: { name: true },
  });
  const fromEnterprise = enterprise?.name?.trim();
  if (fromEnterprise) return fromEnterprise;

  const user = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { pdfHeaderTitle: true },
  });
  return user?.pdfHeaderTitle?.trim() || null;
}
