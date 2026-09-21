import { signCloudinaryUrlIfApplicable } from "@/lib/cloudinary-delivery";
import { fetchCloudinaryInvoiceBuffer } from "@/lib/cloudinary-invoice-asset";

function guessContentType(originalName: string): string {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/** Télécharge le fichier d'une facture depuis Cloudinary (serveur). */
export async function downloadInvoiceFileBuffer(params: {
  fileUrl: string;
  originalName: string;
  mimeType?: string | null;
}): Promise<{ buffer: Buffer; filename: string; contentType: string } | null> {
  const { fileUrl, originalName, mimeType } = params;
  if (!fileUrl?.trim()) return null;

  if (fileUrl.includes("res.cloudinary.com")) {
    const fromCloudinary = await fetchCloudinaryInvoiceBuffer(fileUrl, originalName, mimeType);
    if (fromCloudinary) {
      return {
        buffer: fromCloudinary.buffer,
        filename: originalName?.trim() || "facture.pdf",
        contentType: fromCloudinary.contentType,
      };
    }
  }

  const candidates = [signCloudinaryUrlIfApplicable(fileUrl), fileUrl].filter(
    (u, i, arr) => u && arr.indexOf(u) === i,
  ) as string[];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 64) continue;
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ||
        mimeType?.trim() ||
        guessContentType(originalName);
      return {
        buffer,
        filename: originalName?.trim() || "facture.pdf",
        contentType,
      };
    } catch (e) {
      console.warn("downloadInvoiceFileBuffer:", (e as Error).message);
    }
  }
  return null;
}
