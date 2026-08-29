import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { pool } from "@/lib/postgres";
import {
  accountantPortalLoginUrl,
  isRegisteredAccountantEmail,
  signAccountantPortalToken,
} from "@/lib/accountant-portal";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = body.email?.toString().trim().toLowerCase() ?? "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }

  const registered = await isRegisteredAccountantEmail(pool, email);
  const genericMessage =
    "Si cette adresse est enregistrée comme cabinet comptable, vous recevrez un lien de connexion.";

  if (!registered) {
    return NextResponse.json({ success: true, message: genericMessage });
  }

  const token = signAccountantPortalToken(email);
  const loginUrl = accountantPortalLoginUrl(token);

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || smtpUser;

  let emailSent = false;
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: `Compta IA <${fromEmail}>`,
        to: email,
        subject: "Connexion portail comptable — Compta IA",
        text: `Bonjour,\n\nAccédez à votre portail comptable pour consulter et valider les factures de vos clients :\n${loginUrl}\n\nCe lien expire dans 7 jours.\n\n— Compta IA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#1e293b">Portail comptable Compta IA</h2>
            <p style="color:#475569">Consultez les factures transmises par vos clients, filtrez par devise et validez ou rejetez les pièces.</p>
            <p><a href="${loginUrl}" style="display:inline-block;background:#1e293b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Accéder au portail</a></p>
            <p style="font-size:12px;color:#94a3b8">Lien valide 7 jours. Si vous n'avez pas demandé cet accès, ignorez ce message.</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (err) {
      console.error("Erreur envoi magic link comptable:", err);
    }
  }

  const isDev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    success: true,
    message: emailSent
      ? "Un lien de connexion a été envoyé à votre adresse email."
      : genericMessage,
    ...(isDev && !emailSent ? { devLoginUrl: loginUrl } : {}),
  });
}
