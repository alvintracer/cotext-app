export function createTimestampHeader(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `## ${year}-${month}-${day} ${hours}:${minutes}`;
}

export interface BlockMeta {
  source?: string;
  author?: string;
}

function normalizeMetaValue(value: string | undefined, fallback: string): string {
  const cleaned = (value || '').trim().replace(/[;\r\n-]+/g, '');
  return cleaned || fallback;
}

export function formatBlockMeta(meta: BlockMeta = {}): string {
  const source = normalizeMetaValue(meta.source, 'me');
  const author = normalizeMetaValue(meta.author, '');
  return author
    ? `<!-- source: ${source}; author: ${author} -->`
    : `<!-- source: ${source} -->`;
}

export function parseBlockMeta(line: string): BlockMeta | null {
  const match = line.match(/^<!--\s*source:\s*([^;>]+?)(?:\s*;\s*author:\s*([^>]+?))?\s*-->$/);
  if (!match) return null;
  return {
    source: match[1].trim() || undefined,
    author: match[2]?.trim() || undefined,
  };
}

export function appendMessage(existingContent: string, message: string, attachments?: string[], meta: string | BlockMeta = 'me'): string {
  const header = createTimestampHeader();
  const blockMeta = typeof meta === 'string' ? { source: meta } : meta;
  let block = `\n${header}\n${formatBlockMeta(blockMeta)}\n\n${message}`;
  
  if (attachments && attachments.length > 0) {
    block += '\n\nAttachments:\n';
    for (const attachment of attachments) {
      block += `\n- ${attachment}`;
    }
  }
  
  block += '\n';
  return existingContent.trimEnd() + '\n' + block;
}

export function createInitialContent(roomPath: string): string {
  return `# Cotext: ${roomPath}\n`;
}

export function createImageLink(fileName: string): string {
  return `![image](./assets/${fileName})`;
}

export function createFileLink(fileName: string, displayName?: string): string {
  return `[${displayName || fileName}](./assets/${fileName})`;
}

export function generateAssetFileName(originalName: string, type: 'image' | 'file'): string {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const ext = originalName.split('.').pop() || 'bin';
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${datePart}-${timePart}-${type}-${seq}.${ext}`;
}

export function parseBlocks(content: string): Array<{ timestamp: string; content: string; isPushed: boolean; source?: string; author?: string }> {
  const blocks: Array<{ timestamp: string; content: string; isPushed: boolean; source?: string; author?: string }> = [];
  const lines = content.split('\n');
  let currentBlock: { timestamp: string; content: string; isPushed: boolean; source?: string; author?: string } | null = null;
  
  for (const line of lines) {
    const timestampMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    const blockMeta = parseBlockMeta(line);
    if (timestampMatch) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { timestamp: timestampMatch[1], content: '', isPushed: false };
    } else if (blockMeta && currentBlock && !currentBlock.source) {
      currentBlock.source = blockMeta.source;
      currentBlock.author = blockMeta.author;
    } else if (currentBlock) {
      currentBlock.content += line + '\n';
    }
  }
  if (currentBlock) blocks.push(currentBlock);
  
  return blocks;
}
