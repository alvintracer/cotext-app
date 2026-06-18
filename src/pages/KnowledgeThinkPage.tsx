import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { Brain, ChatText, Graph, Lightning, MagnifyingGlass, Spinner as Loader2, Warning } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getKey, getPref, setKey, setPref } from '../lib/agent/keys';
import { getProvider, PROVIDERS, type ProviderId, formatCost, type TokenUsage } from '../lib/agent/models';
import { runChat } from '../lib/agent/providers';
import { loadKnowledgeSnapshot } from '../lib/knowledge/session';
import { buildThinkSystem, searchKnowledgeSnapshot, type ThinkHit } from '../lib/knowledge/think';
import NeuralGraphView from '../components/NeuralGraphView';
import NeuralGraphBoundary from '../components/NeuralGraphBoundary';

export default function KnowledgeThinkPage() {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const navigate = useNavigate();
  const snapshot = loadKnowledgeSnapshot();
  const [providerId, setProviderId] = useState<ProviderId>(() => getPref()?.provider ?? 'gemini');
  const [model, setModel] = useState<string>(() => getPref()?.model ?? getProvider('gemini').defaultModel);
  const [apiKey, setApiKeyState] = useState<string>(() => getKey(getPref()?.provider ?? 'gemini'));
  const [question, setQuestion] = useState('');
  const [hits, setHits] = useState<ThinkHit[]>([]);
  const [answer, setAnswer] = useState('');
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const provider = getProvider(providerId);
  // Map ref ("S1") → hit, so the answer's [S#] tokens can scroll to the card
  const hitsByRef = useMemo(() => {
    const m: Record<string, ThinkHit> = {};
    for (const h of hits) m[h.ref] = h;
    return m;
  }, [hits]);
  const hitRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollToHit = useCallback((ref: string) => {
    const el = hitRefs.current[ref];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('hit-flash');
    setTimeout(() => el.classList.remove('hit-flash'), 1200);
  }, []);
  // Split answer into text spans + clickable [S#] tokens
  const renderedAnswer = useMemo(() => {
    if (!answer) return null;
    const re = /\[(S\d+)\]/g;
    const out: Array<{ kind: 'text' | 'ref'; value: string }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(answer)) !== null) {
      if (m.index > last) out.push({ kind: 'text', value: answer.slice(last, m.index) });
      out.push({ kind: 'ref', value: m[1] });
      last = m.index + m[0].length;
    }
    if (last < answer.length) out.push({ kind: 'text', value: answer.slice(last) });
    return out;
  }, [answer]);

  const savePrefs = () => {
    setKey(providerId, apiKey.trim());
    setPref({ provider: providerId, model });
  };

  const runThink = async () => {
    if (!snapshot || !question.trim()) return;
    const ranked = searchKnowledgeSnapshot(snapshot, question, 8);
    setHits(ranked);
    setAnswer('');
    setUsage(null);
    setError(null);

    if (!apiKey.trim()) {
      setError(ko ? 'Think 응답을 생성하려면 API 키가 필요합니다.' : 'An API key is required to generate a think answer.');
      return;
    }
    if (!ranked.length) {
      setError(ko ? '현재 스냅샷에서 관련 근거를 찾지 못했습니다.' : 'No relevant evidence was found in the current snapshot.');
      return;
    }

    setRunning(true);
    try {
      const text = await runChat({
        shape: provider.shape,
        baseURL: provider.baseURL,
        apiKey: apiKey.trim(),
        model: model || provider.defaultModel,
        system: buildThinkSystem(ko, ranked, question),
        messages: [{ role: 'user', content: ko ? '근거를 바탕으로 답변해줘.' : 'Answer from the evidence.' }],
        onUsage: (value) => setUsage(value),
      });
      setAnswer(text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="knowledge-think-page">
      <section className="knowledge-think-hero">
        <div>
          <div className="knowledge-studio-eyebrow">
            <ChatText size={14} weight="fill" />
            {ko ? '지식망 Think 모드' : 'Knowledge Think Mode'}
          </div>
          <h1>{ko ? '생성한 지식망에 질문하고 근거와 함께 답변 받기' : 'Ask your generated graph and get grounded answers'}</h1>
          <p>
            {ko
              ? 'Knowledge Studio에서 만든 최근 스냅샷을 읽고, 로컬 hybrid search로 근거를 고른 뒤 BYOK 모델로 종합 답변을 생성합니다.'
              : 'Reads the latest Knowledge Studio snapshot, ranks evidence with local hybrid search, then generates a grounded answer with your BYOK model.'}
          </p>
        </div>
        <div className="knowledge-think-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setGraphOpen(true)}
            disabled={!snapshot?.graph.nodes.length}
            title={!snapshot?.graph.nodes.length ? (ko ? '그래프 없음' : 'No graph') : undefined}
          >
            <Graph size={16} />
            {ko ? '그래프 보기' : 'Open graph'}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/mindsync/studio')}>
            <Brain size={16} />
            {ko ? 'Studio 열기' : 'Open Studio'}
          </button>
        </div>
      </section>

      {!snapshot ? (
        <section className="knowledge-think-empty">
          <Warning size={20} weight="fill" />
          <h3>{ko ? '먼저 Knowledge Studio에서 그래프를 생성하세요.' : 'Generate a graph in Knowledge Studio first.'}</h3>
          <p>{ko ? '최근 생성 결과가 브라우저에 저장돼야 Think 모드가 근거를 읽을 수 있습니다.' : 'Think mode needs a recent local snapshot from Knowledge Studio.'}</p>
        </section>
      ) : (
        <>
          <section className="knowledge-think-toolbar">
            <div className="knowledge-byok-row">
              <span className="knowledge-byok-label">{ko ? 'AI 모델' : 'AI model'}</span>
              <select
                className="knowledge-byok-select"
                value={providerId}
                onChange={(e) => {
                  const id = e.target.value as ProviderId;
                  setProviderId(id);
                  setModel(getProvider(id).defaultModel);
                  setApiKeyState(getKey(id));
                }}
              >
                {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <input
                className="knowledge-byok-model"
                list={`think-models-${providerId}`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider.defaultModel}
              />
              <datalist id={`think-models-${providerId}`}>
                {provider.models.map((item) => <option key={item} value={item} />)}
              </datalist>
              <input
                type="password"
                className="knowledge-byok-key"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder={provider.keyLabel}
              />
              <button className="btn btn-ghost btn-sm" onClick={savePrefs} disabled={!apiKey.trim()}>
                {ko ? '저장' : 'Save'}
              </button>
            </div>
            <p className="knowledge-byok-note">
              {ko
                ? `최근 스냅샷: ${snapshot.sourceCount}개 문서, ${snapshot.sectionCount}개 섹션, ${snapshot.graph.nodes.length}개 노드`
                : `Latest snapshot: ${snapshot.sourceCount} docs, ${snapshot.sectionCount} sections, ${snapshot.graph.nodes.length} nodes`}
            </p>
          </section>

          <section className="knowledge-think-query">
            <div className="knowledge-think-query-row">
              <textarea
                className="knowledge-think-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={ko ? '예: 이 자료들 기준으로 Neural Link가 GBrain보다 구조적으로 강한 이유를 정리해줘' : 'Example: Based on these materials, why is Neural Link structurally stronger than GBrain?'}
                rows={4}
              />
              <button className="btn btn-primary" onClick={runThink} disabled={running || !question.trim()}>
                {running ? <><Loader2 size={16} className="spin" /> {ko ? '생성 중' : 'Thinking'}</> : <><Lightning size={16} /> {ko ? 'Think' : 'Think'}</>}
              </button>
            </div>
            {error && <p className="knowledge-think-error"><Warning size={14} /> {error}</p>}
          </section>

          <section className="knowledge-think-grid">
            <div className="knowledge-panel">
              <div className="knowledge-panel-header">
                <h3>{ko ? '근거 후보' : 'Evidence hits'}</h3>
                <span>{hits.length}</span>
              </div>
              <div className="knowledge-think-hits">
                {hits.length === 0 ? (
                  <div className="knowledge-empty">
                    <MagnifyingGlass size={20} />
                    <p>{ko ? '질문하면 관련 노드가 여기 정렬됩니다.' : 'Ask a question and relevant nodes will be ranked here.'}</p>
                  </div>
                ) : hits.map((hit) => (
                  <article
                    key={hit.nodeId}
                    className="knowledge-think-hit"
                    ref={(el) => { hitRefs.current[hit.ref] = el; }}
                  >
                    <div className="knowledge-think-hit-top">
                      <strong>[{hit.ref}] {hit.label}</strong>
                      <span>{hit.score}</span>
                    </div>
                    <p className="knowledge-think-hit-meta">{hit.room} · {hit.blockTs}</p>
                    <p className="knowledge-think-hit-text">{hit.text.slice(0, 260) || (ko ? '본문 없음' : 'No body')}</p>
                    <p className="knowledge-think-hit-tags">{hit.clusters.join(' · ')}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="knowledge-panel">
              <div className="knowledge-panel-header">
                <h3>{ko ? 'Think 답변' : 'Think answer'}</h3>
                <span>{usage ? formatCost(model || provider.defaultModel, usage) : ''}</span>
              </div>
              <div className="knowledge-think-answer">
                {renderedAnswer ? (
                  <>
                    <pre className="knowledge-think-answer-text">
                      {renderedAnswer.map((seg, i) => seg.kind === 'text'
                        ? <Fragment key={i}>{seg.value}</Fragment>
                        : (
                          <button
                            key={i}
                            className={`knowledge-think-ref ${hitsByRef[seg.value] ? '' : 'knowledge-think-ref-missing'}`}
                            onClick={() => scrollToHit(seg.value)}
                            disabled={!hitsByRef[seg.value]}
                            title={hitsByRef[seg.value]?.label || (ko ? '근거 없음' : 'no matching evidence')}
                          >[{seg.value}]</button>
                        )
                      )}
                    </pre>
                    {usage && (
                      <p className="knowledge-byok-note">
                        {ko
                          ? `토큰: in ${usage.inputTokens.toLocaleString()} / out ${usage.outputTokens.toLocaleString()}`
                          : `Tokens: in ${usage.inputTokens.toLocaleString()} / out ${usage.outputTokens.toLocaleString()}`}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="knowledge-empty">
                    <ChatText size={20} />
                    <p>{ko ? '질문을 입력하면 근거 기반 답변이 여기에 표시됩니다.' : 'Grounded answers will appear here after you ask a question.'}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {graphOpen && snapshot && (
        <NeuralGraphBoundary
          surfaceLabel={ko ? '마인드싱크 그래프' : 'MindSync graph'}
          onClose={() => setGraphOpen(false)}
        >
          <NeuralGraphView
            graph={snapshot.graph}
            currentRoom=""
            language={language}
            getBlockText={async (roomPath, blockTs) =>
              snapshot.blockTextByKey[`${roomPath}::${blockTs}`] || null
            }
            onClose={() => setGraphOpen(false)}
            onJump={() => {}}
          />
        </NeuralGraphBoundary>
      )}
    </div>
  );
}
