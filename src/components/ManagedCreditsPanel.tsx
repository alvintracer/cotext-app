import { useCallback, useEffect, useState } from 'react';
import { Bank, ClockCounterClockwise, Coins } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  workspaceId: string;
  compact?: boolean;
  refreshKey?: number;
}

interface ManagedCreditBalance {
  workspace_id: string;
  balance_credits: number;
  reserved_credits: number;
  lifetime_used_credits: number;
  monthly_grant_credits: number;
  billing_state: string;
  updated_at: string;
}

interface ManagedCreditTransaction {
  id: string;
  delta_credits: number;
  kind: string;
  note: string | null;
  created_at: string;
}

function fmtCredits(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0);
}

export default function ManagedCreditsPanel({ workspaceId, compact = false, refreshKey = 0 }: Props) {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<ManagedCreditBalance | null>(null);
  const [transactions, setTransactions] = useState<ManagedCreditTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cancelledRef?: { current: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: balanceData, error: balanceError }, { data: txData, error: txError }] = await Promise.all([
        supabase
          .from('managed_credit_balances')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        supabase
          .from('managed_credit_transactions')
          .select('id, delta_credits, kind, note, created_at')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);
      if (balanceError) throw balanceError;
      if (txError) throw txError;
      if (!cancelledRef?.current) {
        setBalance((balanceData as ManagedCreditBalance | null) ?? null);
        setTransactions((txData as ManagedCreditTransaction[] | null) ?? []);
      }
    } catch (e) {
      if (!cancelledRef?.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const cancelled = { current: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() synchronizes panel state from Supabase
    void load(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [load, refreshKey]);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) {
        void load();
      }
    };
    window.addEventListener('mindsync:managed-credits-updated', onRefresh as EventListener);
    return () => window.removeEventListener('mindsync:managed-credits-updated', onRefresh as EventListener);
  }, [load, workspaceId]);

  return (
    <section className={`managed-credits-panel ${compact ? 'compact' : ''}`}>
      <div className="managed-credits-header">
        <div>
          <h3><Coins size={18} /> {ko ? 'Managed Credits' : 'Managed Credits'}</h3>
          <p>
            {ko
              ? 'Track B managed 추출의 잔액과 최근 사용 내역입니다. 서버 추출 성공 시 workspace 기준으로 크레딧이 차감됩니다.'
              : 'Balance and recent usage for Track B managed extraction. Successful server-side runs deduct credits per workspace.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="managed-credits-empty">{ko ? '불러오는 중...' : 'Loading...'}</div>
      ) : error ? (
        <div className="managed-credits-empty">
          {ko ? '크레딧 테이블을 읽지 못했습니다.' : 'Credit tables could not be read.'}
          <small>{error}</small>
        </div>
      ) : (
        <>
          <div className="managed-credits-grid">
            <article className="managed-credit-card">
              <span>{ko ? '잔액' : 'Balance'}</span>
              <strong>{fmtCredits(balance?.balance_credits)}</strong>
            </article>
            <article className="managed-credit-card">
              <span>{ko ? '예약' : 'Reserved'}</span>
              <strong>{fmtCredits(balance?.reserved_credits)}</strong>
            </article>
            <article className="managed-credit-card">
              <span>{ko ? '누적 사용' : 'Lifetime used'}</span>
              <strong>{fmtCredits(balance?.lifetime_used_credits)}</strong>
            </article>
            <article className="managed-credit-card">
              <span>{ko ? '상태' : 'State'}</span>
              <strong>{balance?.billing_state || 'beta'}</strong>
            </article>
          </div>

          <div className="managed-credits-meta">
            <span><Bank size={14} /> {ko ? '월 기본 제공' : 'Monthly grant'}: {fmtCredits(balance?.monthly_grant_credits)}</span>
            <span><ClockCounterClockwise size={14} /> {ko ? '최근 갱신' : 'Updated'}: {balance?.updated_at ? new Date(balance.updated_at).toLocaleString() : '-'}</span>
          </div>

          <div className="managed-credits-ledger">
            <div className="managed-credits-ledger-head">
              <strong>{ko ? '최근 내역' : 'Recent transactions'}</strong>
            </div>
            {transactions.length === 0 ? (
              <div className="managed-credits-empty">{ko ? '아직 기록이 없습니다.' : 'No transactions yet.'}</div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="managed-credit-tx">
                  <div>
                    <strong>{tx.kind}</strong>
                    <p>{tx.note || (ko ? '메모 없음' : 'No note')}</p>
                  </div>
                  <div className={`managed-credit-delta ${tx.delta_credits >= 0 ? 'plus' : 'minus'}`}>
                    {tx.delta_credits >= 0 ? '+' : ''}{fmtCredits(tx.delta_credits)}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
