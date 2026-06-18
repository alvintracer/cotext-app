import { useMemo, useState } from 'react';
import {
  X, Copy, Check, Terminal, CodeSimple, Robot, ChatText, Link as LinkIcon,
} from '@phosphor-icons/react';

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
  onOpenApiKeys?: () => void;
  apiKey?: string;
  apiUrl?: string;
  language?: 'ko' | 'en';
}

type TabId = 'claude-code' | 'desktop' | 'web-agent' | 'http';

const DEFAULT_API_URL =
  (import.meta.env.VITE_COTEXT_API_URL as string | undefined)
  ?? 'https://YOUR-PROJECT.supabase.co/functions/v1/context-api';

export default function ConnectMindSyncModal({
  open,
  onClose,
  workspace,
  onOpenApiKeys,
  apiKey,
  apiUrl,
  language = 'en',
}: Props) {
  const ko = language === 'ko';
  const [tab, setTab] = useState<TabId>('claude-code');
  const [copied, setCopied] = useState<string | null>(null);

  const url = apiUrl ?? DEFAULT_API_URL;
  const repoLabel = workspace ? `${workspace.github_owner}/${workspace.github_repo}` : 'OWNER/REPO';
  const keyLabel = apiKey || 'ctx_xxxxxxxx';

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
          {!apiKey && tab !== 'claude-code' && (
            <div className="connect-warning">
              <div className="connect-warning-row">
                <span>
                  {ko
                    ? '아래의 원격 연결 방식은 Cotext API Key가 필요합니다. 워크스페이스의 API Keys 패널에서 키를 만든 뒤 다시 열면 실키 값으로 자동 채워집니다.'
                    : 'The remote options below need a Cotext API key. Create one in the workspace API Keys panel and reopen this dialog to auto-fill the snippets.'}
                </span>
                {onOpenApiKeys && workspace && (
                  <button
                    className="connect-warning-cta"
                    onClick={() => {
                      onClose();
                      onOpenApiKeys();
                    }}
                  >
                    {ko ? 'API Keys 열기' : 'Open API Keys'}
                  </button>
                )}
              </div>
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
