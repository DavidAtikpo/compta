import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { accountantPortalLoginUrl, signAccountantPortalToken } from "@/lib/accountant-portal";
import { persistInvoiceSendRecipients } from "@/lib/invoice-send-recipients";

export const runtime = "nodejs";

async function resolveRecipientEmails(region: string, userId: string): Promise<string[]> {
  const regionKey = String(region || "").trim().toLowerCase();
  try {
    const result = await pool.query(
      `SELECT email FROM accountants
       WHERE LOWER(TRIM(region)) = $1 AND "userId" = $2 AND ("deletedAt" IS NULL)
       ORDER BY "createdAt" ASC`,
      [regionKey, userId],
    );
    return result.rows
      .map((r: { email: string }) => String(r.email || "").trim())
      .filter(Boolean);
  } catch (err) {
    console.error("DB lookup failed:", err);
  }
  return [];
}

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

function parseRecipientEmailsFromForm(formData: FormData): string[] {
  const fromList = formData
    .getAll("recipientEmails")
    .map((e) => String(e).trim())
    .filter(Boolean);
  if (fromList.length > 0) return dedupeEmails(fromList);

  const override = formData.get("recipientEmail")?.toString().trim() ?? "";
  if (!override) return [];
  return dedupeEmails(
    override
      .split(/[,;]+/)
      .map((e) => e.trim())
      .filter(Boolean),
  );
}

export async function POST(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  const formData = await request.formData();
  const region = (formData.get("region")?.toString() || "france").trim().toLowerCase();
  const message =
    formData.get("message")?.toString() ||
    "Merci de trouver ci-joint les pièces justificatives comptables.";
  const senderName =
    formData.get("senderName")?.toString() || "Client Compta IA";
  const files = formData.getAll("files");
  const invoiceIds = formData.getAll("invoiceIds");
  /** Destinataires choisis (liste ou champ legacy séparé par virgules). */
  const recipientEmailsOverride = parseRecipientEmailsFromForm(formData);

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail =
    process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json(
      {
        error:
          "Variables SMTP_HOST, SMTP_USER et SMTP_PASS non configurées. Impossible d'envoyer.",
      },
      { status: 500 }
    );
  }

  let recipientEmails: string[];
  if (recipientEmailsOverride.length > 0) {
    recipientEmails = recipientEmailsOverride;
  } else {
    recipientEmails = await resolveRecipientEmails(region, workspaceOwnerId);
    if (recipientEmails.length === 0) {
      return NextResponse.json(
        {
          error: `Aucune adresse email configurée pour la région "${region}". Sélectionnez au moins un cabinet ou ajoutez-en dans Paramètres.`,
        },
        { status: 400 }
      );
    }
  }
  const recipientEmail = recipientEmails.join(", ");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const attachments = await Promise.all(
    files.map(async (file) => {
      if (file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer());
        return {
          filename: file.name,
          content: buffer,
          contentType: file.type || "application/octet-stream",
        };
      }
      return null;
    })
  );

  const filteredAttachments = attachments.filter(Boolean) as Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;

  const regionLabel =
    region.charAt(0).toUpperCase() + region.slice(1);

  const primaryRecipient = recipientEmails[0] ?? "";

  let sendSuccess = false;
  let sendError: string | undefined;
  const sendErrors: string[] = [];

  for (const to of recipientEmails) {
    const portalUrl = to
      ? accountantPortalLoginUrl(signAccountantPortalToken(to))
      : null;
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
              <strong>Fichiers joints :</strong> ${filteredAttachments.map((a) => a.filename).join(", ") || "aucun"}
            </p>
            ${
              portalUrl
                ? `<p style="margin-top:16px;padding:12px;background:#eef2ff;border-radius:8px;font-size:13px;color:#3730a3">
              <strong>Portail comptable :</strong> consultez et validez toutes les factures de vos clients sur
              <a href="${portalUrl}" style="color:#4f46e5;font-weight:600">Compta IA — Espace comptable</a>
              (lien valide 7 jours).
            </p>`
                : ""
            }
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center">Envoyé via Compta IA — Application de gestion comptable</p>
        </div>
      `,
        attachments: filteredAttachments,
      });
      sendSuccess = true;
    } catch (error) {
      const msg = (error as Error).message;
      console.error(`Erreur envoi email à ${to}:`, error);
      if ((error as { code?: string }).code === "EAUTH") {
        sendErrors.push(
          "Connexion SMTP refusée (identifiants Gmail invalides). Utilisez un mot de passe d'application Google.",
        );
        sendError = sendErrors[0];
        break;
      }
      sendErrors.push(`${to}: ${msg}`);
    }
  }

  if (!sendSuccess && sendErrors.length === 0) {
    sendError = "Aucun envoi effectué.";
  } else if (sendErrors.length > 0 && sendSuccess) {
    sendError = `Envoi partiel — échec pour : ${sendErrors.join(" ; ")}`;
  } else if (sendErrors.length > 0) {
    sendError = sendErrors.join(" ; ");
  }

  // Log to send_history (lié au compte utilisateur)
  try {
    await pool.query(
      `INSERT INTO send_history (id, "userId", region, "recipientEmail", message, "filesCount", "sentAt", success, error)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [
        workspaceOwnerId,
        region,
        recipientEmail,
        message,
        filteredAttachments.length,
        sendSuccess,
        sendError || null,
      ]
    );
  } catch (dbError) {
    console.error("Erreur sauvegarde historique:", dbError);
  }

  // Mark invoices as sent
  if (sendSuccess && invoiceIds.length > 0) {
    try {
      const ids = invoiceIds.map((id) => id.toString()).filter(Boolean);
      if (ids.length > 0) {
        let accountantId: string | null = null;
        if (primaryRecipient) {
          const accRes = await pool.query(
            `SELECT id FROM accountants
             WHERE "userId" = $1 AND LOWER(TRIM(region)) = $2 AND LOWER(email) = LOWER($3) AND "deletedAt" IS NULL
             ORDER BY "createdAt" ASC LIMIT 1`,
            [workspaceOwnerId, region, primaryRecipient],
          );
          if (accRes.rows.length > 0) {
            accountantId = accRes.rows[0].id as string;
          }
        }

        const sets = [`status = 'sent'`, `"sentAt" = NOW()`, `"updatedAt" = NOW()`];
        const params: unknown[] = [ids, workspaceOwnerId];
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

        await persistInvoiceSendRecipients(workspaceOwnerId, ids, recipientEmails, new Date());
      }
    } catch (dbError) {
      console.error("Erreur mise à jour statut factures:", dbError);
    }
  }

  if (!sendSuccess) {
    return NextResponse.json(
      { error: `Erreur envoi email : ${sendError}` },
      { status: 502 }
    );
  }

  const recipientLabel =
    recipientEmails.length === 1
      ? recipientEmails[0]
      : `${recipientEmails.length} cabinets (${recipientEmail})`;

  return NextResponse.json({
    success: true,
    message:
      sendErrors.length > 0
        ? `Email envoyé partiellement — ${recipientLabel}. ${sendError}`
        : recipientEmails.length === 1
          ? `Email envoyé au cabinet ${regionLabel} (${recipientEmails[0]}).`
          : `Email envoyé à ${recipientEmails.length} cabinets (${regionLabel}) : ${recipientEmail}.`,
    recipient: recipientEmail,
    recipients: recipientEmails,
    partial: sendErrors.length > 0,
  });
}
