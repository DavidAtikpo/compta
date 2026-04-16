import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { pool } from "../../../lib/postgres";

export const runtime = "nodejs";

const envFallbackEmails: Record<string, string> = {
  france: process.env.ACCOUNTANT_EMAIL_FRANCE || "",
  togo: process.env.ACCOUNTANT_EMAIL_TOGO || "",
  vietnam: process.env.ACCOUNTANT_EMAIL_VIETNAM || "",
  autre: process.env.ACCOUNTANT_EMAIL_AUTRE || "",
};

async function resolveRecipientEmail(region: string): Promise<string> {
  // 1. Try database first (user-configured)
  try {
    const result = await pool.query(
      "SELECT email FROM accountants WHERE region = $1",
      [region]
    );
    if (result.rows.length > 0 && result.rows[0].email) {
      return result.rows[0].email as string;
    }
  } catch (err) {
    console.error("DB lookup failed, falling back to env:", err);
  }

  // 2. Fall back to env vars
  if (envFallbackEmails[region]) {
    return envFallbackEmails[region];
  }

  // 3. Generic fallback
  return process.env.FROM_EMAIL || "";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const region = formData.get("region")?.toString() || "france";
  const message =
    formData.get("message")?.toString() ||
    "Merci de trouver ci-joint les pièces justificatives comptables.";
  const senderName =
    formData.get("senderName")?.toString() || "Client Compta IA";
  const files = formData.getAll("files");
  const invoiceIds = formData.getAll("invoiceIds");

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

  const recipientEmail = await resolveRecipientEmail(region);
  if (!recipientEmail) {
    return NextResponse.json(
      {
        error: `Aucune adresse email configurée pour la région "${region}". Allez dans Paramètres pour configurer le cabinet.`,
      },
      { status: 400 }
    );
  }

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
      to: recipientEmail,
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

  // Log to send_history
  try {
    await pool.query(
      `INSERT INTO send_history (id, region, "recipientEmail", message, "filesCount", "sentAt", success, error)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), $5, $6)`,
      [region, recipientEmail, message, filteredAttachments.length, sendSuccess, sendError || null]
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
           WHERE id = ANY($1::text[])`,
          [ids]
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
