import { ArrowRight, Bank, Brain, ChatCircleDots, Coins, Files, Sparkle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import MarketingShell from '../components/site/MarketingShell';
import { useLanguage } from '../contexts/LanguageContext';
import { MANAGED_CREDIT_PACKS } from '../lib/billing/packs';

const COPY = {
  en: {
    eyebrow: 'Managed model pricing',
    title: 'Simple workspace credits for managed Cotext AI',
    description:
      'Use your own API key if you want, or run on Cotext-managed models with workspace credits. Pricing is designed to be understandable before a team spends money.',
    betaBadge: 'Current beta metering',
    betaTitle: 'How credits work today',
    betaBody:
      'Managed extraction and managed agent chat are currently metered at roughly 1 credit per 12,000 input characters, with a minimum of 1 credit per run. Actual usage can vary as prompts, files, and server-side metering evolve.',
    monthlyGrant: 'Current beta workspaces are initialized with a 100-credit monthly grant in-product.',
    packsTitle: 'Credit packs',
    packsBody: 'Top-ups are purchased per workspace and settled through NOWPayments hosted checkout.',
    popular: 'Most balanced',
    packCta: 'Launch workspace',
    useCasesTitle: 'What can credits be used for?',
    useCasesBody: 'The same workspace balance is shared across managed AI surfaces.',
    useCase1Title: 'MindSync extraction',
    useCase1Body: 'Upload Word, PPT, PDF, HWP/HWPX, TXT and other supported documents, extract text, then generate the first knowledge graph automatically.',
    useCase2Title: 'Grounded agent chat',
    useCase2Body: 'Ask Cotext agents to work against your workspace context without pasting your own provider key every time.',
    useCase3Title: 'Shared team runs',
    useCase3Body: 'Let a team workspace accumulate ingestion, graph generation, and managed agent requests under one visible balance and ledger.',
    examplesTitle: 'Rough planning examples',
    examplesBody: 'These are intentionally directional, not hard promises.',
    faqTitle: 'Notes before purchase',
    faq1Title: 'BYOK remains available',
    faq1Body: 'If you connect your own OpenAI, Anthropic, Gemini, xAI, or compatible key, those requests follow your provider billing instead of Cotext workspace credits.',
    faq2Title: 'Workspace-scoped billing',
    faq2Body: 'Credits belong to the workspace that bought them, which keeps shared usage auditable for teams.',
    faq3Title: 'Checkout rail',
    faq3Body: 'Payments currently open a NOWPayments hosted invoice. Card availability can depend on your region and NOWPayments checkout options.',
    ctaTitle: 'Start with free workspace credits, then scale up',
    ctaDescription: 'You can explore the flow first, then top up only when managed usage becomes part of the team workflow.',
  },
  ko: {
    eyebrow: '관리형 모델 요금',
    title: 'Cotext 관리형 AI를 위한 단순한 워크스페이스 크레딧',
    description:
      '원하면 BYOK로 직접 붙이고, 필요하면 Cotext 관리형 모델을 워크스페이스 크레딧으로 사용할 수 있습니다. 팀이 비용을 쓰기 전에 구조가 먼저 이해되도록 설계했습니다.',
    betaBadge: '현재 베타 과금 기준',
    betaTitle: '크레딧은 지금 이렇게 동작합니다',
    betaBody:
      '관리형 추출과 관리형 에이전트 채팅은 현재 입력 문자 약 12,000자당 1크레딧, 최소 실행당 1크레딧 기준으로 계산됩니다. 실제 사용량은 프롬프트 구성, 파일 양, 서버 과금 로직 변경에 따라 달라질 수 있습니다.',
    monthlyGrant: '현재 베타 워크스페이스는 앱 내부에서 월 100크레딧 기본 지급 상태로 초기화됩니다.',
    packsTitle: '크레딧 팩',
    packsBody: '충전은 워크스페이스 단위로 이루어지며 NOWPayments 호스팅 결제로 정산됩니다.',
    popular: '가장 무난한 선택',
    packCta: '워크스페이스 열기',
    useCasesTitle: '크레딧으로 할 수 있는 일',
    useCasesBody: '같은 워크스페이스 잔액을 여러 관리형 AI 기능이 함께 사용합니다.',
    useCase1Title: 'MindSync 지식망 추출',
    useCase1Body: '워드, PPT, PDF, HWP/HWPX, TXT 등 지원 문서를 올리고 텍스트를 추출한 뒤 첫 지식망을 자동 생성합니다.',
    useCase2Title: '근거 기반 에이전트 채팅',
    useCase2Body: '매번 개인 키를 붙이지 않아도 Cotext 에이전트가 워크스페이스 컨텍스트를 바탕으로 작업할 수 있습니다.',
    useCase3Title: '팀 공동 사용',
    useCase3Body: '여러 명이 쓰는 워크스페이스에서 추출, 그래프 생성, 관리형 에이전트 요청을 하나의 잔액과 원장으로 관리할 수 있습니다.',
    examplesTitle: '대략적인 사용 감각',
    examplesBody: '아래 예시는 감을 잡기 위한 방향성 설명이며, 절대 보장치는 아닙니다.',
    faqTitle: '구매 전 알아둘 점',
    faq1Title: 'BYOK는 계속 지원됩니다',
    faq1Body: 'OpenAI, Anthropic, Gemini, xAI 등 본인 키를 연결하면 해당 요청은 Cotext 크레딧이 아니라 각 제공자 과금 체계를 따릅니다.',
    faq2Title: '워크스페이스 단위 정산',
    faq2Body: '크레딧은 구매한 워크스페이스에 귀속되므로 팀 단위 사용량과 감사 추적이 분명해집니다.',
    faq3Title: '결제 레일',
    faq3Body: '현재 결제는 NOWPayments 호스팅 인보이스로 이동합니다. 카드 결제 가능 여부는 지역과 NOWPayments 설정에 따라 달라질 수 있습니다.',
    ctaTitle: '무료 기본 크레딧으로 시작하고, 필요할 때만 충전하세요',
    ctaDescription: '먼저 흐름을 확인하고, 실제로 관리형 사용이 팀 워크플로에 들어오는 시점에만 충전하면 됩니다.',
  },
} as const;

const WORKLOAD_EXAMPLES = {
  en: [
    '500 credits: good for pilot usage, repeated small-to-medium document imports, and many grounded agent turns.',
    '2,500 credits: better for active solo usage or a small project team running extraction and managed chat regularly.',
    '8,000 credits: better when a shared workspace becomes a long-lived external knowledge layer for a team.',
  ],
  ko: [
    '500크레딧: 파일 수가 많지 않은 초기 실험, 여러 번의 중소형 문서 추출, 반복적인 근거 기반 에이전트 대화에 적합합니다.',
    '2,500크레딧: 개인 헤비유저나 소규모 프로젝트 팀이 추출과 관리형 채팅을 꾸준히 돌릴 때 적합합니다.',
    '8,000크레딧: 하나의 공유 워크스페이스를 팀의 장기 외부 지식망처럼 운영할 때 더 적합합니다.',
  ],
} as const;

function formatMoney(amount: number, locale: 'en' | 'ko') {
  return new Intl.NumberFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCredits(value: number, locale: 'en' | 'ko') {
  return new Intl.NumberFormat(locale === 'ko' ? 'ko-KR' : 'en-US').format(value);
}

export default function PricingPage() {
  const { language } = useLanguage();
  const locale = language === 'ko' ? 'ko' : 'en';
  const c = COPY[locale];

  return (
    <MarketingShell
      eyebrow={c.eyebrow}
      title={c.title}
      description={c.description}
      ctaTitle={c.ctaTitle}
      ctaDescription={c.ctaDescription}
    >
      <section className="lp-site-section">
        <div className="lp-site-callout">
          <div className="lp-site-callout-badge">
            <Coins size={15} />
            <span>{c.betaBadge}</span>
          </div>
          <h2>{c.betaTitle}</h2>
          <p>{c.betaBody}</p>
          <p className="lp-site-callout-note">{c.monthlyGrant}</p>
        </div>
      </section>

      <section className="lp-site-section">
        <div className="lp-section-head lp-site-section-head">
          <p className="lp-kicker">{c.packsTitle}</p>
          <h2>{c.packsBody}</h2>
        </div>
        <div className="lp-pricing-grid">
          {MANAGED_CREDIT_PACKS.map((pack, index) => {
            const highlighted = index === 1;
            return (
              <article key={pack.id} className={`lp-pricing-card${highlighted ? ' highlight' : ''}`}>
                <div className="lp-pricing-top">
                  <div>
                    <strong>{pack.label}</strong>
                    <span>{formatCredits(pack.credits, locale)} credits</span>
                  </div>
                  {highlighted ? <em>{c.popular}</em> : null}
                </div>
                <div className="lp-pricing-price">{formatMoney(pack.priceAmount, locale)}</div>
                <p className="lp-pricing-desc">{pack.description}</p>
                <div className="lp-pricing-meter">
                  <span>~ {formatCredits(pack.credits * 12000, locale)} chars</span>
                </div>
                <Link className="lp-btn lp-btn-primary lp-pricing-btn" to="/login">
                  {c.packCta} <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-site-section">
        <div className="lp-section-head lp-site-section-head">
          <p className="lp-kicker">{c.useCasesTitle}</p>
          <h2>{c.useCasesBody}</h2>
        </div>
        <div className="lp-grid">
          <div className="lp-grid-card">
            <span className="ic"><Files size={20} /></span>
            <h4>{c.useCase1Title}</h4>
            <p>{c.useCase1Body}</p>
          </div>
          <div className="lp-grid-card">
            <span className="ic"><ChatCircleDots size={20} /></span>
            <h4>{c.useCase2Title}</h4>
            <p>{c.useCase2Body}</p>
          </div>
          <div className="lp-grid-card">
            <span className="ic"><Brain size={20} /></span>
            <h4>{c.useCase3Title}</h4>
            <p>{c.useCase3Body}</p>
          </div>
        </div>
      </section>

      <section className="lp-site-section lp-site-columns">
        <article className="lp-site-panel">
          <div className="lp-site-panel-head">
            <Sparkle size={18} />
            <h3>{c.examplesTitle}</h3>
          </div>
          <p>{c.examplesBody}</p>
          <ul className="lp-site-list">
            {WORKLOAD_EXAMPLES[locale].map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
        <article className="lp-site-panel">
          <div className="lp-site-panel-head">
            <Bank size={18} />
            <h3>{c.faqTitle}</h3>
          </div>
          <div className="lp-site-faq">
            <div>
              <strong>{c.faq1Title}</strong>
              <p>{c.faq1Body}</p>
            </div>
            <div>
              <strong>{c.faq2Title}</strong>
              <p>{c.faq2Body}</p>
            </div>
            <div>
              <strong>{c.faq3Title}</strong>
              <p>{c.faq3Body}</p>
            </div>
          </div>
        </article>
      </section>
    </MarketingShell>
  );
}
