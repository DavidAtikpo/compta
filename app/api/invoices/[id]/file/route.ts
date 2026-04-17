import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import { pool } from "../../../../../lib/postgres";

export const runtime = "nodejs";
export const maxDuration = 30;

const JWT_SECRET = process.env.JWT_SECRET as string | undefined;

function setupCloudinary(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key  = process.env.CLOUDINARY_API_KEY?.trim();
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !sec) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });
  return true;
}

/** Generate a private download URL using Cloudinary API credentials (bypasses delivery restrictions) */
type DeliveryType = "upload" | "authenticated" | "private";

function makePrivateDownloadUrls(
  publicId: string,
  resourceType: "image" | "raw",
  deliveryType: DeliveryType = "upload",
  asAttachment = true
): string[] {
  if (!setupCloudinary()) return [];
  try {
    const formatMatch = publicId.match(/\.([a-z0-9]+)$/i);
    const format = formatMatch ? formatMatch[1].toLowerCase() : undefined;
    const basePublicId = formatMatch ? publicId.slice(0, -(format!.length + 1)) : publicId;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const candidates: Array<{ pid: string; fmt: string | null }> = [];
    // Try both with and without extension; some Cloudinary endpoints expect one or the other.
    candidates.push({ pid: basePublicId, fmt: format ?? "pdf" });
    candidates.push({ pid: publicId, fmt: format ?? "pdf" });
    candidates.push({ pid: basePublicId, fmt: null });
    candidates.push({ pid: publicId, fmt: null });

    const urls: string[] = [];
    for (const c of candidates) {
      try {
        const u = cloudinary.utils.private_download_url(
          c.pid,
          (c.fmt as unknown as string) ?? (null as unknown as string),
          {
            resource_type: resourceType,
            type: deliveryType,
            attachment: asAttachment,
            expires_at: expiry,
          }
        );
        if (u) urls.push(u);
      } catch {
        // skip variant
      }
    }
    return Array.from(new Set(urls));
  } catch (e) {
    console.error("private_download_url variants:", e);
    return [];
  }
}

function buildPublicIdCandidates(publicId: string): string[] {
  const trimmed = publicId.trim();
  if (!trimmed) return [];
  const set = new Set<string>([trimmed]);
  if (trimmed.toLowerCase().endsWith(".pdf")) {
    set.add(trimmed.slice(0, -4));
  } else {
    set.add(`${trimmed}.pdf`);
  }
  return Array.from(set);
}

async function firstWorkingPrivateUrl(
  publicId: string,
  hintType: "image" | "raw",
  hintDeliveryType: DeliveryType = "upload",
  asAttachment = true
): Promise<{ url: string; resourceType: "image" | "raw"; publicId: string; deliveryType: DeliveryType } | null> {
  const types: ("image" | "raw")[] =
    hintType === "image" ? ["image", "raw"] : ["raw", "image"];
  const ids = buildPublicIdCandidates(publicId);
  const deliveryTypes: DeliveryType[] =
    hintDeliveryType === "upload"
      ? ["upload", "authenticated", "private"]
      : [hintDeliveryType, "upload", "authenticated", "private"];

  for (const resourceType of types) {
    for (const deliveryType of deliveryTypes) {
      for (const pid of ids) {
        const urls = makePrivateDownloadUrls(pid, resourceType, deliveryType, asAttachment);
        for (const url of urls) {
          try {
            const check = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (check.ok) {
              return { url, resourceType, publicId: pid, deliveryType };
            }
            console.log(
              "private url test failed",
              resourceType,
              deliveryType,
              pid.slice(-20),
              check.status
            );
          } catch {
            // try next candidate
          }
        }
      }
    }
  }
  return null;
}

async function resolveAssetFromAdminApi(
  publicId: string,
  hintType: "image" | "raw"
): Promise<{ publicId: string; resourceType: "image" | "raw"; deliveryType: DeliveryType } | null> {
  if (!setupCloudinary()) return null;
  const types: ("image" | "raw")[] =
    hintType === "image" ? ["image", "raw"] : ["raw", "image"];
  const ids = buildPublicIdCandidates(publicId);
  const deliveryTypes: DeliveryType[] = ["upload", "authenticated", "private"];

  for (const rt of types) {
    for (const dt of deliveryTypes) {
      for (const pid of ids) {
        try {
          const res = (await cloudinary.api.resource(pid, {
            resource_type: rt,
            type: dt,
          })) as {
            public_id: string;
            resource_type: "image" | "raw";
            type?: string;
          };
          if (res?.public_id) {
            return {
              publicId: res.public_id,
              resourceType: (res.resource_type as "image" | "raw") ?? rt,
              deliveryType: (res.type as DeliveryType) || dt,
            };
          }
        } catch {
          // continue trying variants
        }
      }
    }
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const inline = searchParams.get("disposition") === "inline";

  // JWT auth
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  if (!JWT_SECRET) {
    return NextResponse.json({ error: "Configuration serveur." }, { status: 500 });
  }
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  // Get fileUrl from DB
  try {
    const r = await pool.query(`SELECT "fileUrl", "originalName" FROM invoices WHERE id = $1`, [id]);
    const row = r.rows[0] as { fileUrl: string | null; originalName: string } | undefined;
    if (!row?.fileUrl) {
      return NextResponse.json({ error: "Aucun fichier pour cette facture." }, { status: 404 });
    }

    const { fileUrl, originalName } = row;

    // Parse public_id and resource type from the stored URL
    const m = fileUrl.match(
      /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/i
    );
    if (!m) {
      // Not a Cloudinary URL — return as-is
      return NextResponse.json({ url: fileUrl });
    }

    const resourceType = m[1].toLowerCase() as "image" | "raw";
    const publicId = m[2];

    // First, ask Cloudinary Admin API what the asset really is (resource_type + type).
    const asset = await resolveAssetFromAdminApi(publicId, resourceType);

    // Generate & validate a private download URL (tries image/raw + with/without .pdf)
    const resolved = await firstWorkingPrivateUrl(
      asset?.publicId ?? publicId,
      asset?.resourceType ?? resourceType,
      (asset?.deliveryType as DeliveryType) ?? "upload",
      !inline
    );
    if (resolved) {
      console.log(
        "Private URL OK:",
        resolved.resourceType,
        resolved.publicId.slice(0, 80)
      );
      return NextResponse.json({ url: resolved.url });
    }

    // Fallback: proxy the file through our API
    console.log("Falling back to proxy download for:", publicId.slice(0, 60));
    if (!setupCloudinary()) {
      return NextResponse.json({ error: "Cloudinary non configuré." }, { status: 500 });
    }

    let fileRes: Response | null = null;
    const types: ("image" | "raw")[] =
      (asset?.resourceType ?? resourceType) === "image" ? ["image", "raw"] : ["raw", "image"];
    const ids = buildPublicIdCandidates(asset?.publicId ?? publicId);
    const deliveryType = asset?.deliveryType || "upload";

    for (const rt of types) {
      for (const pid of ids) {
        const signedUrl = cloudinary.url(pid, {
          resource_type: rt,
          type: deliveryType,
          sign_url: true,
          secure: true,
        });
        const res = await fetch(signedUrl, { signal: AbortSignal.timeout(25000) });
        if (res.ok) {
          fileRes = res;
          break;
        }
      }
      if (fileRes) break;
    }

    if (!fileRes) {
      return NextResponse.json({ error: "Fichier inaccessible sur Cloudinary." }, { status: 502 });
    }

    const contentType =
      fileRes.headers.get("content-type") || "application/octet-stream";
    const filename = originalName || publicId.split("/").pop() || "document";

    return new Response(fileRes.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET invoice file:", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
