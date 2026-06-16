// Cotext — client-side file → text extraction (structure preserved where possible).
// Lets users attach a file's TEXT to a memo without uploading the binary.
// Images go through the existing OCR path (lib/ocr); this handles document formats.

import TurndownService from 'turndown';

const EXTRACTABLE_EXT = ['pdf', 'docx', 'hwpx', 'pptx', 'txt', 'md', 'markdown', 'csv', 'json', 'log'];

export function extractKind(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

export function isExtractable(file: File): boolean {
  return EXTRACTABLE_EXT.includes(extractKind(file));
}

export async function extractText(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const ext = extractKind(file);
  if (ext === 'pdf') return extractPdf(file, onProgress);
  if (ext === 'docx') return extractDocx(file);
  if (ext === 'hwpx') return extractHwpx(file);
  if (ext === 'pptx') return extractPptx(file);
  if (['txt', 'md', 'markdown', 'csv', 'json', 'log'].includes(ext)) return (await file.text()).trim();
  throw new Error(`Unsupported file type: .${ext}`);
}

// ── PDF (pdf.js) — text per page, structure limited (tables lost) ──
async function extractPdf(file: File, onProgress?: (p: number) => void): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const maxPages = Math.min(pdf.numPages, 100);
  const pages: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (it as { str?: string }).str ?? '')
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .trim();
    if (line) pages.push(line);
    onProgress?.(Math.round((i / maxPages) * 100));
  }
  return pages.join('\n\n');
}

// ── DOCX (mammoth → HTML → Turndown) — preserves headings/lists/bold/tables ──
type MammothModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};
async function extractDocx(file: File): Promise<string> {
  const mod = (await import('mammoth')) as unknown as { default?: MammothModule } & Partial<MammothModule>;
  const mammoth: MammothModule = (mod.default ?? (mod as MammothModule));
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  return td.turndown(html || '').trim();
}

// ── HWPX (zip of OWPML XML) — extract paragraph text. Full fidelity needs server conversion. ──
async function extractHwpx(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sectionPaths = Object.keys(zip.files)
    .filter((p) => /Contents\/section\d*\.xml$/i.test(p))
    .sort();
  if (sectionPaths.length === 0) throw new Error('Not a valid hwpx (no section XML found)');

  const lines: string[] = [];
  for (const path of sectionPaths) {
    const xml = await zip.files[path].async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const els = Array.from(doc.getElementsByTagName('*'));
    const paragraphs = els.filter((el) => el.localName === 'p');
    if (paragraphs.length) {
      for (const para of paragraphs) {
        const runs = Array.from(para.getElementsByTagName('*')).filter((el) => el.localName === 't');
        lines.push(runs.map((r) => r.textContent || '').join(''));
      }
    } else {
      const runs = els.filter((el) => el.localName === 't');
      lines.push(runs.map((r) => r.textContent || '').join(''));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Basic PPTX extractor: reads slide XML text runs in order. Layout fidelity is low,
// but this is enough for "text only" knowledge ingestion without shipping binaries.
async function extractPptx(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] || '0');
      const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] || '0');
      return ai - bi;
    });
  if (slidePaths.length === 0) throw new Error('Not a valid pptx (no slide XML found)');

  const slides: string[] = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const texts = Array.from(doc.getElementsByTagName('*'))
      .filter((el) => el.localName === 't')
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    if (!texts.length) continue;
    const slideNo = Number(path.match(/slide(\d+)\.xml/i)?.[1] || '0');
    slides.push(`## Slide ${slideNo}\n\n${texts.join('\n')}`);
  }
  return slides.join('\n\n').trim();
}
