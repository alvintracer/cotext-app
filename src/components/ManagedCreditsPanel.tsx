import { useEffect, useState } from 'react';
import { Bank, ClockCounterClockwise, Coins } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  workspaceId: string;
  compact?: boolean;
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

export default function ManagedCreditsPanel({ workspaceId, compact = false }: Props) {
  const { language } = useLanguage();
  const ko = language === 'ko';
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<ManagedCreditBalance | null>(null);
  const [transactions, setTransactions] = useState<ManagedCreditTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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
        if (!cancelled) {
          setBalance((balanceData as ManagedCreditBalance | null) ?? null);
          setTransactions((txData as ManagedCreditTransaction[] | null) ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <section className={`managed-credits-panel ${compact ? 'compact' : ''}`}>
      <div className="managed-credits-header">
        <div>
          <h3><Coins size={18} /> {ko ? 'Managed Credits' : 'Managed Credits'}</h3>
          <p>
            {ko
              ? 'Track B 잔액과 최근 사용 내역입니다. 현재는 beta-unmetered 상태라 자동 차감은 아직 없습니다.'
              : 'Track B balance and recent usage. Current state is beta-unmetered, so no automatic deduction happens yet.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="managed-credits-empty">{ko ? '불러오는 중...' : 'Loading...'}</div>
      ) : error ? (
        <div className="managed-credits-empty">
          {ko ? '크레딧 테이블이 아직 배포되지 않았거나 접근할 수 없습니다.' : 'Credit tables are not deployed yet or could not be read.'}
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
              <span>{ko ? '예약됨' : 'Reserved'}</span>
              <strong>{fmtCredits(balance?.reserved_credits)}</strong>
            </article>
            <article className="managed-credit-card">
              <span>{ko ? '누적 사용' : 'Lifetime used'}</span>
              <strong>{fmtCredits(balance?.lifetime_used_credits)}</strong>
            </article>
            <article className="managed-credit-card">
              <span>{ko ? '상태' : 'State'}</span>
              <strong>{balance?.billing_state || 'beta-unmetered'}</strong>
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
