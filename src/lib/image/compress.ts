import imageCompression from 'browser-image-compression';

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  wasCompressed: boolean;
}

const MAX_SIZE_MB = 0.5;
const MAX_EDGE_PX = 2048;
const TARGET_FORMAT = 'image/webp';

export async function compressImage(file: File): Promise<CompressionResult> {
  const originalSize = file.size;
  
  // Skip compression for GIFs (animation preservation)
  if (file.type === 'image/gif') {
    if (originalSize > 500 * 1024) {
      throw new Error('Animated GIFs larger than 500KB are not supported. Please use a smaller GIF or convert to WebP.');
    }
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      wasCompressed: false,
    };
  }

  // Already under limit
  if (originalSize <= MAX_SIZE_MB * 1024 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      wasCompressed: false,
    };
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_EDGE_PX,
      useWebWorker: true,
      fileType: TARGET_FORMAT,
    });

    const compressedFile = new File(
      [compressed],
      file.name.replace(/\.[^.]+$/, '.webp'),
      { type: TARGET_FORMAT }
    );

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      compressionRatio: originalSize / compressedFile.size,
      wasCompressed: true,
    };
  } catch (error) {
    throw new Error(`Failed to compress image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for non-image files
