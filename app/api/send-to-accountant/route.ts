import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";

export const runtime = "nodejs";

async function resolveRecipientEmails(region: string, userId: string): Promise<string[]> {
  try {
    const result = await pool.query(
      `SELECT email FROM accountants WHERE region = $1 AND "userId" = $2 ORDER BY "createdAt" ASC`,
      [region, userId]
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

export async function POST(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const formData = await request.formData();
  const region = formData.get("region")?.toString() || "france";
  const message =
    formData.get("message")?.toString() ||
    "Merci de trouver ci-joint les pièces justificatives comptables.";
  const senderName =
    formData.get("senderName")?.toString() || "Client Compta IA";
  const files = formData.getAll("files");
  const invoiceIds = formData.getAll("invoiceIds");
  /** Si renseigné, envoi uniquement à cette adresse (choix utilisateur sur l’interface). */
  const recipientEmailOverride = formData.get("recipientEmail")?.toString().trim() ?? "";

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.FROM_EMAIL || smtpUser;

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
  if (recipientEmailOverride) {
    if (!SIMPLE_EMAIL.test(recipientEmailOverride)) {
      return NextResponse.json(
        { error: "Adresse email du cabinet invalide." },
        { status: 400 }
      );
    }
    recipientEmails = [recipientEmailOverride];
  } else {
    recipientEmails = await resolveRecipientEmails(region, userId);
    if (recipientEmails.length === 0) {
      return NextResponse.json(
        {
          error: `Aucune adresse email configurée pour la région "${region}". Saisissez une adresse ou ajoutez un cabinet dans Paramètres.`,
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

  let sendSuccess = false;
  let sendError: string | undefined;

  try {
    await transporter.sendMail({
      from: `${senderName} <${fromEmail}>`,
      to: recipientEmails,
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
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center">Envoyé via Compta IA — Application de gestion comptable</p>
        </div>
      `,
      attachments: filteredAttachments,
    });
    sendSuccess = true;
  } catch (error) {
    sendError = (error as Error).message;
    console.error("Erreur envoi email:", error);
  }

  // Log to send_history (lié au compte utilisateur)
  try {
    await pool.query(
      `INSERT INTO send_history (id, "userId", region, "recipientEmail", message, "filesCount", "sentAt", success, error)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7)`,
      [
        userId,
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
        await pool.query(
          `UPDATE invoices SET status = 'sent', "sentAt" = NOW(), "updatedAt" = NOW()
           WHERE id = ANY($1::text[]) AND "userId" = $2`,
          [ids, userId]
        );
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

  return NextResponse.json({
    success: true,
    message: `Email envoyé au cabinet ${regionLabel} (${recipientEmail}).`,
    recipient: recipientEmail,
  });
}
