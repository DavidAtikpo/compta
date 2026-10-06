import { v2 as cloudinary } from "cloudinary";
import { configureCloudinaryFromEnv } from "@/lib/cloudinary-delivery";
import {
  fetchCloudinaryInvoiceBuffer,
  parseCloudinaryStoredUrl,
  setupCloudinaryFromEnv,
} from "@/lib/cloudinary-invoice-asset";

/** Extract public_id from a Cloudinary URL (strips version prefix, keeps folder/name.ext) */
function extractPublicId(url: string): { publicId: string; resourceType: "image" | "raw" } | null {
  const clean = String(url || "").split("?")[0] ?? "";
  const m = clean.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/i,
  );
  if (!m) return null;
  return { publicId: m[2], resourceType: m[1].toLowerCase() as "image" | "raw" };
}

function cloudinaryFetchCandidates(storedUrl: string): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };

  if (!storedUrl.includes("res.cloudinary.com")) {
    add(storedUrl);
    return out;
  }

  if (configureCloudinaryFromEnv()) {
    const parsed = extractPublicId(storedUrl);
    if (parsed) {
      const rt = parsed.resourceType === "raw" ? "image" : parsed.resourceType;
      add(
        cloudinary.url(parsed.publicId, {
          resource_type: rt,
          sign_url: true,
          secure: true,
          type: "upload",
          transformation: [
            { width: 2400, crop: "limit", fetch_format: "jpg", quality: "auto:good" },
          ],
        }),
      );
      add(
        cloudinary.url(parsed.publicId, {
          resource_type: rt,
          sign_url: true,
          secure: true,
          type: "upload",
        }),
      );
    }
  }

  add(storedUrl);
  return out;
}

/** For regular image URLs: fetch and return as base64 data URL (public or signed Cloudinary). */
async function imageUrlToDataUrl(url: string): Promise<string | null> {
  const tryFetch = async (fetchUrl: string): Promise<string | null> => {
    try {
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) {
        console.warn("imageUrlToDataUrl HTTP", res.status, fetchUrl.slice(0, 120));
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) return null;
      let ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      if (!ct.startsWith("image/")) {
        if (/f_jpg|format_jpg|\.jpe?g/i.test(fetchUrl)) ct = "image/jpeg";
        else if (/\.png/i.test(fetchUrl)) ct = "image/png";
        else return null;
      }
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (e) {
      console.warn("imageUrlToDataUrl fetch failed:", (e as Error).message);
      return null;
    }
  };

  for (const candidate of cloudinaryFetchCandidates(url)) {
    const data = await tryFetch(candidate);
    if (data) return data;
  }
  return null;
}

async function pdfCloudinaryToJpegDataUrl(fileUrl: string): Promise<string | null> {
  if (configureCloudinaryFromEnv()) {
    const parsed = extractPublicId(fileUrl);
    if (parsed) {
      const jpgUrl = cloudinary.url(parsed.publicId, {
        resource_type: parsed.resourceType === "raw" ? "image" : parsed.resourceType,
        sign_url: true,
        secure: true,
        type: "upload",
        transformation: [{ page: 1, format: "jpg", width: 1600, crop: "limit", quality: "auto" }],
      });
      const sdkResult = await imageUrlToDataUrl(jpgUrl);
      if (sdkResult) return sdkResult;
    }
  }

  const imgUploadMatch = fileUrl.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:(v\d+\/))?(.+\.pdf)$/i,
  );
  if (imgUploadMatch) {
    const base = imgUploadMatch[1];
    const version = imgUploadMatch[2] || "";
    const rest = imgUploadMatch[3];
    const transformedUrl = `${base}pg_1,f_jpg,q_auto,w_1600,c_limit/${version}${rest}`;
    const result = await imageUrlToDataUrl(transformedUrl);
    if (result) return result;
    if (version) {
      const noVersionUrl = `${base}pg_1,f_jpg,q_auto,w_1600,c_limit/${rest}`;
      const result2 = await imageUrlToDataUrl(noVersionUrl);
      if (result2) return result2;
    }
  }

  if (!configureCloudinaryFromEnv()) return null;

  const parsed = extractPublicId(fileUrl);
  if (!parsed) return null;

  const signedUrl = cloudinary.url(parsed.publicId, {
    resource_type: parsed.resourceType,
    sign_url: true,
    secure: true,
    type: "upload",
  });

  const pdfRes = await fetch(signedUrl, { signal: AbortSignal.timeout(30000) });
  if (!pdfRes.ok) return null;

  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  if (pdfBuf.length < 100) return null;

  const tempPublicId = `compta-ia/extract-tmp-${Date.now()}`;
  let uploadedPublicId: string | null = null;

  try {
    const up = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${pdfBuf.toString("base64")}`,
      {
        public_id: tempPublicId,
        resource_type: "image",
        overwrite: true,
        eager: [{ width: 1600, crop: "limit", format: "jpg", page: 1 }],
        eager_async: false,
      },
    );
    uploadedPublicId = up.public_id;
    const jpgUrl = up?.eager?.[0]?.secure_url as string | undefined;
    if (jpgUrl) {
      const data = await imageUrlToDataUrl(jpgUrl);
      if (data) return data;
    }
  } catch (e) {
    console.error("pdfCloudinaryToJpegDataUrl re-upload:", e);
  } finally {
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, { resource_type: "image", invalidate: true });
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function bufferToImageDataUrl(buffer: Buffer, contentType: string): string | null {
  const ct = contentType.startsWith("image/") ? contentType.split(";")[0]!.trim() : "image/jpeg";
  if (!ct.startsWith("image/")) return null;
  if (buffer.length < 64) return null;
  return `data:${ct};base64,${buffer.toString("base64")}`;
}

/** JPG page 1 pour OCR (même compte Cloudinary que l’upload). */
async function cloudinaryStoredUrlToJpegDataUrl(fileUrl: string): Promise<string | null> {
  if (!setupCloudinaryFromEnv()) return null;
  const parsed = parseCloudinaryStoredUrl(fileUrl.split("?")[0] ?? fileUrl);
  if (!parsed) return null;
  const rt = parsed.resourceType === "raw" ? "image" : parsed.resourceType;
  const jpgUrl = cloudinary.url(parsed.publicId, {
    resource_type: rt,
    type: parsed.deliveryType,
    sign_url: true,
    secure: true,
    transformation: [{ page: 1, format: "jpg", width: 2400, crop: "limit", quality: "auto:good" }],
  });
  return imageUrlToDataUrl(jpgUrl);
}

/**
 * Build a base64 image data URL from a stored invoice file URL.
 * Utilise le même téléchargement Cloudinary que « Voir le fichier ».
 */
export async function resolveDocumentImageDataUrl(
  fileUrl: string,
  originalName: string,
  mimeType: string | null,
): Promise<string | null> {
  const url = String(fileUrl || "").trim();
  if (!url) return null;

  const lowerName = String(originalName || "").toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  const isPdf =
    lowerMime.includes("pdf") || lowerName.endsWith(".pdf") || /\.pdf(\?|$)/i.test(url);

  if (url.includes("res.cloudinary.com")) {
    const downloaded = await fetchCloudinaryInvoiceBuffer(url, originalName, mimeType);
    if (downloaded) {
      const ct = downloaded.contentType.toLowerCase();
      if (ct.includes("pdf") || isPdf) {
        const fromTransform = await cloudinaryStoredUrlToJpegDataUrl(url);
        if (fromTransform) return fromTransform;
        return pdfCloudinaryToJpegDataUrl(url);
      }
      const dataUrl = bufferToImageDataUrl(downloaded.buffer, downloaded.contentType);
      if (dataUrl) return dataUrl;
    }

    if (isPdf) {
      const fromTransform = await cloudinaryStoredUrlToJpegDataUrl(url);
      if (fromTransform) return fromTransform;
      return pdfCloudinaryToJpegDataUrl(url);
    }

    const fromTransform = await cloudinaryStoredUrlToJpegDataUrl(url);
    if (fromTransform) return fromTransform;

    const legacy = await imageUrlToDataUrl(url);
    if (legacy) return legacy;
  }

  const isCloudinaryDelivery = /\/image\/upload\//i.test(url);
  const isImage =
    !isPdf &&
    (lowerMime.startsWith("image/") ||
      lowerMime === "" ||
      /\.(jpg|jpeg|png|webp|gif|heic|heif)(\?|$)/i.test(lowerName) ||
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) ||
      isCloudinaryDelivery);

  if (isPdf) return pdfCloudinaryToJpegDataUrl(url);
  if (isImage) return imageUrlToDataUrl(url);
  return null;
}

export type ResolveDocumentImageFailure =
  | "empty_url"
  | "not_cloudinary"
  | "cloudinary_download_failed"
  | "unsupported_type";

export function diagnoseResolveDocumentImageUrl(fileUrl: string): ResolveDocumentImageFailure | null {
  const url = String(fileUrl || "").trim();
  if (!url) return "empty_url";
  if (!url.includes("res.cloudinary.com")) return "not_cloudinary";
  if (!parseCloudinaryStoredUrl(url.split("?")[0] ?? url)) return "not_cloudinary";
  return "cloudinary_download_failed";
}
