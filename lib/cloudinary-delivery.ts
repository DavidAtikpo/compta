import { v2 as cloudinary } from "cloudinary";

/** Configure SDK from env (cloud name lowercased). */
export function configureCloudinaryFromEnv(): boolean {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.toLowerCase().trim();
  const key = process.env.CLOUDINARY_API_KEY?.trim();
  const secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!name || !key || !secret) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret, secure: true });
  return true;
}

/**
 * Build a time-limited signed delivery URL from a stored Cloudinary https URL.
 * Fixes HTTP 401 when assets are not publicly readable without signature.
 */
export function signedUrlFromStoredCloudinaryUrl(storedUrl: string): string | null {
  if (!storedUrl?.startsWith("https://res.cloudinary.com/")) return null;
  if (!configureCloudinaryFromEnv()) return null;

  const m = storedUrl.match(
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(v(\d+)\/)?(.+)$/i
  );
  if (!m) return null;

  const resourceType = m[1].toLowerCase() as "image" | "raw";
  const version = m[3];
  const publicIdWithExt = m[4];

  const opts: Record<string, string | boolean | number> = {
    resource_type: resourceType,
    sign_url: true,
    secure: true,
    type: "upload",
  };
  if (version) opts.version = version;

  try {
    return cloudinary.url(publicIdWithExt, opts);
  } catch (e) {
    console.error("signedUrlFromStoredCloudinaryUrl:", e);
    return null;
  }
}

/** Sign any Cloudinary URL we use (upload/* ou image/fetch/*). */
export function signCloudinaryUrlIfApplicable(u: string): string {
  if (!u.includes("res.cloudinary.com")) return u;
  if (!configureCloudinaryFromEnv()) return u;

  const fetchM = u.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/fetch\/(.+)$/i);
  if (fetchM) {
    try {
      return cloudinary.url(fetchM[1], { type: "fetch", sign_url: true, secure: true });
    } catch (e) {
      console.error("signCloudinary fetch:", e);
    }
  }

  const signed = signedUrlFromStoredCloudinaryUrl(u);
  return signed || u;
}
