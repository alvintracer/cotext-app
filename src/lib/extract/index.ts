// Cotext — client-side file → text extraction (structure preserved where possible).
// Lets users attach a file's TEXT to a memo without uploading the binary.
// Images go through the existing OCR path (lib/ocr); this handles document formats.

import TurndownService from 'turndown';

const EXTRACTABLE_EXT = ['pdf', 'docx', 'hwpx', 'txt', 'md', 'markdown', 'csv', 'json', 'log'];

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
