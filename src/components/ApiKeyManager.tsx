import { useState, useEffect, useCallback } from 'react';
import { Key, Trash, Plus, Copy, Check, Eye, EyeSlash, Robot, ChatCircleDots, X } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ApiKey {
  id: string;
  key: string;
  label: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Props {
  workspaceId: string;
  repoOwner?: string;
  repoName?: string;
}

type Platform = 'chatgpt' | 'claude-web' | 'gemini' | 'antigravity' | 'claude-desktop' | 'cursor' | 'custom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

function txt(ko: boolean, korean: string, english: string): string {
  return ko ? korean : english;
}

function generatePrompt(platform: Platform, apiKey: string, repoOwner: string, repoName: string): string {
  const baseUrl = `${SUPABASE_URL}/functions/v1/context-api`;

  if (['chatgpt', 'claude-web', 'gemini'].includes(platform)) {
    const agentName = platform === 'chatgpt'
      ? 'chatgpt'
      : platform === 'claude-web'
        ? 'claude'
        : platform === 'gemini'
          ? 'gemini'
          : 'antigravity';

    return `You have access to a Cotext context pool for the project "${repoOwner}/${repoName}".

## How to read context
Use this API to fetch my notes and context:

\`\`\`
GET ${baseUrl}/rooms
Authorization: Bearer ${apiKey}
\`\`\`

To read a specific room:
\`\`\`
GET ${baseUrl}/rooms/{ROOM_PATH}
Authorization: Bearer ${apiKey}
\`\`\`

To get a filtered Context Pack (human-only notes):
\`\`\`
GET ${baseUrl}/pack/{ROOM_PATH}?source=me
Authorization: Bearer ${apiKey}
\`\`\`

## How to write back
When you produce something worth saving, append it:
\`\`\`
POST ${baseUrl}/rooms/{ROOM_PATH}/append
Authorization: Bearer ${apiKey}
Content-Type: application/json

{"content": "YOUR_MARKDOWN_HERE", "source": "${agentName}"}
\`\`\`

## Rules
- Always read context FIRST before answering project-related questions.
- When writing back, use source: "${agentName}".
- My notes (source: me) are primary. Don't summarize or rewrite them.
- Use markdown format for all content.
`;
  }

  if (platform === 'claude-desktop' || platform === 'cursor' || platform === 'antigravity') {
    return JSON.stringify({
      mcpServers: {
        cotext: {
          command: 'npx',
          args: ['-y', 'cotext-mcp@latest'],
          env: {
            COTEXT_API_KEY: apiKey,
            COTEXT_API_URL: baseUrl,
          },
        },
      },
    }, null, 2);
  }

  return `Cotext API Endpoint: ${baseUrl}
API Key: ${apiKey}
Repository: ${repoOwner}/${repoName}

Endpoints:
  GET  /rooms              -> List all rooms
  GET  /rooms/:path        -> Get room content
  GET  /search?q=...       -> Search across rooms
  GET  /pack/:path         -> Context Pack (me-only)
  POST /rooms/:path/append -> Append block (source required)
  GET  /guide              -> COTEXT_GUIDE.md

Header:
  Authorization: Bearer ${apiKey}
`;
}

interface PlatformGroup {
  label: string;
  items: { id: Platform; label: string; desc: string }[];
}

function buildPlatformGroups(ko: boolean): PlatformGroup[] {
  return [
    {
      label: txt(ko, '웹 에이전트', 'Web agents'),
      items: [
        { id: 'chatgpt', label: 'ChatGPT', desc: txt(ko, '프롬프트 붙여넣기', 'Paste prompt') },
        { id: 'claude-web', label: 'Claude.ai', desc: txt(ko, '프롬프트 붙여넣기', 'Paste prompt') },
        { id: 'gemini', label: 'Gemini', desc: txt(ko, '프롬프트 붙여넣기', 'Paste prompt') },
      ],
    },
    {
      label: txt(ko, 'IDE / MCP', 'IDE / MCP'),
      items: [
        { id: 'claude-desktop', label: 'Claude Desktop', desc: txt(ko, 'MCP 설정', 'MCP config') },
        { id: 'cursor', label: 'Cursor / Windsurf', desc: txt(ko, 'MCP 설정', 'MCP config') },
        { id: 'antigravity', label: 'Antigravity', desc: txt(ko, 'MCP 설정', 'MCP config') },
        { id: 'custom', label: txt(ko, '직접 연결', 'Custom'), desc: txt(ko, 'API 정보', 'API info') },
      ],
    },
  ];
}

export default function ApiKeyManager({ workspaceId, repoOwner = '', repoName = '' }: Props) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const ko = language === 'ko';
  const platformGroups = buildPlatformGroups(ko);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [connectModal, setConnectModal] = useState<{ keyId: string; key: string } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('chatgpt');
  const [promptCopied, setPromptCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys(data || []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches external workspace keys on mount/change
    fetchKeys();
  }, [fetchKeys]);

  useEffect(() => {
    if (window.location.hash !== '#api-keys') return;
    const el = document.getElementById('api-keys');
    if (!el) return;
    window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    try {
      await supabase.from('api_keys').insert({
        workspace_id: workspaceId,
        user_id: user.id,
        label: newKeyLabel || 'default',
        scopes: ['read', 'write'],
      });
      setNewKeyLabel('');
      await fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    await fetchKeys();
  };

  const handleCopy = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPrompt = async () => {
    if (!connectModal) return;
    const prompt = generatePrompt(selectedPlatform, connectModal.key, repoOwner, repoName);
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const maskKey = (key: string) => `${key.substring(0, 8)}${'.'.repeat(20)}${key.substring(key.length - 4)}`;

  const isMcpPlatform = ['claude-desktop', 'cursor', 'antigravity'].includes(selectedPlatform);
  const isWebPlatform = ['chatgpt', 'claude-web', 'gemini'].includes(selectedPlatform);

  if (loading) return <div className="spinner" />;

  return (
    <div className="api-key-manager" id="api-keys">
      <div className="api-key-header">
        <h3><Key size={18} /> {t('apiKey.title')}</h3>
        <p className="api-key-desc">{t('apiKey.desc')}</p>
      </div>

      <div className="api-key-flow-note">
        <strong>{txt(ko, 'MindSync 에이전트 연결 흐름', 'MindSync agent connection flow')}</strong>
        <span>
          {txt(
            ko,
            '1. 워크스페이스 키를 만듭니다. 2. 해당 키의 로봇 버튼을 누릅니다. 3. MCP 설정이나 프롬프트를 복사해 에이전트에 붙입니다.',
            '1. Create a workspace key. 2. Click the robot button on that key. 3. Copy the MCP config or prompt into your agent.',
          )}
        </span>
      </div>

      <div className="api-key-create">
        <input
          type="text"
          value={newKeyLabel}
          onChange={(e) => setNewKeyLabel(e.target.value)}
          placeholder={t('apiKey.labelPlaceholder')}
          className="api-key-input"
        />
        <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
          <Plus size={14} /> {t('apiKey.create')}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="api-key-empty">{t('apiKey.empty')}</p>
      ) : (
        <div className="api-key-list">
          {keys.map((k) => (
            <div key={k.id} className="api-key-item">
              <div className="api-key-info">
                <span className="api-key-label">{k.label}</span>
                <code className="api-key-value">
                  {revealedId === k.id ? k.key : maskKey(k.key)}
                </code>
                <span className="api-key-meta">
                  {k.last_used_at
                    ? `${txt(ko, '마지막 사용', 'Last used')}: ${new Date(k.last_used_at).toLocaleDateString()}`
                    : txt(ko, '아직 사용되지 않음', 'Never used')}
                </span>
              </div>
              <div className="api-key-actions">
                <button
                  className="icon-button"
                  onClick={() => setRevealedId(revealedId === k.id ? null : k.id)}
                  title={revealedId === k.id ? txt(ko, '숨기기', 'Hide') : txt(ko, '표시', 'Reveal')}
                >
                  {revealedId === k.id ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
                <button
                  className="icon-button connect-ai-btn"
                  onClick={() => setConnectModal({ keyId: k.id, key: k.key })}
                  title={txt(ko, 'MindSync 연결', 'Connect MindSync')}
                >
                  <Robot size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => handleCopy(k.key, k.id)}
                  title={txt(ko, '키 복사', 'Copy key')}
                >
                  {copiedId === k.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  className="icon-button danger"
                  onClick={() => handleRevoke(k.id)}
                  title={txt(ko, '폐기', 'Revoke')}
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {connectModal && (
        <div className="modal-overlay" onClick={() => { setConnectModal(null); setPromptCopied(false); }}>
          <div className="modal-content connect-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><ChatCircleDots size={18} /> {txt(ko, '에이전트에 MindSync 연결', 'Connect MindSync with your agent')}</h3>
              <button className="icon-button" onClick={() => { setConnectModal(null); setPromptCopied(false); }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="connect-desc">
                {txt(
                  ko,
                  '연결할 에이전트를 고르고, 생성된 설정이나 프롬프트를 복사해 해당 도구에 붙이면 됩니다.',
                  'Pick an agent, copy the generated config or prompt, and paste it into that tool.',
                )}
              </p>

              {platformGroups.map((group) => (
                <div key={group.label} className="connect-group">
                  <span className="connect-group-label">{group.label}</span>
                  <div className="connect-platforms">
                    {group.items.map((p) => (
                      <button
                        key={p.id}
                        className={`connect-platform-btn ${selectedPlatform === p.id ? 'active' : ''}`}
                        onClick={() => { setSelectedPlatform(p.id); setPromptCopied(false); }}
                      >
                        <span className="connect-platform-label">{p.label}</span>
                        <span className="connect-platform-desc">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="connect-preview">
                <div className="connect-preview-header">
                  <span>{isMcpPlatform ? 'MCP JSON' : selectedPlatform === 'custom' ? 'API Info' : txt(ko, '프롬프트', 'Prompt')}</span>
                  <button
                    className={`btn btn-primary btn-sm ${promptCopied ? 'copied' : ''}`}
                    onClick={handleCopyPrompt}
                  >
                    {promptCopied
                      ? <><Check size={14} /> {txt(ko, '복사됨', 'Copied')}</>
                      : <><Copy size={14} /> {txt(ko, '복사', 'Copy')}</>}
                  </button>
                </div>
                <pre className="connect-preview-code">
                  {generatePrompt(selectedPlatform, connectModal.key, repoOwner, repoName)}
                </pre>
              </div>

              {isWebPlatform && (
                <p className="connect-hint">
                  {txt(
                    ko,
                    '이 프롬프트를 웹 에이전트에 붙이면 Cotext API를 기준 컨텍스트로 사용하도록 지시합니다.',
                    'Paste this prompt into your web agent. It tells the model to use the Cotext API as its source of truth.',
                  )}
                </p>
              )}
              {isMcpPlatform && (
                <p className="connect-hint">
                  {txt(
                    ko,
                    '이 JSON을 도구의 MCP 설정에 넣으면 cotext-mcp가 이 API 키로 원격 연결됩니다.',
                    'Add this JSON to the tool MCP settings. cotext-mcp will connect in remote mode with this API key.',
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
