import { v2 as cloudinary } from "cloudinary";
import { signCloudinaryUrlIfApplicable } from "@/lib/cloudinary-delivery";

export type CloudinaryDeliveryType = "upload" | "authenticated" | "private";

export function setupCloudinaryFromEnv(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const sec = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !sec) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });
  return true;
}

export function buildPublicIdCandidates(publicId: string): string[] {
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

/** Parse une URL Cloudinary stockée en base (upload / authenticated / private). */
export function parseCloudinaryStoredUrl(fileUrl: string): {
  resourceType: "image" | "raw";
  publicId: string;
  deliveryType: CloudinaryDeliveryType;
} | null {
  const withType = fileUrl.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/(upload|authenticated|private)\/(?:v\d+\/)?(.+)$/i,
  );
  if (withType) {
    return {
      resourceType: withType[1]!.toLowerCase() as "image" | "raw",
      deliveryType: withType[2]!.toLowerCase() as CloudinaryDeliveryType,
      publicId: withType[3]!,
    };
  }

  const legacy = fileUrl.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/i,
  );
  if (legacy) {
    return {
      resourceType: legacy[1]!.toLowerCase() as "image" | "raw",
      deliveryType: "upload",
      publicId: legacy[2]!,
    };
  }

  return null;
}

function makePrivateDownloadUrls(
  publicId: string,
  resourceType: "image" | "raw",
  deliveryType: CloudinaryDeliveryType = "upload",
  asAttachment = true,
): string[] {
  if (!setupCloudinaryFromEnv()) return [];
  try {
    const formatMatch = publicId.match(/\.([a-z0-9]+)$/i);
    const formatExt = formatMatch?.[1]?.toLowerCase();
    const basePublicId = formatExt
      ? publicId.slice(0, -(formatExt.length + 1))
      : publicId;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const candidates: Array<{ pid: string; fmt: string | null }> = [
      { pid: basePublicId, fmt: formatExt ?? "pdf" },
      { pid: publicId, fmt: formatExt ?? "pdf" },
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
            attachment: asAttachment,
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

export async function resolveAssetFromAdminApi(
  publicId: string,
  hintType: "image" | "raw",
): Promise<{
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: CloudinaryDeliveryType;
} | null> {
  if (!setupCloudinaryFromEnv()) return null;
  const types: ("image" | "raw")[] = hintType === "image" ? ["image", "raw"] : ["raw", "image"];
  const ids = buildPublicIdCandidates(publicId);
  const deliveryTypes: CloudinaryDeliveryType[] = ["upload", "authenticated", "private"];

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
              deliveryType: (res.type as CloudinaryDeliveryType) || dt,
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

async function fetchBufferFromUrl(url: string): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 64) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/** Même logique que « Voir document » : URL privée Cloudinary validée. */
export async function resolveWorkingCloudinaryDownloadUrl(
  fileUrl: string,
  asAttachment = true,
): Promise<string | null> {
  const parsed = parseCloudinaryStoredUrl(fileUrl);
  if (!parsed) return null;

  const asset = await resolveAssetFromAdminApi(parsed.publicId, parsed.resourceType);
  const publicId = asset?.publicId ?? parsed.publicId;
  const resourceType = asset?.resourceType ?? parsed.resourceType;
  const deliveryType = asset?.deliveryType ?? parsed.deliveryType;

  const types: ("image" | "raw")[] = resourceType === "image" ? ["image", "raw"] : ["raw", "image"];
  const deliveryTypes: CloudinaryDeliveryType[] =
    deliveryType === "upload"
      ? ["upload", "authenticated", "private"]
      : [deliveryType, "upload", "authenticated", "private"];

  for (const rt of types) {
    for (const dt of deliveryTypes) {
      for (const pid of buildPublicIdCandidates(publicId)) {
        for (const url of makePrivateDownloadUrls(pid, rt, dt, asAttachment)) {
          try {
            const check = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (check.ok) return url;
          } catch {
            // try next
          }
        }
      }
    }
  }

  if (!setupCloudinaryFromEnv()) return null;
  for (const rt of types) {
    for (const pid of buildPublicIdCandidates(publicId)) {
      const signedUrl = cloudinary.url(pid, {
        resource_type: rt,
        type: deliveryType,
        sign_url: true,
        secure: true,
      });
      try {
        const check = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
        if (check.ok) return signedUrl;
      } catch {
        // try next
      }
    }
  }

  return null;
}

function guessContentType(originalName: string, header?: string | null, mimeType?: string | null): string {
  if (header?.trim()) return header;
  if (mimeType?.trim()) return mimeType.trim();
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/** Télécharge le buffer — même chemin que l’aperçu document, pour pièces jointes email. */
export async function fetchCloudinaryInvoiceBuffer(
  fileUrl: string,
  originalName: string,
  mimeType?: string | null,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const workingUrl = await resolveWorkingCloudinaryDownloadUrl(fileUrl, true);
  if (workingUrl) {
    const fetched = await fetchBufferFromUrl(workingUrl);
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: guessContentType(originalName, fetched.contentType, mimeType),
      };
    }
  }

  for (const url of [signCloudinaryUrlIfApplicable(fileUrl), fileUrl]) {
    const fetched = await fetchBufferFromUrl(url);
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: guessContentType(originalName, fetched.contentType, mimeType),
      };
    }
  }

  return null;
}
