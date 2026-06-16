import { slugifyClusterId } from '../neural/id';
import type { Cluster, Edge, NeuralGraph, NeuralNode } from '../neural/types';

export interface KnowledgeSourceInput {
  name: string;
  text: string;
}

export interface KnowledgeGraphResult {
  graph: NeuralGraph;
  nodeTextById: Record<string, string>;
  blockTextByKey: Record<string, string>;
  sourceCount: number;
  sectionCount: number;
}

interface SectionDraft {
  id: string;
  room: string;
  blockTs: string;
  label: string;
  text: string;
  docIndex: number;
  docClusterId: string;
  keywords: string[];
}

const PALETTE = ['#2563eb', '#d97706', '#0891b2', '#16a34a', '#dc2626', '#7c3aed', '#db2777', '#4f46e5'];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'have', 'will', 'would', 'there',
  'their', 'them', 'they', 'were', 'been', 'being', 'your', 'ours', 'ourselves', 'also', 'than', 'then',
  'when', 'where', 'what', 'which', 'while', 'whose', 'into', 'onto', 'over', 'under', 'after', 'before',
  'through', 'using', 'used', 'user', 'users', 'more', 'most', 'some', 'such', 'only', 'very', 'much',
  'each', 'other', 'same', 'many', 'make', 'made', 'like', 'just', 'does', 'did', 'done', 'because',
  '대한', '관련', '내용', '정리', '문서', '기반', '위한', '통해', '사용', '한다', '있다', '없다', '에서', '으로',
  '하고', '하는', '하면', '그리고', '또한', '대한민국', '가장', '위해', '대한한', '수행', '검토', '작성', '추가',
  '삭제', '수정', '진행', '현재', '이후', '이전', '부분', '전체', '기능', '구조', '설계', '정책', '업무', '프로젝트',
]);

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replaceAll('\0', '').trim();
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) || [];
  return matches.filter((token) => {
    if (STOPWORDS.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
    return token.length >= 2;
  });
}

function keywordRanks(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([token]) => token);
}

function cleanDocName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || name;
}

function sentenceLabel(text: string, fallback: string): string {
  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('![') && !entry.startsWith('|'));
  if (!line) return fallback;
  const trimmed = line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim();
  const sentence = trimmed.split(/(?<=[.!?。！？])\s+/)[0]?.trim() || trimmed;
  return sentence.length > 72 ? `${sentence.slice(0, 69)}...` : sentence;
}

function splitSections(source: KnowledgeSourceInput, docIndex: number): SectionDraft[] {
  const text = normalizeText(source.text);
  if (!text) return [];

  const docClusterId = `doc-${slugifyClusterId(cleanDocName(source.name))}`;
  const headingSections: Array<{ heading: string; text: string }> = [];
  let heading = '';
  let buffer: string[] = [];
  const lines = text.split('\n');

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (!body) return;
    headingSections.push({ heading, text: body });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      heading = line.replace(/^#{1,6}\s+/, '').trim();
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  const sections = headingSections.length >= 2 ? headingSections : chunkParagraphs(text);
  return sections.slice(0, 24).map((section, index) => {
    const label = section.heading?.trim() || sentenceLabel(section.text, `${cleanDocName(source.name)} ${index + 1}`);
    return {
      id: `lab_${docIndex}_${index}`,
      room: source.name,
      blockTs: `Section ${index + 1}`,
      label,
      text: section.text.trim(),
      docIndex,
      docClusterId,
      keywords: keywordRanks(section.text),
    };
  });
}

function chunkParagraphs(text: string): Array<{ heading: string; text: string }> {
  const paras = text
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const chunks: Array<{ heading: string; text: string }> = [];
  let bucket: string[] = [];
  let length = 0;

  for (const para of paras) {
    bucket.push(para);
    length += para.length;
    if (length >= 900) {
      chunks.push({ heading: '', text: bucket.join('\n\n') });
      bucket = [];
      length = 0;
    }
  }
  if (bucket.length) chunks.push({ heading: '', text: bucket.join('\n\n') });
  if (!chunks.length) chunks.push({ heading: '', text });
  return chunks;
}

function intersect<T>(left: T[], right: T[]): T[] {
  const set = new Set(right);
  return left.filter((item) => set.has(item));
}

export function generateKnowledgeGraph(sources: KnowledgeSourceInput[]): KnowledgeGraphResult {
  const valid = sources.map((source) => ({ ...source, text: normalizeText(source.text) })).filter((source) => source.text);
  const sections = valid.flatMap((source, docIndex) => splitSections(source, docIndex)).slice(0, 120);
  const now = new Date().toISOString();
  if (!sections.length) {
    return {
      graph: { version: 1, updatedAt: now, clusters: [], nodes: [], edges: [] },
      nodeTextById: {},
      blockTextByKey: {},
      sourceCount: valid.length,
      sectionCount: 0,
    };
  }

  const docClusters = new Map<string, Cluster>();
  const keywordStats = new Map<string, { count: number; docs: Set<number> }>();
  for (const section of sections) {
    if (!docClusters.has(section.docClusterId)) {
      docClusters.set(section.docClusterId, {
        id: section.docClusterId,
        name: cleanDocName(section.room),
        color: PALETTE[docClusters.size % PALETTE.length],
        desc: 'Source document',
      });
    }
    for (const token of new Set(section.keywords.slice(0, 8))) {
      const stat = keywordStats.get(token) || { count: 0, docs: new Set<number>() };
      stat.count += 1;
      stat.docs.add(section.docIndex);
      keywordStats.set(token, stat);
    }
  }

  const thematicKeywords = [...keywordStats.entries()]
    .filter(([, stat]) => stat.count >= 2)
    .sort((a, b) => {
      const byCount = b[1].count - a[1].count;
      if (byCount) return byCount;
      const byDocs = b[1].docs.size - a[1].docs.size;
      if (byDocs) return byDocs;
      return b[0].length - a[0].length;
    })
    .slice(0, 12);

  const keywordClusters = new Map<string, Cluster>();
  for (const [keyword] of thematicKeywords) {
    const id = slugifyClusterId(keyword);
    if (!keywordClusters.has(id)) {
      keywordClusters.set(id, {
        id,
        name: keyword,
        color: PALETTE[(docClusters.size + keywordClusters.size) % PALETTE.length],
        desc: 'Auto-generated theme',
      });
    }
  }

  const nodeTextById: Record<string, string> = {};
  const blockTextByKey: Record<string, string> = {};
  const nodes: NeuralNode[] = sections.map((section) => {
    const topicalClusterIds = section.keywords
      .map((keyword) => slugifyClusterId(keyword))
      .filter((id, index, arr) => keywordClusters.has(id) && arr.indexOf(id) === index)
      .slice(0, 2);
    const clusters = [section.docClusterId, ...topicalClusterIds];
    nodeTextById[section.id] = section.text;
    blockTextByKey[`${section.room}::${section.blockTs}`] = section.text;
    return {
      id: section.id,
      room: section.room,
      blockTs: section.blockTs,
      label: section.label,
      clusters,
      source: 'knowledge-studio',
    };
  });

  const sectionsByDoc = new Map<number, SectionDraft[]>();
  for (const section of sections) {
    const list = sectionsByDoc.get(section.docIndex) || [];
    list.push(section);
    sectionsByDoc.set(section.docIndex, list);
  }

  const edges: Edge[] = [];
  const edgeKeys = new Set<string>();
  const pushEdge = (from: string, to: string, type: string) => {
    const key = [from, to].sort().join('::');
    if (from === to || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, type });
  };

  for (const docSections of sectionsByDoc.values()) {
    for (let index = 1; index < docSections.length; index++) {
      pushEdge(docSections[index - 1].id, docSections[index].id, 'supports');
    }
  }

  const relationCandidates: Array<{ from: string; to: string; score: number }> = [];
  for (let leftIndex = 0; leftIndex < sections.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < sections.length; rightIndex++) {
      const left = sections[leftIndex];
      const right = sections[rightIndex];
      const sharedKeywords = intersect(left.keywords.slice(0, 6), right.keywords.slice(0, 6));
      const sharedThemes = sharedKeywords.filter((keyword) => keywordClusters.has(slugifyClusterId(keyword)));
      if (!sharedThemes.length && sharedKeywords.length < 2) continue;
      const score = sharedThemes.length * 4 + sharedKeywords.length * 2 + (left.docIndex === right.docIndex ? 1 : 0);
      relationCandidates.push({ from: left.id, to: right.id, score });
    }
  }

  relationCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 160)
    .forEach((edge) => pushEdge(edge.from, edge.to, 'relates'));

  return {
    graph: {
      version: 1,
      updatedAt: now,
      clusters: [...docClusters.values(), ...keywordClusters.values()],
      nodes,
      edges,
    },
    nodeTextById,
    blockTextByKey,
    sourceCount: valid.length,
    sectionCount: sections.length,
  };
}
