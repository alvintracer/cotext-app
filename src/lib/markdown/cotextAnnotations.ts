export type CotextAnnotationColor = 'amber' | 'mint' | 'sky' | 'rose';

export interface CotextAnnotationMeta {
  id: string;
  author: string;
  color: CotextAnnotationColor;
  note?: string;
  resolved?: boolean;
}

const START_RE = /^<!--\s*cotext:mark\b([\s\S]*?)-->$/i;
const END_RE = /^<!--\s*\/cotext:mark\s*-->$/i;
const ATTR_RE = /([a-zA-Z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeColor(value: string | undefined): CotextAnnotationColor {
  if (value === 'mint' || value === 'sky' || value === 'rose') return value;
  return 'amber';
}

export function createAnnotationId(): string {
  return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function buildCotextAnnotation(text: string, meta: CotextAnnotationMeta): string {
  const attrs = [
    `id="${escapeAttr(meta.id)}"`,
    `author="${escapeAttr(meta.author || 'teammate')}"`,
    `color="${escapeAttr(normalizeColor(meta.color))}"`,
  ];
  if (meta.note?.trim()) attrs.push(`note="${escapeAttr(meta.note.trim())}"`);
  if (meta.resolved) attrs.push('resolved="true"');
  return `<!-- cotext:mark ${attrs.join(' ')} -->${text}<!-- /cotext:mark -->`;
}

export function parseCotextAnnotationStart(value: string): CotextAnnotationMeta | null {
  const match = value.match(START_RE);
  if (!match) return null;
  const raw = match[1] || '';
  const attrs: Record<string, string> = {};
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = ATTR_RE.exec(raw)) !== null) {
    attrs[attrMatch[1]] = unescapeAttr(attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '');
  }
  return {
    id: attrs.id || createAnnotationId(),
    author: attrs.author || 'teammate',
    color: normalizeColor(attrs.color),
    note: attrs.note || '',
    resolved: attrs.resolved === 'true',
  };
}

export function isCotextAnnotationEnd(value: string): boolean {
  return END_RE.test(value.trim());
}

function isInlineContainer(type: string): boolean {
  return new Set([
    'paragraph',
    'heading',
    'emphasis',
    'strong',
    'delete',
    'link',
    'linkReference',
    'tableCell',
  ]).has(type);
}

function cloneNode<T extends Record<string, unknown>>(node: T, children: unknown[]) {
  return { ...node, children };
}

function transformChildren(parent: Record<string, unknown>) {
  const rawChildren = Array.isArray(parent.children) ? (parent.children as Record<string, unknown>[]) : null;
  if (!rawChildren) return parent;
  const inline = isInlineContainer(String(parent.type || ''));
  const nextChildren: Record<string, unknown>[] = [];

  for (let i = 0; i < rawChildren.length; i += 1) {
    const child = rawChildren[i];
    const htmlValue = child.type === 'html' && typeof child.value === 'string' ? child.value : null;
    const startMeta = htmlValue ? parseCotextAnnotationStart(htmlValue) : null;
    if (startMeta) {
      let depth = 1;
      let endIndex = -1;
      for (let j = i + 1; j < rawChildren.length; j += 1) {
        const candidate = rawChildren[j];
        const candidateHtml = candidate.type === 'html' && typeof candidate.value === 'string' ? candidate.value : null;
        if (!candidateHtml) continue;
        if (parseCotextAnnotationStart(candidateHtml)) depth += 1;
        else if (isCotextAnnotationEnd(candidateHtml)) {
          depth -= 1;
          if (depth === 0) {
            endIndex = j;
            break;
          }
        }
      }
      if (endIndex > i) {
        const inner = rawChildren.slice(i + 1, endIndex).map((node) => transformChildren(node));
        nextChildren.push({
          type: 'cotextAnnotation',
          data: {
            hName: 'cotext-mark',
            hProperties: {
              annotationId: startMeta.id,
              author: startMeta.author,
              color: startMeta.color,
              note: startMeta.note || '',
              resolved: startMeta.resolved ? 'true' : 'false',
              display: inline ? 'inline' : 'block',
            },
          },
          children: inner,
        });
        i = endIndex;
        continue;
      }
    }

    nextChildren.push(transformChildren(child));
  }

  return cloneNode(parent, nextChildren);
}

export function remarkCotextAnnotations() {
  return (tree: Record<string, unknown>) => transformChildren(tree);
}
