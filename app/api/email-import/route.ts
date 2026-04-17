import { NextResponse } from "next/server";
import { pool } from "../../../lib/postgres";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureFileNameWithExt(filename: string, contentType: string): string {
  const hasExt = /\.[a-z0-9]+$/i.test(filename);
  if (hasExt) return filename;
  if (contentType.includes("pdf")) return `${filename}.pdf`;
  if (contentType.includes("png")) return `${filename}.png`;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return `${filename}.jpg`;
  if (contentType.includes("webp")) return `${filename}.webp`;
  if (contentType.includes("gif")) return `${filename}.gif`;
  return `${filename}.bin`;
}

function imapFetchEmails(config: {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}): Promise<{ subject: string; from: string; attachments: { filename: string; content: Buffer; contentType: string }[] }[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000,
    });

    const emails: { subject: string; from: string; attachments: { filename: string; content: Buffer; contentType: string }[] }[] = [];

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err) => {
        if (err) { imap.end(); reject(err); return; }

        // Fetch emails from the last 7 days with attachments
        const since = new Date();
        since.setDate(since.getDate() - 7);

        imap.search(["UNSEEN", ["SINCE", since]], (err, uids) => {
          if (err || !uids || uids.length === 0) {
            imap.end();
            resolve([]);
            return;
          }

          const fetch = imap.fetch(uids.slice(0, 20), { bodies: "", struct: true });

          fetch.on("message", (msg) => {
            const buffers: Buffer[] = [];
            msg.on("body", (stream) => {
              stream.on("data", (chunk) => buffers.push(chunk));
              stream.once("end", async () => {
                try {
                  const parsed = await simpleParser(Buffer.concat(buffers));
                  const attachments = (parsed.attachments ?? [])
                    .filter((a) => {
                      const ct = a.contentType ?? "";
                      return (
                        ct.includes("pdf") ||
                        ct.includes("image") ||
                        (a.filename ?? "").match(/\.(pdf|jpg|jpeg|png|webp)$/i)
                      );
                    })
                    .map((a) => ({
                      filename: a.filename ?? "pièce_jointe",
                      content: a.content as Buffer,
                      contentType: a.contentType ?? "application/octet-stream",
                    }));

                  if (attachments.length > 0) {
                    emails.push({
                      subject: parsed.subject ?? "(sans objet)",
                      from: parsed.from?.text ?? "",
                      attachments,
                    });
                  }
                } catch {
                  // Skip parse errors
                }
              });
            });
          });

          fetch.once("end", () => {
            imap.end();
          });

          fetch.once("error", () => {
            imap.end();
            resolve(emails);
          });
        });
      });
    });

    imap.once("end", () => resolve(emails));
    imap.once("error", (err) => reject(err));
    imap.connect();
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const imapHost  = body.host     ?? process.env.IMAP_HOST ?? "imap.gmail.com";
    const imapPort  = body.port     ?? parseInt(process.env.IMAP_PORT ?? "993");
    const imapUser  = body.user     ?? process.env.IMAP_USER ?? process.env.SMTP_USER ?? "";
    const imapPass  = body.password ?? process.env.IMAP_PASS ?? process.env.SMTP_PASS ?? "";
    const region    = body.region   ?? "france";

    if (!imapUser || !imapPass) {
      return NextResponse.json(
        { error: "Identifiants IMAP non configurés. Ajoutez IMAP_USER et IMAP_PASS dans les paramètres." },
        { status: 400 }
      );
    }

    const emails = await imapFetchEmails({
      user: imapUser,
      password: imapPass,
      host: imapHost,
      port: imapPort,
      tls: true,
    });

    let imported = 0;
    const errors: string[] = [];

    for (const email of emails) {
      for (const att of email.attachments) {
        try {
          const normalizedName = ensureFileNameWithExt(
            att.filename || "piece_jointe",
            att.contentType || "application/octet-stream"
          );
          const safeName = sanitizeFilename(normalizedName);
          const isPdf =
            /pdf/i.test(att.contentType || "") || /\.pdf$/i.test(normalizedName);
          const normalizedMime = isPdf
            ? "application/pdf"
            : att.contentType || "application/octet-stream";

          // Upload to Cloudinary
          const base64 = `data:${normalizedMime};base64,${att.content.toString("base64")}`;
          const uploaded = await cloudinary.uploader.upload(base64, {
            folder: "compta-ia/email-imports",
            // Keep same behavior as manual upload: image resource supports PDF pages and previews
            resource_type: "image",
            use_filename: true,
            unique_filename: true,
            filename_override: safeName,
            access_mode: "public",
          });

          // Save invoice to DB
          const inserted = await pool.query(
            `INSERT INTO invoices (id, filename, "originalName", size, "mimeType", "fileUrl", region, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
             RETURNING id`,
            [
              safeName,
              normalizedName,
              att.content.length,
              normalizedMime,
              uploaded.secure_url,
              region,
            ]
          );
          const invoiceId = inserted.rows?.[0]?.id as string | undefined;
          // Best effort: trigger extraction automatically (same behavior as manual upload)
          if (invoiceId) {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
            fetch(`${baseUrl}/api/invoices/${invoiceId}/extract`, { method: "POST" }).catch(() => {});
          }
          imported++;
        } catch (e) {
          errors.push(`${att.filename}: ${(e as Error).message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      emailsFound: emails.length,
      imported,
      errors,
    });
  } catch (error) {
    console.error("Erreur import email:", error);

    const raw = String((error as Error)?.message || error || "");
    const lower = raw.toLowerCase();
    const isAuthError =
      lower.includes("authenticationfailed") ||
      lower.includes("invalid credentials") ||
      lower.includes("auth");

    if (isAuthError) {
      return NextResponse.json(
        {
          error:
            "Échec authentification IMAP (identifiants invalides). Vérifiez email/mot de passe. Gmail : activez IMAP et utilisez un mot de passe d'application (pas le mot de passe normal).",
          code: "IMAP_AUTH_FAILED",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Erreur import IMAP : ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
