import type { PixelCrop } from 'react-image-crop';

/**
 * Rasterize a freeform pixel crop from an already-loaded image element to a PNG File.
 * PixelCrop is in displayed CSS pixels; we scale to natural image resolution.
 */
export async function getCroppedImageFile(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName = 'site-logo.png'
): Promise<File> {
  if (!pixelCrop.width || !pixelCrop.height) {
    throw new Error('Crop area is empty');
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixelCrop.width * scaleX));
  canvas.height = Math.max(1, Math.round(pixelCrop.height * scaleY));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }

  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error('Failed to export cropped image'));
          return;
        }
        resolve(result);
      },
      'image/png',
      0.95
    );
  });

  return new File([blob], fileName, { type: 'image/png' });
}
