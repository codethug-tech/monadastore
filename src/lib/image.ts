// Image intake for product photos.
//
// Everything here runs in the browser before anything is stored: the file is
// validated, decoded, downscaled and re-encoded. That keeps localStorage under
// its quota, keeps Supabase Storage cheap, and means the storefront never loads
// a 6 MB phone photo.

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15 MB before processing
export const MAX_EDGE = 1400; // longest side after resize
export const OUTPUT_QUALITY = 0.85;

export interface ProcessedImage {
  /** Compressed data URL, safe to preview and to fall back on offline. */
  dataUrl: string;
  /** Blob for uploading to Supabase Storage. */
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  fileName: string;
}

export class ImageError extends Error {}

const extFor = (type: string): string => {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/avif') return 'avif';
  return 'jpg';
};

export function validateImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ImageError(
      `"${file.name}" is not an image file. Use JPG, PNG, WebP or AVIF.`
    );
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new ImageError(
      `"${file.name}" is ${file.type}, which is not supported. Use JPG, PNG, WebP or AVIF.`
    );
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageError(
      `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 15 MB.`
    );
  }
  if (file.size === 0) {
    throw new ImageError(`"${file.name}" is empty.`);
  }
}

const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path below
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new ImageError('That image could not be decoded.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new ImageError('Image encoding failed.'))),
      type,
      quality
    );
  });

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError('Could not read the processed image.'));
    reader.readAsDataURL(blob);
  });

/**
 * Validates, downscales and re-encodes one file.
 * PNGs keep their transparency; everything else becomes JPEG.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  validateImageFile(file);

  const source = await loadBitmap(file);
  const srcW = 'width' in source ? source.width : 0;
  const srcH = 'height' in source ? source.height : 0;
  if (!srcW || !srcH) {
    throw new ImageError('That image has no dimensions.');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser blocked image processing.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);

  if ('close' in source && typeof source.close === 'function') {
    source.close();
  }

  const keepAlpha = file.type === 'image/png';
  const contentType = keepAlpha ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, contentType, OUTPUT_QUALITY);
  const dataUrl = await blobToDataUrl(blob);

  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'photo';

  return {
    dataUrl,
    blob,
    width,
    height,
    bytes: blob.size,
    contentType,
    fileName: `${baseName}.${extFor(contentType)}`,
  };
}

/** Rough localStorage budget check — browsers allow ~5 MB per origin. */
export const LOCAL_STORAGE_BUDGET = 4.5 * 1024 * 1024;

export function estimateLocalUsage(items: string[]): number {
  return items.reduce((total, value) => total + value.length * 2, 0);
}
