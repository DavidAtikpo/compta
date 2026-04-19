import { NextResponse } from "next/server";
import { pool } from "../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../lib/auth-request";
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

function isLikelyInvoiceAttachment(
  a: {
  filename: string;
  content: Buffer;
  contentType: string;
  },
  emailContext = ""
): boolean {
  const filename = (a.filename || "").toLowerCase();
  const ct = (a.contentType || "").toLowerCase();
  const size = a.content?.length || 0;

  const isPdf = ct.includes("pdf") || filename.endsWith(".pdf");
  const isImage =
    ct.includes("image") || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(filename);

  if (!isPdf && !isImage) return false;

  // Block common email decoration assets
  const blockedNamePatterns = [
    /logo/i,
    /icon/i,
    /signature/i,
    /warning_triangle/i,
    /spacer/i,
    /facebook|instagram|linkedin|twitter/i,
    /banner/i,
  ];
  if (blockedNamePatterns.some((p) => p.test(filename))) return false;

  // PDFs are usually relevant unless extremely tiny
  if (isPdf) return size >= 2_000;

  // Images: require larger files OR invoice-like filename
  const invoiceLikeName =
    /facture|invoice|receipt|recu|ticket|achat|purchase|bill|quittance/i.test(filename);
  const invoiceLikeContext =
    /facture|invoice|receipt|recu|ticket|achat|purchase|bill|quittance|payment/i.test(
      emailContext
    );
  if (invoiceLikeName) return size >= 3_000;
  if (invoiceLikeContext) return size >= 8_000;

  // Generic images from emails are often tiny icons/signatures
  return size >= 25_000;
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

        // Search all emails from the last 90 days
        const since = new Date();
        since.setDate(since.getDate() - 90);

        console.log(`IMAP: searching emails since ${since.toDateString()}`);

        imap.search([["SINCE", since]], (searchErr, uids) => {
          if (searchErr) {
            console.error("IMAP search error:", searchErr);
            imap.end();
            resolve([]);
            return;
          }
          console.log(`IMAP: found ${uids?.length ?? 0} emails total`);
          if (!uids || uids.length === 0) {
            imap.end();
            resolve([]);
            return;
          }

          // Limit to 200 most recent to avoid memory issues
          const toFetch = uids.slice(-200);
          console.log(`IMAP: fetching ${toFetch.length} most recent emails`);
          const fetchHandle = imap.fetch(toFetch, { bodies: "", struct: true });

          // Collect all parse promises so we can await them before resolving
          const parsePromises: Promise<void>[] = [];

          fetchHandle.on("message", (msg) => {
            const buffers: Buffer[] = [];
            const p = new Promise<void>((resMsg) => {
              msg.on("body", (stream) => {
                stream.on("data", (chunk: Buffer) => buffers.push(chunk));
                stream.once("end", () => resMsg());
              });
              // Some messages may have no body events
              msg.once("end", () => resMsg());
            }).then(async () => {
              if (!buffers.length) return;
              try {
                const parsed = await simpleParser(Buffer.concat(buffers));
                const allAtts = (parsed.attachments ?? []).map((a) => ({
                  filename: a.filename ?? "pièce_jointe",
                  content: a.content as Buffer,
                  contentType: a.contentType ?? "application/octet-stream",
                }));

                const candidateAtts = allAtts.filter((a) => {
                  const ct = a.contentType ?? "";
                  return (
                    ct.includes("pdf") ||
                    ct.includes("image") ||
                    (a.filename ?? "").match(/\.(pdf|jpg|jpeg|png|webp)$/i)
                  );
                });

                console.log(
                  `IMAP msg: subject="${parsed.subject}" from="${parsed.from?.text}" ` +
                  `allAtts=${allAtts.length} candidateAtts=${candidateAtts.length} ` +
                  `names=[${candidateAtts.map(a => `${a.filename}(${a.content?.length}B)`).join(", ")}]`
                );

                const context = `${parsed.subject ?? ""} ${parsed.from?.text ?? ""}`.toLowerCase();
                const relevantAttachments = candidateAtts.filter((att) =>
                  isLikelyInvoiceAttachment(att, context)
                );

                console.log(`IMAP msg: relevantAtts=${relevantAttachments.length}`);

                if (relevantAttachments.length > 0) {
                  emails.push({
                    subject: parsed.subject ?? "(sans objet)",
                    from: parsed.from?.text ?? "",
                    attachments: relevantAttachments,
                  });
                }
              } catch (parseErr) {
                console.error("IMAP parse error:", parseErr);
              }
            });

            parsePromises.push(p);
          });

          fetchHandle.once("end", async () => {
            // Wait for ALL async parsing to complete before resolving
            await Promise.allSettled(parsePromises);
            console.log(`IMAP: done — ${emails.length} emails with relevant attachments`);
            imap.end();
          });

          fetchHandle.once("error", async (fetchErr: Error) => {
            console.error("IMAP fetch error:", fetchErr);
            await Promise.allSettled(parsePromises);
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
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise pour importer des emails." }, { status: 401 });
  }

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
            `INSERT INTO invoices (id, "userId", filename, "originalName", size, "mimeType", "fileUrl", region, status, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
             RETURNING id`,
            [
              userId,
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
            const authHeader = request.headers.get("authorization");
            fetch(`${baseUrl}/api/invoices/${invoiceId}/extract`, {
              method: "POST",
              ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
            }).catch(() => {});
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
