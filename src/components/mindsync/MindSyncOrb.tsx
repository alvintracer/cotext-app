import { Brain, Check, Warning, Spinner } from '@phosphor-icons/react';
import ProgressRing from './ProgressRing';

interface MindSyncOrbProps {
  state: 'idle' | 'uploading' | 'generating' | 'complete' | 'error';
  progress?: number;
  stats?: { nodes: number; clusters: number; edges: number };
  message?: string;
  ko?: boolean;
}

const stateIcons = {
  idle: Brain,
  uploading: Spinner,
  generating: Spinner,
  complete: Check,
  error: Warning,
} as const;

const defaultMessages: Record<MindSyncOrbProps['state'], [string, string]> = {
  idle: ['대기 중', 'Ready'],
  uploading: ['업로드 중…', 'Uploading…'],
  generating: ['생성 중…', 'Generating…'],
  complete: ['완료', 'Complete'],
  error: ['오류 발생', 'Error'],
};

function MindSyncOrb({
  state,
  progress = 0,
  stats,
  message,
  ko = false,
}: MindSyncOrbProps) {
  const Icon = stateIcons[state];
  const label = message ?? (ko ? defaultMessages[state][0] : defaultMessages[state][1]);

  const iconWeight = state === 'idle' ? 'duotone' : 'bold';
  const iconSize = 32;

  const showRing = state === 'generating' || state === 'complete';

  return (
    <div className="ms-orb-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className={`ms-orb ms-orb--${state}`}>
        {/* Background glow */}
        <div className="ms-orb-glow" />

        {/* Progress ring — visible during generating & complete */}
        {showRing && (
          <div className="ms-orb-ring">
            <ProgressRing
              percent={state === 'complete' ? 100 : progress}
              size={200}
              strokeWidth={3}
              showPercent={false}
            />
          </div>
        )}

        {/* Glass core sphere */}
        <div className="ms-orb-core">
          <span
            className="ms-orb-core-icon"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon size={iconSize} weight={iconWeight} />
          </span>
        </div>

        {/* Status label below orb */}
        <span className="ms-orb-label">{label}</span>
      </div>

      {/* Stats shown after completion */}
      {state === 'complete' && stats && (
        <div className="ms-orb-stats">
          <div className="ms-orb-stat-item">
            <span className="ms-orb-stat-value ms-stat-value--animate">
              {stats.nodes}
            </span>
            <span className="ms-orb-stat-label">
              {ko ? '노드' : 'Nodes'}
            </span>
          </div>
          <div className="ms-orb-stat-item">
            <span className="ms-orb-stat-value ms-stat-value--animate" style={{ animationDelay: '0.1s' }}>
              {stats.clusters}
            </span>
            <span className="ms-orb-stat-label">
              {ko ? '클러스터' : 'Clusters'}
            </span>
          </div>
          <div className="ms-orb-stat-item">
            <span className="ms-orb-stat-value ms-stat-value--animate" style={{ animationDelay: '0.2s' }}>
              {stats.edges}
            </span>
            <span className="ms-orb-stat-label">
              {ko ? '엣지' : 'Edges'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MindSyncOrb;
