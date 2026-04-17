import type { Area } from "react-easy-crop";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.src = src;
  });
}

/**
 * Découpe la zone `pixelCrop` dans l’image et renvoie un fichier (JPEG ou PNG).
 */
export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  originalName: string,
  mimeType: string,
  quality = 0.9,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const outMime = mimeType.includes("png") ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), outMime, outMime === "image/jpeg" ? quality : undefined),
  );
  if (!blob) throw new Error("Export image vide");

  const base = originalName.replace(/\.[^./\\]+$/, "").replace(/[^\w.-]+/g, "_") || "photo";
  const ext = outMime === "image/png" ? "png" : "jpg";
  return new File([blob], `${base}.${ext}`, { type: outMime });
}
