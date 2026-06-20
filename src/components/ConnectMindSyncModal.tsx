import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  X, Copy, Check, Terminal, CodeSimple, Robot, ChatText, Link as LinkIcon,
  Key, Plus, Eye, EyeSlash, Trash, DownloadSimple,
} from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { generateNeuralIndex } from '../lib/neural';
import type { NeuralGraph } from '../lib/neural';

export interface ConnectMindSyncWorkspace {
  id: string;
  name: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspace?: ConnectMindSyncWorkspace | null;
  /** Workspace's current graph — when provided, web-agent prompt copies it inline
   *  with NO API key + NO fetch. This is the universally-working path because web
   *  chats (ChatGPT/Gemini/Claude.ai) cannot make outbound HTTP calls themselves. */
  graph?: NeuralGraph | null;
  apiKey?: string;
  apiUrl?: string;
  language?: 'ko' | 'en';
}

type TabId = 'claude-code' | 'desktop' | 'web-agent' | 'http';

const DEFAULT_API_URL =
  (import.meta.env.VITE_COTEXT_API_URL as string | undefined)
  ?? (import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/context-api`
    : 'https://YOUR-PROJECT.supabase.co/functions/v1/context-api');

export default function ConnectMindSyncModal({
  open,
  onClose,
  workspace,
  graph,
  apiKey,
  apiUrl,
  language = 'en',
}: Props) {
  const { user } = useAuth();
  const url = apiUrl ?? DEFAULT_API_URL;
  const repoLabel = workspace ? `${workspace.github_owner}/${workspace.github_repo}` : 'OWNER/REPO';

  // Inline API key management
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [keys, setKeys] = useState<{id:string; key:string; label:string; created_at:string}[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedId, setRevealedId] = useState<string|null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string|null>(null);

  const fetchKeys = useCallback(async () => {
    if (!workspace || !user) return;
    setKeysLoading(true);
    const { data } = await supabase
      .from('api_keys')
      .select('id, key, label, created_at')
      .eq('workspace_id', workspace.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys(data || []);
    setKeysLoading(false);
  }, [workspace, user]);

  useEffect(() => { if (showKeyPanel) fetchKeys(); }, [showKeyPanel, fetchKeys]);

  const handleCreateKey = async () => {
    if (!user || !workspace) return;
    setCreating(true);
    try {
      await supabase.from('api_keys').insert({
        workspace_id: workspace.id,
        user_id: user.id,
        label: newLabel || 'mindsync',
        scopes: ['read', 'write'],
      });
      setNewLabel('');
      await fetchKeys();
    } finally { setCreating(false); }
  };

  const handleRevokeKey = async (id: string) => {
    await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    await fetchKeys();
  };

  const activeKey = keys.length > 0 ? keys[0].key : (apiKey || '');
  const keyLabel = activeKey || 'ctx_xxxxxxxx';

  const ko = language === 'ko';
  const [tab, setTab] = useState<TabId>('claude-code');
  const [copied, setCopied] = useState<string | null>(null);
  const [fetchingGraph, setFetchingGraph] = useState(false);

  // ── Share links for the graph (Tier-2 path) ─────────────────────────────
  // A graph share-link is a stable, JWT-style token URL that returns the
  // workspace's latest NEURAL_INDEX.md without auth headers — so web chats
  // (ChatGPT/Claude.ai/Gemini) can fetch it. Always reads the live file from
  // GitHub, so push-and-go just works.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  type GraphLink = { id: string; token: string; label: string | null; expires_at: string | null; created_at: string; access_count: number };
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [graphLinksLoading, setGraphLinksLoading] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const shareLinkUrl = (token: string) =>
    `${supabaseUrl}/functions/v1/context-share?token=${token}&format=markdown`;

  const fetchGraphLinks = useCallback(async () => {
    if (!workspace || !user) return;
    setGraphLinksLoading(true);
    const { data } = await supabase
      .from('shared_links')
      .select('id, token, label, expires_at, created_at, access_count')
      .eq('workspace_id', workspace.id)
      .eq('link_type', 'graph')
      .order('created_at', { ascending: false });
    setGraphLinks((data as GraphLink[] | null) || []);
    setGraphLinksLoading(false);
  }, [workspace, user]);

  useEffect(() => { if (tab === 'web-agent') fetchGraphLinks(); }, [tab, fetchGraphLinks]);

  const handleCreateShareLink = async () => {
    if (!user || !workspace) return;
    setCreatingLink(true);
    try {
      const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString(); // 90d default
      const { error } = await supabase.from('shared_links').insert({
        workspace_id: workspace.id,
        user_id: user.id,
        link_type: 'graph',
        source_filter: 'me', // unused for graph links
        label: `${workspace.github_repo} — graph`,
        expires_at: expiresAt,
      });
      if (error) throw error;
      await fetchGraphLinks();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeShareLink = async (id: string) => {
    // Revoke = delete the row. The shared_links table has no `revoked_at`
    // column (unlike api_keys); deletion is the documented semantics.
    await supabase.from('shared_links').delete().eq('id', id);
    await fetchGraphLinks();
  };

  const copyLinkUrl = (linkId: string, token: string) => {
    navigator.clipboard.writeText(shareLinkUrl(token));
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 1400);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    });
  };

  /**
   * Build the markdown snapshot of the workspace graph (same `generateNeuralIndex`
   * the compiler emits to `.cotext/NEURAL_INDEX.md`). Local render when possible;
   * legacy server fetch as fallback when the graph hasn't been loaded yet.
   *
   * Used by both download and copy paths — web chats can't fetch URLs themselves.
   */
  const buildGraphMarkdown = async (): Promise<string | null> => {
    if (graph) return generateNeuralIndex(graph, repoLabel);
    if (activeKey) {
      const res = await fetch(`${url}/neural/graph?format=markdown`, {
        headers: { 'Authorization': `Bearer ${activeKey}` },
      });
      if (!res.ok) throw new Error(ko ? '그래프 데이터를 가져오는데 실패했습니다.' : 'Failed to fetch graph data.');
      return await res.text();
    }
    alert(ko
      ? '워크스페이스를 먼저 선택해주세요.'
      : 'Select a workspace first.');
    return null;
  };

  const handleDownloadGraphFile = async () => {
    setFetchingGraph(true);
    try {
      const md = await buildGraphMarkdown();
      if (!md) return;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const fname = `NEURAL_INDEX_${(workspace?.github_repo ?? 'mindsync').replace(/[^a-zA-Z0-9_-]/g, '-')}.md`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setCopied('wa-dl');
      setTimeout(() => setCopied(null), 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingGraph(false);
    }
  };

  const handleCopyGraphPrompt = async () => {
    setFetchingGraph(true);
    try {
      const graphMarkdown = await buildGraphMarkdown();
      if (!graphMarkdown) return;
      const fullPrompt =
`I have a MindSync knowledge graph at ${repoLabel}. Treat the snapshot below as your ONLY source of truth. Cite node IDs (e.g. n_xxxx) and labels exactly as written. If an answer isn't in the graph, say so plainly.

---
### MindSync Knowledge Graph
${graphMarkdown}
`;
      await navigator.clipboard.writeText(fullPrompt);
      setCopied('wa');
      setTimeout(() => setCopied(null), 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingGraph(false);
    }
  };

  const snippets = useMemo(() => ({
    claudeCodeLocal: `# Inside your cloned ${repoLabel} repo
claude mcp add cotext npx -y cotext-mcp`,
    claudeCodeRemote: `# Anywhere - uses a Cotext API key (no clone needed)
claude mcp add cotext-remote \\
  -e COTEXT_API_KEY=${keyLabel} \\
  -e COTEXT_API_URL=${url} \\
  -- npx -y cotext-mcp`,
    desktopLocal: JSON.stringify({
      mcpServers: {
        cotext: {
          command: 'npx',
          args: ['-y', 'cotext-mcp'],
          cwd: '/absolute/path/to/your/repo',
        },
      },
    }, null, 2),
    desktopRemote: JSON.stringify({
      mcpServers: {
        'cotext-remote': {
          command: 'npx',
          args: ['-y', 'cotext-mcp'],
          env: {
            COTEXT_API_KEY: keyLabel,
            COTEXT_API_URL: url,
          },
        },
      },
    }, null, 2),
    webAgentPrompt:
`I have a MindSync knowledge graph at ${repoLabel}. Before answering my question, fetch the latest snapshot:

  GET ${url}/neural/graph?format=markdown
  Authorization: Bearer ${keyLabel}

The response is a markdown table of clusters, nodes, and edges. Use it as your only source of truth. When you cite, use the node IDs (for example n_xxxx) and labels exactly as they appear.

To inspect one node: GET ${url}/neural/node?id=<node_id>
To find related nodes: GET ${url}/neural/find_related?node_id=<node_id>

If the answer is not in the graph, say so plainly. Never invent.`,
    curlGraph: `curl -H "Authorization: Bearer ${keyLabel}" \\
  "${url}/neural/graph?format=markdown"`,
    curlSearch: `curl -H "Authorization: Bearer ${keyLabel}" \\
  "${url}/neural/search_clusters?q=pricing"`,
    curlNode: `curl -H "Authorization: Bearer ${keyLabel}" \\
  "${url}/neural/node?id=n_xxxxxxxx"`,
  }), [repoLabel, keyLabel, url]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content connect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header connect-header">
          <div>
            <h3><LinkIcon size={18} /> {ko ? '에이전트에 MindSync 연결' : 'Connect MindSync with your agent'}</h3>
            <p className="connect-sub">
              {ko
                ? `${repoLabel} 워크스페이스의 지식 그래프를 Claude Code, 로컬 MCP 도구, ChatGPT, Gemini까지 같은 기준 컨텍스트로 연결합니다.`
                : `Use ${repoLabel}'s knowledge graph as the same brain across any AI agent.`}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="close"><X size={16} /></button>
        </div>

        <div className="connect-tabs" role="tablist">
          <button className={`connect-tab ${tab === 'claude-code' ? 'active' : ''}`} onClick={() => setTab('claude-code')}>
            <Terminal size={14} /> Claude Code
          </button>
          <button className={`connect-tab ${tab === 'desktop' ? 'active' : ''}`} onClick={() => setTab('desktop')}>
            <CodeSimple size={14} /> {ko ? '로컬 MCP' : 'Local MCP'}
          </button>
          <button className={`connect-tab ${tab === 'web-agent' ? 'active' : ''}`} onClick={() => setTab('web-agent')}>
            <ChatText size={14} /> {ko ? 'ChatGPT / Gemini / Web' : 'Web agents'}
          </button>
          <button className={`connect-tab ${tab === 'http' ? 'active' : ''}`} onClick={() => setTab('http')}>
            <Robot size={14} /> Direct HTTP
          </button>
        </div>

        <div className="modal-body connect-body">
          {!activeKey && tab !== 'claude-code' && (
            <div className="connect-warning">
              <div className="connect-warning-row">
                <span>
                  {ko
                    ? '아래의 원격 연결 방식은 Cotext API Key가 필요합니다. 아래에서 바로 발급할 수 있습니다.'
                    : 'The remote options below need a Cotext API key. You can create one right here.'}
                </span>
                {workspace && (
                  <button
                    className="connect-warning-cta"
                    onClick={() => setShowKeyPanel(p => !p)}
                  >
                    <Key size={13} /> {showKeyPanel ? (ko ? '닫기' : 'Close') : (ko ? 'API Key 발급' : 'Create API Key')}
                  </button>
                )}
              </div>
              {showKeyPanel && (
                <div className="connect-key-panel">
                  <div className="connect-key-create">
                    <input
                      className="connect-key-input"
                      placeholder={ko ? '키 이름 (선택)' : 'Key label (optional)'}
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateKey()}
                    />
                    <button className="connect-warning-cta" onClick={handleCreateKey} disabled={creating}>
                      <Plus size={12} /> {creating ? '...' : (ko ? '발급' : 'Create')}
                    </button>
                  </div>
                  {keysLoading ? (
                    <p className="connect-key-loading">{ko ? '로딩...' : 'Loading...'}</p>
                  ) : keys.length === 0 ? (
                    <p className="connect-key-empty">{ko ? '아직 키가 없습니다' : 'No keys yet'}</p>
                  ) : (
                    <div className="connect-key-list">
                      {keys.map(k => (
                        <div key={k.id} className="connect-key-row">
                          <span className="connect-key-label">{k.label}</span>
                          <code className="connect-key-value">
                            {revealedId === k.id ? k.key : `${k.key.slice(0, 8)}${'·'.repeat(12)}${k.key.slice(-4)}`}
                          </code>
                          <button className="connect-key-action" onClick={() => setRevealedId(revealedId === k.id ? null : k.id)}>
                            {revealedId === k.id ? <EyeSlash size={12} /> : <Eye size={12} />}
                          </button>
                          <button className="connect-key-action" onClick={() => { navigator.clipboard.writeText(k.key); setCopiedKeyId(k.id); setTimeout(() => setCopiedKeyId(null), 1200); }}>
                            {copiedKeyId === k.id ? <Check size={12} weight="bold" /> : <Copy size={12} />}
                          </button>
                          <button className="connect-key-action connect-key-delete" onClick={() => handleRevokeKey(k.id)}>
                            <Trash size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'claude-code' && (
            <>
              <CodeBlock
                title={ko ? '로컬 연결 (레포가 내 머신에 있음)' : 'Local (repo is on your machine)'}
                lang="bash"
                code={snippets.claudeCodeLocal}
                copied={copied === 'cc-local'}
                onCopy={() => copy(snippets.claudeCodeLocal, 'cc-local')}
                help={ko ? '클론한 레포 안에서 실행하면 됩니다. API 키가 필요 없습니다.' : 'Run inside the repo. No API key needed.'}
              />
              <CodeBlock
                title={ko ? '원격 연결 (어디서든 가능, API 키 필요)' : 'Remote (works anywhere, needs API key)'}
                lang="bash"
                code={snippets.claudeCodeRemote}
                copied={copied === 'cc-remote'}
                onCopy={() => copy(snippets.claudeCodeRemote, 'cc-remote')}
              />
            </>
          )}

          {tab === 'desktop' && (
            <>
              <p className="connect-help">
                {ko
                  ? 'Claude Desktop, Cursor, Codex, Antigravity, Cline처럼 stdio MCP를 읽는 도구라면 같은 방식으로 붙일 수 있습니다. 각 도구의 mcp.json 또는 MCP 설정에 넣으세요.'
                  : 'Any tool that speaks stdio MCP - Claude Desktop, Cursor, Codex, Antigravity, Cline. Add the snippet to that tool\'s mcp.json or MCP settings.'}
              </p>
              <CodeBlock
                title={ko ? '로컬 MCP' : 'Local MCP'}
                lang="json"
                code={snippets.desktopLocal}
                copied={copied === 'dl'}
                onCopy={() => copy(snippets.desktopLocal, 'dl')}
              />
              <CodeBlock
                title={ko ? '원격 MCP' : 'Remote MCP'}
                lang="json"
                code={snippets.desktopRemote}
                copied={copied === 'dr'}
                onCopy={() => copy(snippets.desktopRemote, 'dr')}
              />
            </>
          )}

          {tab === 'web-agent' && (
            <>
              <p className="connect-help">
                {ko
                  ? '플랫폼·티어에 따라 3가지 방법이 있습니다. 위에서 아래로 자동화 정도가 줄어듭니다.'
                  : 'Three paths depending on your platform/tier — automation decreases from top to bottom.'}
              </p>

              {/* ── TIER 1 — BEST (auto-refresh, paid tiers) ───────── */}
              <div className="connect-tier connect-tier-best">
                <div className="connect-tier-head">
                  <span className="connect-tier-badge">{ko ? '추천 · 자동 갱신' : 'Best · Auto-refresh'}</span>
                  <span className="connect-tier-title">{ko ? '에이전트가 매 질문마다 직접 호출' : 'Agent fetches on every query'}</span>
                </div>
                <p className="connect-tier-note">
                  {ko
                    ? '※ 한 번 셋업하면 그 후엔 손댈 게 없습니다. 항상 최신.'
                    : '※ One-time setup, then it just works — always up to date.'}
                </p>

                <div className="connect-platform">
                  <div className="connect-platform-name">Claude Pro / Max → MCP Remote</div>
                  <CodeBlock
                    title={ko ? 'Claude.ai Settings → Integrations에 등록' : 'Add in Claude.ai Settings → Integrations'}
                    lang="bash"
                    code={snippets.claudeCodeRemote}
                    copied={copied === 'cc-remote-tier1'}
                    onCopy={() => copy(snippets.claudeCodeRemote, 'cc-remote-tier1')}
                    help={ko
                      ? '※ Claude Pro/Max 필요. cotext-mcp의 remote 모드를 사용합니다. 한 번 등록하면 모든 Claude.ai 채팅이 자동.'
                      : '※ Requires Claude Pro/Max. Uses cotext-mcp remote mode — register once, every Claude.ai chat gets it.'}
                  />
                </div>

                <div className="connect-platform">
                  <div className="connect-platform-name">ChatGPT Plus → Custom GPT + Actions</div>
                  <CodeBlock
                    title={ko ? 'Custom GPT의 Action 시스템 프롬프트' : 'System prompt for Custom GPT Action'}
                    lang="text"
                    code={snippets.webAgentPrompt}
                    copied={copied === 'wa-url'}
                    onCopy={() => copy(snippets.webAgentPrompt, 'wa-url')}
                    help={ko
                      ? '※ Custom GPT에서 Actions에 OpenAPI 스키마 설정 + 이 프롬프트를 시스템 프롬프트로 넣습니다. 일반 ChatGPT 채팅에는 동작하지 않음.'
                      : '※ Add an OpenAPI Action to your Custom GPT + paste this as the system prompt. Does NOT work in plain ChatGPT chat.'}
                  />
                </div>
              </div>

              {/* ── TIER 2 — GOOD (share link + Project) ───────────── */}
              <div className="connect-tier connect-tier-good">
                <div className="connect-tier-head">
                  <span className="connect-tier-badge">{ko ? '대부분의 케이스 · 반자동' : 'Most cases · Semi-auto'}</span>
                  <span className="connect-tier-title">{ko ? '공유 링크를 Project에 박아두기' : 'Pin a share-link in your Project'}</span>
                </div>
                <p className="connect-tier-note">
                  {ko
                    ? '※ private 레포 OK. ChatGPT(Browse ON)는 자주 자동 호출, Claude는 "이 URL 가져와줘"로 시작하면 호출.'
                    : '※ Works on private repos. ChatGPT (Browse ON) fetches it often automatically; Claude needs a "fetch this URL" nudge.'}
                </p>

                <div className="connect-share-section">
                  <div className="connect-share-head">
                    <span className="connect-block-title">{ko ? '공유 링크' : 'Share links'}</span>
                    <button
                      className="connect-warning-cta"
                      onClick={handleCreateShareLink}
                      disabled={creatingLink || !workspace}
                    >
                      <Plus size={12} /> {creatingLink ? '...' : (ko ? '새 링크 발급 (90일)' : 'Create link (90d)')}
                    </button>
                  </div>
                  {graphLinksLoading ? (
                    <p className="connect-key-loading">{ko ? '로딩...' : 'Loading...'}</p>
                  ) : graphLinks.length === 0 ? (
                    <p className="connect-key-empty">
                      {ko
                        ? '아직 발급된 링크가 없습니다. 위 버튼으로 생성하세요.'
                        : 'No links yet. Click above to create one.'}
                    </p>
                  ) : (
                    <div className="connect-key-list">
                      {graphLinks.map(link => {
                        const fullUrl = shareLinkUrl(link.token);
                        const expired = link.expires_at && new Date(link.expires_at) < new Date();
                        return (
                          <div key={link.id} className="connect-key-row">
                            <span className="connect-key-label">
                              {link.label || 'graph'}
                              {expired && <span style={{ color: 'var(--error)', marginLeft: 4 }}>{ko ? '· 만료' : '· expired'}</span>}
                            </span>
                            <code className="connect-key-value" style={{ fontSize: '10px' }}>{fullUrl.replace(supabaseUrl, '…')}</code>
                            <button className="connect-key-action" onClick={() => copyLinkUrl(link.id, link.token)}>
                              {copiedLinkId === link.id ? <Check size={12} weight="bold" /> : <Copy size={12} />}
                            </button>
                            <button className="connect-key-action connect-key-delete" onClick={() => handleRevokeShareLink(link.id)}>
                              <Trash size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {graphLinks.length > 0 && (
                    <p className="connect-block-help" style={{ marginTop: '8px' }}>
                      {ko
                        ? '복사한 URL을 ChatGPT/Claude Project의 인스트럭션에 다음과 같이 붙여넣으세요: '
                        : 'Paste the copied URL into your ChatGPT/Claude Project instructions like: '}
                      <code style={{ fontSize: '10px' }}>
                        {ko ? '"답변 전에 항상 이 URL의 최신 그래프를 가져오세요: <URL>"' : '"Always fetch the latest graph from this URL before answering: <URL>"'}
                      </code>
                    </p>
                  )}
                </div>
              </div>

              {/* ── TIER 3 — FALLBACK (file, universal) ────────────── */}
              <div className="connect-tier connect-tier-fallback">
                <div className="connect-tier-head">
                  <span className="connect-tier-badge">{ko ? '무료 티어·호환성 ↑ · 수동' : 'Free tier · Universal · Manual'}</span>
                  <span className="connect-tier-title">{ko ? '파일 다운로드 후 첨부/붙여넣기' : 'Download then attach / paste'}</span>
                </div>
                <p className="connect-tier-note">
                  {ko
                    ? '※ 어떤 플랫폼에서도 동작. 단, 그래프가 바뀌면 다시 다운로드해서 교체해야 합니다.'
                    : '※ Works everywhere — but you must re-download whenever the graph changes.'}
                </p>

                <button
                  className="connect-warning-cta"
                  onClick={handleDownloadGraphFile}
                  disabled={fetchingGraph || (!graph && !activeKey)}
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 14px', fontSize: '12px' }}
                >
                  {copied === 'wa-dl'
                    ? <><Check size={14} weight="bold" /> {ko ? '다운로드 완료' : 'Downloaded'}</>
                    : <><DownloadSimple size={14} /> {ko ? 'NEURAL_INDEX.md 다운로드' : 'Download NEURAL_INDEX.md'}
                      {graph && <span style={{ opacity: 0.7, fontWeight: 'normal', marginLeft: '6px' }}>
                        ({graph.nodes.length}n · {graph.clusters.length}c · {graph.edges.length}e)
                      </span>}</>}
                </button>
                <button
                  className="connect-copy"
                  onClick={handleCopyGraphPrompt}
                  disabled={fetchingGraph || (!graph && !activeKey)}
                  style={{ marginTop: '8px', fontSize: '11px' }}
                >
                  {copied === 'wa'
                    ? <><Check size={12} weight="bold" /> {ko ? '복사됨' : 'Copied'}</>
                    : <><Copy size={12} /> {ko ? '대신 텍스트로 복사 (1회용)' : 'Or copy as text (one-shot)'}</>}
                </button>
              </div>
            </>
          )}

          {tab === 'http' && (
            <>
              <p className="connect-help">
                {ko
                  ? '스크립트, n8n, Zapier, Make 같은 자동화 도구에서는 그냥 REST로 호출하면 됩니다. 필요한 건 API 키뿐입니다.'
                  : 'Plain REST for scripts, n8n, Zapier, Make, or any automation tool. You only need a key.'}
              </p>
              <CodeBlock
                title={ko ? '그래프 마크다운 가져오기' : 'Fetch graph markdown'}
                lang="bash"
                code={snippets.curlGraph}
                copied={copied === 'cg'}
                onCopy={() => copy(snippets.curlGraph, 'cg')}
              />
              <CodeBlock
                title={ko ? '클러스터 검색' : 'Search clusters'}
                lang="bash"
                code={snippets.curlSearch}
                copied={copied === 'cs'}
                onCopy={() => copy(snippets.curlSearch, 'cs')}
              />
              <CodeBlock
                title={ko ? '노드 상세 + 인접 노드' : 'Node detail + adjacent'}
                lang="bash"
                code={snippets.curlNode}
                copied={copied === 'cn'}
                onCopy={() => copy(snippets.curlNode, 'cn')}
              />
            </>
          )}
        </div>

        <div className="connect-footer">
          <p className="connect-foot-note">
            {ko
              ? '같은 MindSync를 4가지 경로로 붙일 수 있습니다: 로컬 레포 파싱, 원격 API, NEURAL_INDEX.md grounding, MCP 도구.'
              : 'Same MindSync, four paths: local repo parse, remote API, NEURAL_INDEX.md grounding, or MCP tools.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, lang, code, copied, onCopy, help }: {
  title: string;
  lang: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
  help?: string;
}) {
  return (
    <div className="connect-block">
      <div className="connect-block-head">
        <span className="connect-block-title">{title}</span>
        <span className="connect-block-lang">{lang}</span>
        <button className="connect-copy" onClick={onCopy}>
          {copied ? <><Check size={12} weight="bold" /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <pre className="connect-code"><code>{code}</code></pre>
      {help && <p className="connect-block-help">{help}</p>}
    </div>
  );
}
