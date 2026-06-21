import { useCallback, useEffect, useState } from 'react';
import { ArrowSquareOut, Bank, ClockCounterClockwise, Coins, SpinnerGap } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase/client';
import { useLanguage } from '../contexts/LanguageContext';
import { MANAGED_CREDIT_PACKS } from '../lib/billing/packs';
import { managedBillingApi } from '../lib/supabase/functions';

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
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

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

  const handleBuy = useCallback(async (packId: string) => {
    setPurchasingPackId(packId);
    setPurchaseError(null);
    try {
      const current = new URL(window.location.href);
      const successUrl = new URL(current.toString());
      successUrl.searchParams.set('billing', 'success');
      const cancelUrl = new URL(current.toString());
      cancelUrl.searchParams.set('billing', 'cancel');

      const invoice = await managedBillingApi.createInvoice(workspaceId, packId, {
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
      });

      window.location.assign(invoice.invoiceUrl);
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : String(e));
    } finally {
      setPurchasingPackId(null);
    }
  }, [workspaceId]);

  return (
    <section className={`managed-credits-panel ${compact ? 'compact' : ''}`}>
      <div className="managed-credits-header">
        <div>
          <h3><Coins size={18} /> {ko ? 'Managed Credits' : 'Managed Credits'}</h3>
          <p>
            {ko
              ? '관리형 모델 사용량과 최근 크레딧 변동 내역입니다. 충전은 NOWPayments 결제 페이지에서 진행됩니다.'
              : 'Balance and recent managed-credit activity. Top-ups open a NOWPayments hosted checkout page.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="managed-credits-empty">{ko ? '불러오는 중...' : 'Loading...'}</div>
      ) : error ? (
        <div className="managed-credits-empty">
          {ko ? '크레딧 정보를 읽지 못했습니다.' : 'Credit tables could not be read.'}
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

          <div className="managed-credit-packs">
            <div className="managed-credit-packs-head">
              <strong>{ko ? '크레딧 충전' : 'Buy credits'}</strong>
              <span>{ko ? '카드 또는 크립토 결제를 위해 NOWPayments로 이동합니다.' : 'Redirects to NOWPayments for card or crypto checkout.'}</span>
            </div>
            <div className="managed-credit-pack-grid">
              {MANAGED_CREDIT_PACKS.map((pack) => (
                <article key={pack.id} className="managed-credit-pack">
                  <div className="managed-credit-pack-top">
                    <strong>{pack.label}</strong>
                    <span>{fmtCredits(pack.credits)} credits</span>
                  </div>
                  <p>{pack.description}</p>
                  <button
                    className="btn btn-primary btn-sm managed-credit-buy"
                    onClick={() => void handleBuy(pack.id)}
                    disabled={purchasingPackId !== null}
                  >
                    {purchasingPackId === pack.id ? (
                      <><SpinnerGap size={14} className="spin" /> {ko ? '이동 중...' : 'Opening...'}</>
                    ) : (
                      <><ArrowSquareOut size={14} /> ${pack.priceAmount}</>
                    )}
                  </button>
                </article>
              ))}
            </div>
            {purchaseError && (
              <div className="managed-credits-empty">
                {ko ? '결제 페이지를 열지 못했습니다.' : 'Could not open the payment page.'}
                <small>{purchaseError}</small>
              </div>
            )}
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
