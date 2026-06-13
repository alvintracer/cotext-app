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

type Platform = 'chatgpt' | 'claude-web' | 'claude-desktop' | 'cursor' | 'custom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

function generatePrompt(platform: Platform, apiKey: string, repoOwner: string, repoName: string): string {
  const baseUrl = `${SUPABASE_URL}/functions/v1/context-api`;

  if (platform === 'chatgpt' || platform === 'claude-web') {
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

{"content": "YOUR_MARKDOWN_HERE", "source": "agent"}
\`\`\`

## Rules
- Always read context FIRST before answering project-related questions.
- When writing back, use source: "agent" (or your specific name like "chatgpt" or "claude").
- My notes (source: me) are primary. Don't summarize or rewrite them.
- Use markdown format for all content.
`;
  }

  if (platform === 'claude-desktop') {
    return JSON.stringify({
      "mcpServers": {
        "cotext": {
          "command": "npx",
          "args": ["-y", "cotext-mcp"],
          "env": {
            "COTEXT_API_KEY": apiKey,
            "COTEXT_API_URL": baseUrl
          }
        }
      }
    }, null, 2);
  }

  if (platform === 'cursor') {
    return JSON.stringify({
      "mcpServers": {
        "cotext": {
          "command": "npx",
          "args": ["-y", "cotext-mcp"]
        }
      }
    }, null, 2);
  }

  // custom
  return `Cotext API Endpoint: ${baseUrl}
API Key: ${apiKey}
Repository: ${repoOwner}/${repoName}

Endpoints:
  GET  /rooms              → List all rooms
  GET  /rooms/:path        → Get room content
  GET  /search?q=...       → Search across rooms
  GET  /pack/:path         → Context Pack (me-only)
  POST /rooms/:path/append → Append block (source required)
  GET  /guide              → COTEXT_GUIDE.md
`;
}

export default function ApiKeyManager({ workspaceId, repoOwner = '', repoName = '' }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
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

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

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

  const maskKey = (key: string) => key.substring(0, 8) + '•'.repeat(20) + key.substring(key.length - 4);

  const platforms: { id: Platform; label: string; desc: string; icon: string }[] = [
    { id: 'chatgpt', label: 'ChatGPT', desc: '대화에 붙여넣기', icon: '🤖' },
    { id: 'claude-web', label: 'Claude.ai', desc: '대화에 붙여넣기', icon: '🟠' },
    { id: 'claude-desktop', label: 'Claude Desktop', desc: 'MCP 설정 JSON', icon: '💻' },
    { id: 'cursor', label: 'Cursor / Windsurf', desc: 'MCP 설정 JSON', icon: '⚡' },
    { id: 'custom', label: '직접 설정', desc: 'API 정보 복사', icon: '🔧' },
  ];

  if (loading) return <div className="spinner" />;

  return (
    <div className="api-key-manager">
      <div className="api-key-header">
        <h3><Key size={18} /> {t('apiKey.title')}</h3>
        <p className="api-key-desc">{t('apiKey.desc')}</p>
      </div>

      <div className="api-key-create">
        <input
          type="text"
          value={newKeyLabel}
          onChange={e => setNewKeyLabel(e.target.value)}
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
          {keys.map(k => (
            <div key={k.id} className="api-key-item">
              <div className="api-key-info">
                <span className="api-key-label">{k.label}</span>
                <code className="api-key-value">
                  {revealedId === k.id ? k.key : maskKey(k.key)}
                </code>
                <span className="api-key-meta">
                  {k.last_used_at ? `Last used: ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                </span>
              </div>
              <div className="api-key-actions">
                <button
                  className="icon-button"
                  onClick={() => setRevealedId(revealedId === k.id ? null : k.id)}
                  title={revealedId === k.id ? 'Hide' : 'Reveal'}
                >
                  {revealedId === k.id ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
                <button
                  className="icon-button"
                  onClick={() => setConnectModal({ keyId: k.id, key: k.key })}
                  title="Connect to AI"
                >
                  <Robot size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => handleCopy(k.key, k.id)}
                  title="Copy key"
                >
                  {copiedId === k.id ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button
                  className="icon-button danger"
                  onClick={() => handleRevoke(k.id)}
                  title="Revoke"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect to AI Modal */}
      {connectModal && (
        <div className="modal-overlay" onClick={() => { setConnectModal(null); setPromptCopied(false); }}>
          <div className="modal-content connect-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><ChatCircleDots size={18} /> AI에 연결</h3>
              <button className="icon-button" onClick={() => { setConnectModal(null); setPromptCopied(false); }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="connect-desc">
                어떤 AI에 연결할지 선택하세요. 복사된 내용을 해당 AI에 붙여넣으면 바로 사용할 수 있습니다.
              </p>

              <div className="connect-platforms">
                {platforms.map(p => (
                  <button
                    key={p.id}
                    className={`connect-platform-btn ${selectedPlatform === p.id ? 'active' : ''}`}
                    onClick={() => { setSelectedPlatform(p.id); setPromptCopied(false); }}
                  >
                    <span className="connect-platform-icon">{p.icon}</span>
                    <span className="connect-platform-label">{p.label}</span>
                    <span className="connect-platform-desc">{p.desc}</span>
                  </button>
                ))}
              </div>

              <div className="connect-preview">
                <div className="connect-preview-header">
                  <span>{selectedPlatform === 'claude-desktop' || selectedPlatform === 'cursor' ? '설정 JSON' : '프롬프트'}</span>
                  <button
                    className={`btn btn-primary btn-sm ${promptCopied ? 'copied' : ''}`}
                    onClick={handleCopyPrompt}
                  >
                    {promptCopied ? <><Check size={14} /> 복사됨!</> : <><Copy size={14} /> 복사</>}
                  </button>
                </div>
                <pre className="connect-preview-code">
                  {generatePrompt(selectedPlatform, connectModal.key, repoOwner, repoName)}
                </pre>
              </div>

              {(selectedPlatform === 'chatgpt' || selectedPlatform === 'claude-web') && (
                <p className="connect-hint">
                  💡 위 프롬프트를 복사해서 ChatGPT/Claude 대화창에 붙여넣으세요. AI가 자동으로 API를 사용합니다.
                </p>
              )}
              {selectedPlatform === 'claude-desktop' && (
                <p className="connect-hint">
                  💡 <code>claude_desktop_config.json</code>에 위 JSON을 추가하세요.
                </p>
              )}
              {selectedPlatform === 'cursor' && (
                <p className="connect-hint">
                  💡 <code>.cursor/mcp.json</code>에 위 JSON을 추가하세요. 로컬 repo clone이 필요합니다.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
