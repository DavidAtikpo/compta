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
          // Upload to Cloudinary
          const base64 = `data:${att.contentType};base64,${att.content.toString("base64")}`;
          const uploaded = await cloudinary.uploader.upload(base64, {
            folder: "compta-ia/email-imports",
            resource_type: "auto",
            use_filename: true,
          });

          // Save invoice to DB
          await pool.query(
            `INSERT INTO invoices (id, filename, "originalName", size, "mimeType", "fileUrl", region, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
            [att.filename, att.filename, att.content.length, att.contentType, uploaded.secure_url, region]
          );
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
    return NextResponse.json(
      { error: `Erreur import IMAP : ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
