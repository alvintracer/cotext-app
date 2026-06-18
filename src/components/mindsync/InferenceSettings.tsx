import { useState } from 'react';
import { Cpu, Key, Lightning } from '@phosphor-icons/react';
import { PROVIDERS, getProvider, type ProviderId } from '../../lib/agent/models';

interface InferenceSettingsProps {
  ko: boolean;
  trackMode: 'byok' | 'managed';
  onTrackChange: (mode: 'byok' | 'managed') => void;
  // BYOK-specific
  providerId: ProviderId;
  onProviderChange: (id: ProviderId) => void;
  model: string;
  onModelChange: (model: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  hasKey: boolean;
  onSaveKey: () => void;
  provider: ReturnType<typeof getProvider>;
  useLlm: boolean;
  onUseLlmChange: (val: boolean) => void;
  llmReady: boolean;
  // Managed-specific
  managedInfo?: {
    providerId: string;
    model: string;
    billingMode: string;
    chargedCredits: number;
    requestChars: number;
    chargeSkipped?: boolean;
    chargeError?: string | null;
  } | null;
  managedCreditsSlot?: React.ReactNode;
}

export default function InferenceSettings({
  ko,
  trackMode,
  onTrackChange,
  providerId,
  onProviderChange,
  model,
  onModelChange,
  apiKey,
  onApiKeyChange,
  hasKey,
  onSaveKey,
  provider,
  useLlm,
  onUseLlmChange,
  llmReady,
  managedInfo,
  managedCreditsSlot,
}: InferenceSettingsProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <section className="ms-inference ms-glass-card">
      <div className="ms-inference-header">
        <h3>
          <Cpu size={16} />
          {ko ? '분석 방식' : 'Analysis mode'}
        </h3>
      </div>

      {/* Track toggle */}
      <div className="ms-track-control">
        <div
          className="ms-track-slider"
          style={{
            transform: trackMode === 'managed' ? 'translateX(100%)' : 'translateX(0)',
          }}
        />
        <button
          className={`ms-track-btn${trackMode === 'byok' ? ' active' : ''}`}
          onClick={() => onTrackChange('byok')}
          type="button"
        >
          <Key size={14} />
          {ko ? '내 API 키' : 'My API Key'}
        </button>
        <button
          className={`ms-track-btn${trackMode === 'managed' ? ' active' : ''}`}
          onClick={() => onTrackChange('managed')}
          type="button"
        >
          <Lightning size={14} />
          {ko ? 'Cotext 모델' : 'Cotext Model'}
        </button>
      </div>

      {/* BYOK section */}
      {trackMode === 'byok' && (
        <div className="ms-inference-byok">
          <div className="ms-inference-row">
            <select
              className="ms-select"
              value={providerId}
              onChange={(e) => onProviderChange(e.target.value as ProviderId)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              className="ms-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {provider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowKey(!showKey)}
              type="button"
            >
              {hasKey
                ? ko ? '키 변경' : 'Change key'
                : ko ? '키 추가' : 'Add key'}
            </button>

            <span className={`ms-key-status${hasKey ? ' ok' : ' missing'}`}>
              {hasKey
                ? ko ? '등록됨' : 'Saved'
                : ko ? '미등록' : 'Missing'}
            </span>
          </div>

          {/* Expandable key input */}
          {showKey && (
            <div className="ms-key-input">
              <input
                type="password"
                className="ms-input"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={provider.keyLabel}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onSaveKey();
                  setShowKey(false);
                }}
                type="button"
              >
                {ko ? '저장' : 'Save'}
              </button>
              {provider.keyUrl && (
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ms-key-link"
                >
                  {ko ? '키 발급' : 'Get key'}
                </a>
              )}
            </div>
          )}

          <label className="ms-toggle">
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => onUseLlmChange(e.target.checked)}
            />
            <span>{ko ? 'AI 분석 사용' : 'Use AI analysis'}</span>
            {useLlm && !llmReady && (
              <em>
                {ko ? '— API 키가 필요합니다' : '— API key required'}
              </em>
            )}
          </label>

          <p className="ms-note">
            {ko
              ? 'API 키는 이 브라우저에만 저장됩니다. 서버를 거치지 않고 직접 AI에 연결합니다.'
              : 'Your API key stays in this browser only. Connects directly to the AI without going through our servers.'}
          </p>
        </div>
      )}

      {/* Managed section */}
      {trackMode === 'managed' && (
        <div className="ms-inference-managed">
          <p className="ms-note">
            {ko
              ? 'Cotext가 제공하는 AI 모델로 분석합니다. 워크스페이스 크레딧이 차감됩니다.'
              : "Analysis runs on Cotext's AI models. Workspace credits will be deducted."}
          </p>

          {managedInfo && (
            <div className="ms-managed-info">
              <span className="ms-managed-detail">
                {managedInfo.providerId} / {managedInfo.model}
              </span>
              {managedInfo.chargeError && (
                <span className="ms-managed-error">
                  {managedInfo.chargeError}
                </span>
              )}
            </div>
          )}

          {managedCreditsSlot}
        </div>
      )}
    </section>
  );
}
