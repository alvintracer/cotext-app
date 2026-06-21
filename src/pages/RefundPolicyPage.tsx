import MarketingShell from '../components/site/MarketingShell';
import { useLanguage } from '../contexts/LanguageContext';

const COPY = {
  en: {
    eyebrow: 'Refund Policy',
    title: 'Cotext Refund Policy',
    description: 'The practical rules for prepaid managed credit packs purchased for Cotext workspaces.',
    sections: [
      {
        title: '1. What is being purchased',
        body: [
          'Managed credit packs are prepaid digital balances for Cotext-managed AI usage within a specific workspace.',
          'They are not bank deposits, not cash equivalents, and not transferable between unrelated accounts unless Cotext explicitly supports that in-product later.',
        ],
      },
      {
        title: '2. General refund rule',
        body: [
          'Because credits are digital and can be consumed immediately after purchase, completed purchases are generally non-refundable once any of the purchased balance has been used.',
        ],
      },
      {
        title: '3. Possible refund review cases',
        body: [
          'We may review refund requests when a duplicate payment occurred, the purchased credits were not applied correctly, or the purchased pack remains entirely unused and the request is made promptly after payment.',
          'Any exception remains discretionary and may depend on payment-rail constraints, fraud checks, and whether the order can be safely reversed.',
        ],
      },
      {
        title: '4. Used or partially used credits',
        body: [
          'If purchased credits have already been consumed in managed extraction, managed agent chat, or related workspace usage, that portion is not refundable.',
        ],
      },
      {
        title: '5. Payment rail limitations',
        body: [
          'Cotext currently uses NOWPayments hosted checkout. Card, crypto, settlement timing, and reversal behavior may depend on NOWPayments and any upstream payment method involved.',
        ],
      },
      {
        title: '6. Abuse and chargebacks',
        body: [
          'Fraud, abuse, or chargeback behavior may lead to refund denial, credit reversal, workspace suspension, or account termination.',
        ],
      },
    ],
  },
  ko: {
    eyebrow: '환불정책',
    title: 'Cotext 환불정책',
    description: 'Cotext 워크스페이스용 선불 관리형 크레딧 팩에 적용되는 현실적인 환불 기준입니다.',
    sections: [
      {
        title: '1. 무엇을 구매하는가',
        body: [
          '관리형 크레딧 팩은 특정 워크스페이스에서 Cotext 관리형 AI를 쓰기 위한 선불형 디지털 잔액입니다.',
          '이는 예금이나 현금성 자산이 아니며, Cotext가 추후 제품 내에서 명시적으로 지원하지 않는 한 무관한 계정 간 자유 이전 대상도 아닙니다.',
        ],
      },
      {
        title: '2. 기본 환불 원칙',
        body: [
          '크레딧은 디지털 자산이며 구매 직후 바로 사용될 수 있으므로, 구매한 잔액이 일부라도 사용된 경우 완료된 결제는 일반적으로 환불되지 않습니다.',
        ],
      },
      {
        title: '3. 검토 가능한 예외 상황',
        body: [
          '중복 결제가 발생했거나, 구매한 크레딧이 정상 반영되지 않았거나, 구매한 팩이 전혀 사용되지 않은 상태에서 결제 직후 신속히 요청한 경우에는 환불 검토가 가능할 수 있습니다.',
          '다만 이런 예외는 결제 레일 제약, 사기 방지 검토, 실제 취소 가능 여부에 따라 재량적으로 판단됩니다.',
        ],
      },
      {
        title: '4. 사용된 크레딧',
        body: [
          '구매 크레딧이 관리형 추출, 관리형 에이전트 채팅, 기타 관련 워크스페이스 사용에 이미 소모된 경우 해당 사용분은 환불되지 않습니다.',
        ],
      },
      {
        title: '5. 결제 레일 제약',
        body: [
          'Cotext는 현재 NOWPayments 호스팅 결제를 사용합니다. 카드, 크립토, 정산 시점, 취소 가능성은 NOWPayments 및 연결된 상위 결제수단 정책에 따라 달라질 수 있습니다.',
        ],
      },
      {
        title: '6. 남용 및 차지백',
        body: [
          '사기성 사용, 남용, 차지백 시도는 환불 거절, 크레딧 회수, 워크스페이스 정지, 계정 종료로 이어질 수 있습니다.',
        ],
      },
    ],
  },
} as const;

export default function RefundPolicyPage() {
  const { language } = useLanguage();
  const c = COPY[language === 'ko' ? 'ko' : 'en'];

  return (
    <MarketingShell eyebrow={c.eyebrow} title={c.title} description={c.description}>
      <section className="lp-site-section">
        <div className="lp-legal-list">
          {c.sections.map((section) => (
            <article key={section.title} className="lp-legal-card">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
