import { v2 as cloudinary } from "cloudinary";
import { signCloudinaryUrlIfApplicable } from "@/lib/cloudinary-delivery";

type DeliveryType = "upload" | "authenticated" | "private";

function setupCloudinary(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const sec = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !sec) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });
  return true;
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

function makePrivateDownloadUrls(
  publicId: string,
  resourceType: "image" | "raw",
  deliveryType: DeliveryType = "upload",
): string[] {
  if (!setupCloudinary()) return [];
  try {
    const formatMatch = publicId.match(/\.([a-z0-9]+)$/i);
    const format = formatMatch ? formatMatch[1].toLowerCase() : undefined;
    const basePublicId = formatMatch ? publicId.slice(0, -(format.length + 1)) : publicId;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const candidates: Array<{ pid: string; fmt: string | null }> = [
      { pid: basePublicId, fmt: format ?? "pdf" },
      { pid: publicId, fmt: format ?? "pdf" },
      { pid: basePublicId, fmt: null },
      { pid: publicId, fmt: null },
    ];

    const urls: string[] = [];
    for (const c of candidates) {
      try {
        const u = cloudinary.utils.private_download_url(
          c.pid,
          (c.fmt as unknown as string) ?? (null as unknown as string),
          {
            resource_type: resourceType,
            type: deliveryType,
            attachment: true,
            expires_at: expiry,
          },
        );
        if (u) urls.push(u);
      } catch {
        // skip variant
      }
    }
    return Array.from(new Set(urls));
  } catch (e) {
    console.error("makePrivateDownloadUrls:", e);
    return [];
  }
}

async function resolveAssetFromAdminApi(
  publicId: string,
  hintType: "image" | "raw",
): Promise<{ publicId: string; resourceType: "image" | "raw"; deliveryType: DeliveryType } | null> {
  if (!setupCloudinary()) return null;
  const types: ("image" | "raw")[] = hintType === "image" ? ["image", "raw"] : ["raw", "image"];
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
          // continue
        }
      }
    }
  }
  return null;
}

async function fetchBufferFromUrl(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length >= 64 ? buffer : null;
  } catch {
    return null;
  }
}

function guessContentType(originalName: string, header?: string | null, mimeType?: string | null): string {
  if (header?.trim()) return header.split(";")[0]!.trim();
  if (mimeType?.trim()) return mimeType.trim();
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/** Télécharge un fichier Cloudinary (API privée + signatures) pour pièces jointes email. */
export async function fetchCloudinaryInvoiceBuffer(
  fileUrl: string,
  originalName: string,
  mimeType?: string | null,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const m = fileUrl.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/i,
  );
  if (!m) return null;

  const hintType = m[1]!.toLowerCase() as "image" | "raw";
  const publicId = m[2]!;

  const asset = await resolveAssetFromAdminApi(publicId, hintType);
  const resolvedPublicId = asset?.publicId ?? publicId;
  const resourceType = asset?.resourceType ?? hintType;
  const deliveryType = asset?.deliveryType ?? "upload";

  const types: ("image" | "raw")[] = resourceType === "image" ? ["image", "raw"] : ["raw", "image"];
  const deliveryTypes: DeliveryType[] =
    deliveryType === "upload"
      ? ["upload", "authenticated", "private"]
      : [deliveryType, "upload", "authenticated", "private"];

  for (const rt of types) {
    for (const dt of deliveryTypes) {
      for (const pid of buildPublicIdCandidates(resolvedPublicId)) {
        for (const url of makePrivateDownloadUrls(pid, rt, dt)) {
          const buffer = await fetchBufferFromUrl(url);
          if (buffer) {
            return {
              buffer,
              contentType: guessContentType(originalName, null, mimeType),
            };
          }
        }
      }
    }
  }

  if (setupCloudinary()) {
    for (const rt of types) {
      for (const pid of buildPublicIdCandidates(resolvedPublicId)) {
        const signedUrl = cloudinary.url(pid, {
          resource_type: rt,
          type: deliveryType,
          sign_url: true,
          secure: true,
        });
        const buffer = await fetchBufferFromUrl(signedUrl);
        if (buffer) {
          return {
            buffer,
            contentType: guessContentType(originalName, null, mimeType),
          };
        }
      }
    }
  }

  for (const url of [signCloudinaryUrlIfApplicable(fileUrl), fileUrl]) {
    const buffer = await fetchBufferFromUrl(url);
    if (buffer) {
      return {
        buffer,
        contentType: guessContentType(originalName, null, mimeType),
      };
    }
  }

  return null;
}
