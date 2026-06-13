import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

let workerInstance: Worker | null = null;
let workerReady = false;

async function getWorker(): Promise<Worker> {
  if (workerInstance && workerReady) return workerInstance;

  workerInstance = await createWorker('kor+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        ocrProgressCallback?.(Math.round(m.progress * 100));
      }
    },
  });

  workerReady = true;
  return workerInstance;
}

let ocrProgressCallback: ((progress: number) => void) | null = null;

export async function recognizeText(
  image: File | Blob | string,
  onProgress?: (progress: number) => void
): Promise<string> {
  ocrProgressCallback = onProgress ?? null;

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);

    // Build text preserving paragraph structure
    const blocks = data.blocks ?? [];
    if (blocks.length === 0) return data.text.trim();

    const lines: string[] = [];
    for (const block of blocks) {
      const blockLines = block.paragraphs?.flatMap(
        (p) => p.lines?.map((l) => l.text.trim()).filter(Boolean) ?? []
      ) ?? [];
      lines.push(...blockLines, '');
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines.join('\n');
  } finally {
    ocrProgressCallback = null;
  }
}
