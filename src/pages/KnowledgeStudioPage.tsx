import { startTransition, useCallback, useMemo, useRef, useState } from 'react';
import {
  Brain, FileArrowUp, Files, Graph, Lightning, Spinner as Loader2, Trash, UploadSimple,
} from '@phosphor-icons/react';
import NeuralGraphView from '../components/NeuralGraphView';
import { extractKind, extractText, isExtractable } from '../lib/extract';
import { generateKnowledgeGraph, type KnowledgeGraphResult } from '../lib/knowledge/oneShot';
import { useLanguage } from '../contexts/LanguageContext';

interface SourceItem {
  id: string;
  file: File;
  name: string;
  ext: string;
  size: number;
  status: 'queued' | 'extracting' | 'done' | 'error';
  progress: number;
  text: string;
  error?: string;
}

const ACCEPT_ATTR = '.pdf,.docx,.hwpx,.pptx,.txt,.md,.markdown,.csv,.json,.log';

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeStudioPage() {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [result, setResult] = useState<KnowledgeGraphResult | null>(null);

  const updateSource = useCallback((id: string, patch: Partial<SourceItem>) => {
    setSources((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const extractBatch = useCallback(async (items: SourceItem[]) => {
    for (const item of items) {
      if (!isExtractable(item.file)) {
        updateSource(item.id, {
          status: 'error',
          error: ko ? '지원하지 않는 형식입니다.' : 'Unsupported file type.',
        });
        continue;
      }
      updateSource(item.id, { status: 'extracting', progress: 0, error: undefined });
      try {
        const text = await extractText(item.file, (progress) => updateSource(item.id, { progress }));
        updateSource(item.id, {
          status: text.trim() ? 'done' : 'error',
          progress: 100,
          text,
          error: text.trim() ? undefined : (ko ? '텍스트를 찾지 못했습니다.' : 'No text found.'),
        });
      } catch (error) {
        updateSource(item.id, {
          status: 'error',
          error: error instanceof Error ? error.message : (ko ? '추출 실패' : 'Extraction failed'),
        });
      }
    }
  }, [ko, updateSource]);

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const created = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      file,
      name: file.name,
      ext: extractKind(file),
      size: file.size,
      status: 'queued' as const,
      progress: 0,
      text: '',
    }));
    setSources((prev) => [...prev, ...created]);
    void extractBatch(created);
  }, [extractBatch]);

  const readySources = useMemo(
    () => sources.filter((item) => item.status === 'done' && item.text.trim()),
    [sources],
  );
  const totalChars = useMemo(
    () => readySources.reduce((sum, item) => sum + item.text.length, 0),
    [readySources],
  );

  const handleGenerate = useCallback(() => {
    if (!readySources.length || generating) return;
    setGenerating(true);
    const payload = readySources.map((item) => ({ name: item.name, text: item.text }));
    window.setTimeout(() => {
      const next = generateKnowledgeGraph(payload);
      startTransition(() => {
        setResult(next);
        setGenerating(false);
      });
    }, 0);
  }, [generating, readySources]);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const topClusters = useMemo(
    () => (result?.graph.clusters || []).slice(0, 10),
    [result],
  );

  return (
    <div className="knowledge-studio-page">
      <section className="knowledge-studio-hero">
        <div>
          <div className="knowledge-studio-eyebrow">
            <Brain size={14} weight="fill" />
            {ko ? '개인 지식망 스튜디오' : 'Personal Knowledge Studio'}
          </div>
          <h1>{ko ? '문서 뭉치를 한 번에 개인 지식 그래프로 변환' : 'Turn a document pile into a personal knowledge graph'}</h1>
          <p>
            {ko
              ? '워드, 한글, PPT, PDF에서 텍스트만 추출하고, 그 결과를 기준으로 1회성 노드·관계·클러스터를 생성합니다.'
              : 'Extract text from Word, HWPX, PPT, and PDF files, then build a one-shot graph of nodes, relations, and clusters.'}
          </p>
        </div>
        <div className="knowledge-studio-actions">
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            <UploadSimple size={16} />
            {ko ? '문서 추가' : 'Add documents'}
          </button>
          <button className="btn btn-secondary" onClick={handleGenerate} disabled={!readySources.length || generating}>
            {generating ? <Loader2 size={16} className="spin" /> : <Lightning size={16} />}
            {ko ? '지식망 생성' : 'Generate graph'}
          </button>
          <button className="btn btn-ghost" onClick={() => setGraphOpen(true)} disabled={!result?.graph.nodes.length}>
            <Graph size={16} />
            {ko ? '그래프 보기' : 'Open graph'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={(event) => {
              if (event.target.files?.length) handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="knowledge-studio-stats">
        <article className="knowledge-stat-card">
          <span>{ko ? '추출 완료 문서' : 'Extracted docs'}</span>
          <strong>{formatCount(readySources.length)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '텍스트 총량' : 'Total text'}</span>
          <strong>{formatCount(totalChars)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '생성 노드' : 'Generated nodes'}</span>
          <strong>{formatCount(result?.graph.nodes.length || 0)}</strong>
        </article>
        <article className="knowledge-stat-card">
          <span>{ko ? '클러스터' : 'Clusters'}</span>
          <strong>{formatCount(result?.graph.clusters.length || 0)}</strong>
        </article>
      </section>

      <section
        className={`knowledge-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
        }}
      >
        <FileArrowUp size={28} />
        <h2>{ko ? '여기에 문서를 떨어뜨리세요' : 'Drop documents here'}</h2>
        <p>
          {ko
            ? '지원 형식: DOCX, HWPX, PPTX, PDF, TXT, MD, CSV, JSON, LOG'
            : 'Supported: DOCX, HWPX, PPTX, PDF, TXT, MD, CSV, JSON, LOG'}
        </p>
      </section>

      <section className="knowledge-grid">
        <div className="knowledge-panel">
          <div className="knowledge-panel-header">
            <h3>{ko ? '소스 문서' : 'Source documents'}</h3>
            <span>{formatCount(sources.length)}</span>
          </div>
          <div className="knowledge-source-list">
            {sources.length === 0 && (
              <div className="knowledge-empty">
                <Files size={22} />
                <p>{ko ? '아직 추가된 문서가 없습니다.' : 'No documents added yet.'}</p>
              </div>
            )}
            {sources.map((item) => (
              <article key={item.id} className="knowledge-source-card">
                <div className="knowledge-source-top">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="knowledge-source-meta">
                      <span>{item.ext.toUpperCase() || 'FILE'}</span>
                      <span>{formatSize(item.size)}</span>
                    </div>
                  </div>
                  <button className="icon-button" onClick={() => removeSource(item.id)} aria-label="remove">
                    <Trash size={14} />
                  </button>
                </div>
                <div className="knowledge-source-status">
                  <span className={`chip ${item.status === 'done' ? 'chip-idea' : item.status === 'error' ? 'chip-question' : 'chip-source'}`}>
                    {item.status === 'queued' && (ko ? '대기' : 'Queued')}
                    {item.status === 'extracting' && (ko ? `추출 중 ${item.progress}%` : `Extracting ${item.progress}%`)}
                    {item.status === 'done' && (ko ? `${formatCount(item.text.length)}자` : `${formatCount(item.text.length)} chars`)}
                    {item.status === 'error' && (ko ? '오류' : 'Error')}
                  </span>
                  {item.error && <span className="knowledge-error-text">{item.error}</span>}
                </div>
                {item.status === 'extracting' && (
                  <div className="knowledge-progress">
                    <div style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="knowledge-panel">
          <div className="knowledge-panel-header">
            <h3>{ko ? '생성 결과' : 'Generated graph'}</h3>
            <span>{formatCount(result?.sectionCount || 0)}</span>
          </div>
          {!result ? (
            <div className="knowledge-empty">
              <Brain size={22} />
              <p>{ko ? '문서를 추출한 뒤 지식망 생성을 실행하세요.' : 'Extract documents, then generate the graph.'}</p>
            </div>
          ) : (
            <div className="knowledge-summary">
              <div className="knowledge-summary-copy">
                <p>
                  {ko
                    ? `${result.sourceCount}개 문서에서 ${formatCount(result.sectionCount)}개 섹션을 만들고, ${formatCount(result.graph.edges.length)}개 연결을 생성했습니다.`
                    : `Built ${formatCount(result.sectionCount)} sections and ${formatCount(result.graph.edges.length)} links from ${result.sourceCount} documents.`}
                </p>
              </div>
              <div className="knowledge-cluster-list">
                {topClusters.map((cluster) => (
                  <div key={cluster.id} className="knowledge-cluster-row">
                    <span className="knowledge-cluster-swatch" style={{ background: cluster.color || 'var(--accent)' }} />
                    <div>
                      <strong>{cluster.name}</strong>
                      <p>{cluster.desc || (ko ? '자동 생성 클러스터' : 'Auto-generated cluster')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {graphOpen && result && (
        <NeuralGraphView
          graph={result.graph}
          currentRoom=""
          language={language}
          getBlockText={async (roomPath, blockTs) => result.blockTextByKey[`${roomPath}::${blockTs}`] || null}
          onClose={() => setGraphOpen(false)}
          onJump={() => {}}
        />
      )}
    </div>
  );
}
