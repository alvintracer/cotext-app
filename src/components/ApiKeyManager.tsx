import { useState, useEffect, useCallback } from 'react';
import { Key, Trash, Plus, Copy, Check, Eye, EyeSlash } from '@phosphor-icons/react';
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
}

export default function ApiKeyManager({ workspaceId }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

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

  const maskKey = (key: string) => key.substring(0, 8) + '•'.repeat(20) + key.substring(key.length - 4);

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
                  onClick={() => handleCopy(k.key, k.id)}
                  title="Copy"
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

      <div className="api-key-usage">
        <h4>{t('apiKey.usage')}</h4>
        <pre className="api-key-code">{`# List rooms
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${window.location.origin.replace('localhost:5173', 'YOUR_SUPABASE_URL')}/functions/v1/context-api/rooms

# Get room content
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  .../context-api/rooms/YOUR_ROOM_PATH

# Append a block
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "My note", "source": "agent"}' \\
  .../context-api/rooms/YOUR_ROOM_PATH/append`}</pre>
      </div>
    </div>
  );
}
