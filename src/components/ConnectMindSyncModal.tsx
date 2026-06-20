import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  X, Copy, Check, Terminal, CodeSimple, Robot, ChatText, Link as LinkIcon,
  Key, Plus, Eye, EyeSlash, Trash,
} from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';

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

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    });
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
                  ? 'ChatGPT, Gemini, Perplexity처럼 네이티브 MCP가 없는 웹 에이전트에는 아래 시스템 프롬프트를 넣으세요. 에이전트가 HTTP로 MindSync 그래프를 직접 가져오도록 지시합니다.'
                  : 'For ChatGPT, Gemini, or Perplexity without native MCP, paste this system prompt so the agent fetches MindSync over HTTP.'}
              </p>
              <CodeBlock
                title={ko ? '시스템 프롬프트' : 'System prompt'}
                lang="text"
                code={snippets.webAgentPrompt}
                copied={copied === 'wa'}
                onCopy={() => copy(snippets.webAgentPrompt, 'wa')}
              />
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
