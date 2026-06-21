import MarketingShell from '../components/site/MarketingShell';
import { useLanguage } from '../contexts/LanguageContext';

const COPY = {
  en: {
    eyebrow: 'Terms of Service',
    title: 'Cotext Terms of Service',
    description: 'The operating rules for using Cotext workspaces, managed AI, and shared knowledge features.',
    sections: [
      {
        title: '1. Service scope',
        body: [
          'Cotext is a collaborative knowledge workspace that connects chat-style capture, markdown editing, GitHub-backed storage, MindSync extraction, and managed or BYOK AI workflows.',
          'Some features are beta and may change, pause, or be rate-limited as the product evolves.',
        ],
      },
      {
        title: '2. Accounts and access',
        body: [
          'You are responsible for your account, connected GitHub repositories, invited teammates, and any API keys or provider credentials you attach.',
          'If you join a shared workspace, your access depends on the workspace owner or team membership state.',
        ],
      },
      {
        title: '3. Your content',
        body: [
          'You retain ownership of the content, files, prompts, and repository data you bring into Cotext.',
          'You grant Cotext the limited rights needed to store, process, transform, sync, and display that content in order to operate the service.',
        ],
      },
      {
        title: '4. Managed AI and BYOK',
        body: [
          'BYOK requests are routed using the keys you provide. Managed requests run through Cotext-controlled server infrastructure and may consume workspace credits.',
          'You are responsible for reviewing outputs before relying on them for business, legal, medical, financial, or safety-critical decisions.',
        ],
      },
      {
        title: '5. Acceptable use',
        body: [
          'Do not use Cotext to violate law, infringe rights, abuse third-party systems, distribute malware, or generate harmful or deceptive content.',
          'Do not attempt to bypass workspace access controls, payment controls, or product security boundaries.',
        ],
      },
      {
        title: '6. Billing and credits',
        body: [
          'Managed credit packs are prepaid, workspace-scoped balances used for Cotext-managed AI features.',
          'Pricing, beta grants, and metering logic may change. If they do, new usage follows the updated terms shown in product or on the pricing page.',
        ],
      },
      {
        title: '7. Availability and limits',
        body: [
          'Cotext is provided on an as-available basis. We do not guarantee uninterrupted uptime, permanent availability of any beta feature, or compatibility with every third-party provider.',
          'We may suspend abusive traffic, unstable integrations, or workloads that threaten service reliability.',
        ],
      },
      {
        title: '8. Termination',
        body: [
          'You may stop using the service at any time. We may suspend or terminate access for abuse, security risk, fraud, or repeated policy violations.',
          'Some repository content may remain in your own GitHub or storage systems even after your Cotext access ends, depending on how you connected them.',
        ],
      },
    ],
  },
  ko: {
    eyebrow: '이용약관',
    title: 'Cotext 이용약관',
    description: 'Cotext 워크스페이스, 관리형 AI, 공동 지식망 기능을 사용할 때 적용되는 운영 규칙입니다.',
    sections: [
      {
        title: '1. 서비스 범위',
        body: [
          'Cotext는 채팅형 기록, 마크다운 편집, GitHub 기반 저장, MindSync 추출, 관리형 또는 BYOK AI 워크플로를 연결하는 협업형 지식 워크스페이스입니다.',
          '일부 기능은 베타 상태이며 제품 발전 과정에서 변경, 일시 중지, 속도 제한이 있을 수 있습니다.',
        ],
      },
      {
        title: '2. 계정과 접근 권한',
        body: [
          '계정, 연결한 GitHub 저장소, 초대한 팀원, 입력한 API 키 및 제공자 자격 증명 관리는 사용자 책임입니다.',
          '공유 워크스페이스에 참여하는 경우 접근 권한은 워크스페이스 소유자와 팀 멤버십 상태에 따라 달라집니다.',
        ],
      },
      {
        title: '3. 사용자 콘텐츠',
        body: [
          'Cotext에 가져오는 문서, 파일, 프롬프트, 저장소 데이터의 소유권은 사용자에게 있습니다.',
          '다만 서비스 운영을 위해 저장, 처리, 변환, 동기화, 표시하는 데 필요한 제한적 권한을 Cotext에 부여하게 됩니다.',
        ],
      },
      {
        title: '4. 관리형 AI와 BYOK',
        body: [
          'BYOK 요청은 사용자가 넣은 키를 사용해 라우팅됩니다. 관리형 요청은 Cotext 서버 인프라를 통해 처리되며 워크스페이스 크레딧을 소모할 수 있습니다.',
          '비즈니스, 법률, 의료, 금융, 안전 등 중요한 판단에 AI 출력을 그대로 의존하기 전에 반드시 직접 검토해야 합니다.',
        ],
      },
      {
        title: '5. 허용되지 않는 사용',
        body: [
          '법 위반, 권리 침해, 제3자 시스템 남용, 악성코드 배포, 유해하거나 기만적인 콘텐츠 생성 목적으로 Cotext를 사용하면 안 됩니다.',
          '워크스페이스 접근 제어, 결제 제어, 보안 경계를 우회하려는 시도도 금지됩니다.',
        ],
      },
      {
        title: '6. 결제와 크레딧',
        body: [
          '관리형 크레딧 팩은 Cotext 관리형 AI 기능에 사용하는 선불형 워크스페이스 잔액입니다.',
          '가격, 베타 기본 지급, 과금 로직은 변경될 수 있으며, 변경 후 사용분에는 제품 내 또는 가격 페이지에 표시된 최신 기준이 적용됩니다.',
        ],
      },
      {
        title: '7. 가용성과 제한',
        body: [
          'Cotext는 가능한 범위에서 제공되며, 무중단 가동, 모든 베타 기능의 영구 제공, 모든 외부 제공자와의 호환성을 보장하지 않습니다.',
          '서비스 안정성을 해치는 과도한 트래픽, 불안정한 통합, 남용성 워크로드는 제한 또는 중단될 수 있습니다.',
        ],
      },
      {
        title: '8. 종료',
        body: [
          '사용자는 언제든지 사용을 중단할 수 있습니다. 남용, 보안 위험, 사기, 반복적인 정책 위반이 있으면 Cotext가 접근을 제한하거나 종료할 수 있습니다.',
          '연결 방식에 따라 일부 저장소 콘텐츠는 Cotext 접근 종료 후에도 사용자의 GitHub나 자체 저장 시스템에 남아 있을 수 있습니다.',
        ],
      },
    ],
  },
} as const;

export default function TermsPage() {
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
