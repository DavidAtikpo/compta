import nodemailer from "nodemailer";
import { pool } from "./postgres";
import { accountantPortalLoginUrl, signAccountantPortalToken } from "./accountant-portal";
import { persistInvoiceSendRecipients } from "./invoice-send-recipients";
import { downloadInvoiceFileBuffer } from "./invoice-file-download";
import { ensureInvoiceShareTokens } from "./ensure-invoice-share-token";

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = String(raw || "").trim();
    if (!e || !SIMPLE_EMAIL.test(e)) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export async function resolveCabinetRecipientEmails(
  region: string,
  workspaceOwnerId: string,
): Promise<string[]> {
  const regionKey = String(region || "").trim().toLowerCase();
  const result = await pool.query(
    `SELECT email FROM accountants
     WHERE LOWER(TRIM(region)) = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)
     ORDER BY "createdAt" ASC`,
    [regionKey, workspaceOwnerId],
  );
  return dedupeEmails(result.rows.map((r: { email: string }) => r.email));
}

async function loadAttachmentsFromInvoiceIds(
  ids: string[],
  workspaceOwnerId: string,
  actorUserId: string,
  restrictAgentToOwnSubmissions: boolean,
): Promise<
  Array<{ filename: string; content: Buffer; contentType: string; invoiceId: string }>
> {
  if (ids.length === 0) return [];

  const agentClause = restrictAgentToOwnSubmissions
    ? ` AND "submittedByUserId" = $3`
    : "";
  const params = restrictAgentToOwnSubmissions
    ? [ids, workspaceOwnerId, actorUserId]
    : [ids, workspaceOwnerId];

  const result = await pool.query(
    `SELECT id, "fileUrl", "originalName", "mimeType"
     FROM invoices
     WHERE id = ANY($1::text[]) AND "userId" = $2 AND ("deletedAt" IS NULL) AND "fileUrl" IS NOT NULL${agentClause}`,
    params,
  );

  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    invoiceId: string;
  }> = [];

  for (const row of result.rows as Array<{
    id: string;
    fileUrl: string;
    originalName: string;
    mimeType: string | null;
  }>) {
    const downloaded = await downloadInvoiceFileBuffer({
      fileUrl: row.fileUrl,
      originalName: row.originalName,
      mimeType: row.mimeType,
    });
    if (!downloaded) continue;
    attachments.push({
      filename: downloaded.filename,
      content: downloaded.buffer,
      contentType: downloaded.contentType,
      invoiceId: row.id,
    });
  }

  return attachments;
}

export type CabinetSendResult = {
  success: boolean;
  message: string;
  recipient?: string;
  recipients?: string[];
  partial?: boolean;
  error?: string;
};

export async function sendInvoicesToCabinet(options: {
  workspaceOwnerId: string;
  actorUserId: string;
  restrictAgentToOwnSubmissions: boolean;
  region: string;
  invoiceIds: string[];
  recipientEmails?: string[];
  senderName?: string;
  message?: string;
}): Promise<CabinetSendResult> {
  const {
    workspaceOwnerId,
    actorUserId,
    restrictAgentToOwnSubmissions,
    region,
    invoiceIds,
    senderName = "Client Compta IA",
  } = options;

  const regionKey = String(region || "france").trim().toLowerCase();
  const message =
    options.message ||
    "Merci de trouver ci-joint les pièces justificatives comptables.";

  let recipientEmails = dedupeEmails(options.recipientEmails ?? []);
  if (recipientEmails.length === 0) {
    recipientEmails = await resolveCabinetRecipientEmails(regionKey, workspaceOwnerId);
  }
  if (recipientEmails.length === 0) {
    return {
      success: false,
      error: `Aucune adresse email configurée pour la région « ${regionKey} ».`,
      message: "",
    };
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  const fromEmail =
    process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return {
      success: false,
      error: "Configuration SMTP manquante.",
      message: "",
    };
  }

  const ids = invoiceIds.filter(Boolean);
  if (ids.length === 0) {
    return { success: false, error: "Aucune facture à envoyer.", message: "" };
  }

  await ensureInvoiceShareTokens(ids, workspaceOwnerId);

  const fromDb = await loadAttachmentsFromInvoiceIds(
    ids,
    workspaceOwnerId,
    actorUserId,
    restrictAgentToOwnSubmissions,
  );
  if (fromDb.length === 0) {
    return {
      success: false,
      error: "Aucune pièce jointe récupérable depuis Cloudinary.",
      message: "",
    };
  }

  const filteredAttachments = fromDb.map(({ invoiceId: _id, ...rest }) => rest);
  const attachmentInvoiceIds = fromDb.map((a) => a.invoiceId);
  const recipientEmail = recipientEmails.join(", ");
  const primaryRecipient = recipientEmails[0] ?? "";
  const regionLabel = regionKey.charAt(0).toUpperCase() + regionKey.slice(1);

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
  });

  let sendSuccess = false;
  let sendError: string | undefined;
  const sendErrors: string[] = [];

  for (const to of recipientEmails) {
    const portalUrl = accountantPortalLoginUrl(signAccountantPortalToken(to));
    try {
      await transporter.sendMail({
        from: `${senderName} <${fromEmail}>`,
        to: [to],
        subject: `[Compta IA] Transmission pièces justificatives – ${regionLabel}`,
        text: `${message}\n\nRégion : ${regionLabel}\nExpéditeur : ${senderName}\nFichiers joints : ${filteredAttachments.length}`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e293b;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">Compta IA — Transmission comptable</h2>
            <p style="margin:4px 0 0;opacity:0.8;font-size:14px">Région : ${regionLabel}</p>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#475569">${message.replace(/\n/g, "<br>")}</p>
            <hr style="border-color:#e2e8f0;margin:16px 0">
            <p style="font-size:13px;color:#64748b">
              <strong>Expéditeur :</strong> ${senderName}<br>
              <strong>Fichiers joints :</strong> ${filteredAttachments.map((a) => a.filename).join(", ")}
            </p>
            <p style="margin-top:16px;padding:12px;background:#eef2ff;border-radius:8px;font-size:13px;color:#3730a3">
              <strong>Portail comptable :</strong>
              <a href="${portalUrl}" style="color:#4f46e5;font-weight:600">Consulter et confirmer la réception</a>
              (lien valide 7 jours).
            </p>
          </div>
        </div>`,
        attachments: filteredAttachments,
      });
      sendSuccess = true;
    } catch (error) {
      const msg = (error as Error).message;
      if ((error as { code?: string }).code === "EAUTH") {
        sendErrors.push(
          "Connexion SMTP refusée. Vérifiez les identifiants Gmail / mot de passe d'application.",
        );
        sendError = sendErrors[0];
        break;
      }
      sendErrors.push(`${to}: ${msg}`);
    }
  }

  if (!sendSuccess && sendErrors.length === 0) sendError = "Aucun envoi effectué.";
  else if (sendErrors.length > 0 && sendSuccess) {
    sendError = `Envoi partiel — échec pour : ${sendErrors.join(" ; ")}`;
  } else if (sendErrors.length > 0) sendError = sendErrors.join(" ; ");

  try {
    await pool.query(
      `INSERT INTO send_history (id, "userId", region, "recipientEmail", message, "filesCount", "sentAt", success, error)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [
        workspaceOwnerId,
        regionKey,
        recipientEmail,
        message,
        filteredAttachments.length,
        sendSuccess,
        sendError || null,
      ],
    );
  } catch (dbError) {
    console.error("Erreur sauvegarde historique:", dbError);
  }

  if (sendSuccess && attachmentInvoiceIds.length > 0) {
    try {
      let accountantId: string | null = null;
      if (primaryRecipient) {
        const accRes = await pool.query(
          `SELECT id FROM accountants
           WHERE "userId" = $1 AND LOWER(TRIM(region)) = $2 AND LOWER(email) = LOWER($3) AND "deletedAt" IS NULL
           ORDER BY "createdAt" ASC LIMIT 1`,
          [workspaceOwnerId, regionKey, primaryRecipient],
        );
        if (accRes.rows.length > 0) accountantId = accRes.rows[0].id as string;
      }

      const sets = [`status = 'sent'`, `"sentAt" = NOW()`, `"updatedAt" = NOW()`];
      const params: unknown[] = [attachmentInvoiceIds, workspaceOwnerId];
      let idx = 3;
      if (accountantId) {
        sets.push(`"accountantId" = $${idx++}`);
        params.push(accountantId);
      }
      let where = `id = ANY($1::text[]) AND "userId" = $2 AND ("deletedAt" IS NULL)`;
      if (restrictAgentToOwnSubmissions) {
        where += ` AND "submittedByUserId" = $${idx++}`;
        params.push(actorUserId);
      }
      await pool.query(`UPDATE invoices SET ${sets.join(", ")} WHERE ${where}`, params);
      await persistInvoiceSendRecipients(
        workspaceOwnerId,
        attachmentInvoiceIds,
        recipientEmails,
        new Date(),
      );
    } catch (dbError) {
      console.error("Erreur mise à jour statut factures:", dbError);
    }
  }

  if (!sendSuccess) {
    return { success: false, error: sendError, message: "" };
  }

  const recipientLabel =
    recipientEmails.length === 1
      ? recipientEmails[0]
      : `${recipientEmails.length} cabinets (${recipientEmail})`;

  return {
    success: true,
    partial: sendErrors.length > 0,
    recipient: recipientEmail,
    recipients: recipientEmails,
    message:
      sendErrors.length > 0
        ? `Email envoyé partiellement — ${recipientLabel}. ${sendError}`
        : recipientEmails.length === 1
          ? `Email envoyé au cabinet ${regionLabel} (${recipientEmails[0]}).`
          : `Email envoyé à ${recipientEmails.length} cabinets (${regionLabel}).`,
  };
}
