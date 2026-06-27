export interface DiagramDraftBlock {
  path: string;
  code: string;
}

const DIRECTIVE_RE = /^::diagram\[(.+?)\]\s*$/;

export function parseDiagramDirective(value: string): string | null {
  const match = value.trim().match(DIRECTIVE_RE);
  return match ? match[1].trim() : null;
}

export function buildInlineMermaidMarkdown(code: string): string {
  return `\`\`\`mermaid\n${code.trim()}\n\`\`\``;
}

export function buildExternalDiagramDraftMarkdown(path: string, code: string): string {
  return `::diagram[${path}]\n\n${buildInlineMermaidMarkdown(code)}`;
}

export function normalizeDiagramRepoPath(path: string, filePath: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/')) return trimmed.slice(1);
  if (!trimmed.startsWith('./') && !trimmed.startsWith('../')) return trimmed;
  const baseParts = filePath.split('/').slice(0, -1);
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

export function extractDiagramEmbedsForCommit(markdown: string): {
  content: string;
  files: DiagramDraftBlock[];
} {
  const lines = markdown.split('\n');
  const out: string[] = [];
  const files: DiagramDraftBlock[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const path = parseDiagramDirective(lines[i] || '');
    if (!path) {
      out.push(lines[i]);
      continue;
    }

    out.push(`::diagram[${path}]`);
    let cursor = i + 1;
    while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
    if ((lines[cursor] || '').trim() !== '```mermaid') {
      i = cursor - 1;
      continue;
    }

    cursor += 1;
    const codeLines: string[] = [];
    while (cursor < lines.length && (lines[cursor] || '').trim() !== '```') {
      codeLines.push(lines[cursor]);
      cursor += 1;
    }
    if (cursor < lines.length && (lines[cursor] || '').trim() === '```') {
      files.push({ path, code: codeLines.join('\n').trim() });
      i = cursor;
    } else {
      out.push('');
      out.push('```mermaid');
      out.push(...codeLines);
      i = cursor - 1;
    }
  }

  return {
    content: out.join('\n').replace(/\n{3,}/g, '\n\n'),
    files,
  };
}

function cloneNode<T extends Record<string, unknown>>(node: T, children: unknown[]) {
  return { ...node, children };
}

function transformChildren(parent: Record<string, unknown>) {
  const rawChildren = Array.isArray(parent.children) ? (parent.children as Record<string, unknown>[]) : null;
  if (!rawChildren) return parent;
  const nextChildren: Record<string, unknown>[] = [];

  for (let i = 0; i < rawChildren.length; i += 1) {
    const child = rawChildren[i];
    const firstText = child.type === 'paragraph'
      && Array.isArray(child.children)
      && child.children.length === 1
      && child.children[0]?.type === 'text'
      && typeof child.children[0]?.value === 'string'
      ? String(child.children[0].value)
      : null;
    const path = firstText ? parseDiagramDirective(firstText) : null;

    if (path) {
      const next = rawChildren[i + 1];
      const hasFallback = next?.type === 'code' && next.lang === 'mermaid' && typeof next.value === 'string';
      nextChildren.push({
        type: 'cotextDiagram',
        data: {
          hName: 'cotext-diagram',
          hProperties: {
            path,
            code: hasFallback ? String(next.value) : '',
          },
        },
        children: [],
      });
      if (hasFallback) i += 1;
      continue;
    }

    nextChildren.push(transformChildren(child));
  }

  return cloneNode(parent, nextChildren);
}

export function remarkCotextDiagrams() {
  return (tree: Record<string, unknown>) => transformChildren(tree);
}
