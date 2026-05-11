import { prisma } from "@/lib/prisma";

export type WorkspaceResolution = {
  workspaceOwnerId: string;
  actorUserId: string;
  /** Membre entreprise avec rôle « agent » : ne voit / ne modifie que les factures qu’il a déposées (`submittedByUserId`). */
  restrictAgentToOwnSubmissions: boolean;
};

/**
 * Compte « racine » des factures : propriétaire d’entreprise, sinon membre actif → compte du dirigeant, sinon l’utilisateur lui-même.
 */
export async function resolveInvoiceWorkspace(actorUserId: string): Promise<WorkspaceResolution> {
  const ownEnterprise = await prisma.enterprise.findFirst({
    where: { ownerId: actorUserId },
    select: { id: true },
  });
  if (ownEnterprise) {
    return {
      workspaceOwnerId: actorUserId,
      actorUserId: actorUserId,
      restrictAgentToOwnSubmissions: false,
    };
  }

  const asMember = await prisma.enterpriseMember.findFirst({
    where: { userId: actorUserId, status: "active" },
    select: { role: true, enterprise: { select: { ownerId: true } } },
  });
  if (asMember) {
    const restrictAgentToOwnSubmissions =
      String(asMember.role ?? "agent").toLowerCase() === "agent";
    return {
      workspaceOwnerId: asMember.enterprise.ownerId,
      actorUserId: actorUserId,
      restrictAgentToOwnSubmissions,
    };
  }

  return {
    workspaceOwnerId: actorUserId,
    actorUserId: actorUserId,
    restrictAgentToOwnSubmissions: false,
  };
}
