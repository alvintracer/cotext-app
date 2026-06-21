import MarketingShell from '../components/site/MarketingShell';
import { useLanguage } from '../contexts/LanguageContext';

const COPY = {
  en: {
    eyebrow: 'Privacy Policy',
    title: 'Cotext Privacy Policy',
    description: 'How Cotext handles account data, workspace data, files, managed billing events, and AI processing paths.',
    sections: [
      {
        title: '1. Data we collect',
        body: [
          'We may collect account identifiers, authentication state, workspace metadata, room metadata, repository connection data, invited-member state, and billing/order records needed to operate Cotext.',
          'If you use MindSync or upload supported documents, we may process extracted text and derived graph data needed to generate the knowledge network.',
        ],
      },
      {
        title: '2. BYOK vs managed processing',
        body: [
          'If you use BYOK, your request is sent using the provider credentials you supplied. If you use Cotext-managed AI, your request is processed through Cotext server infrastructure and may be forwarded to the configured upstream model provider.',
          'Managed mode may also record workspace credit usage, request size metadata, and operational logs needed for billing integrity and debugging.',
        ],
      },
      {
        title: '3. Third-party services',
        body: [
          'Cotext relies on third-party infrastructure including Supabase, GitHub, NOWPayments, and model providers. Their platforms may process data according to their own terms and privacy rules.',
          'Card or crypto checkout availability depends on the payment rail you are redirected to and its regional support.',
        ],
      },
      {
        title: '4. Why we process data',
        body: [
          'We process data to authenticate users, sync repositories, run collaborative workspaces, generate knowledge graphs, answer grounded questions, meter managed usage, prevent abuse, and improve reliability.',
        ],
      },
      {
        title: '5. Data retention',
        body: [
          'Retention depends on the feature and storage path involved. Workspace state, graph state, and billing history may be retained while an account or workspace remains active, subject to operational and legal needs.',
          'Some content may persist in user-controlled systems such as GitHub repositories even if it is deleted from Cotext surfaces.',
        ],
      },
      {
        title: '6. Security',
        body: [
          'We use reasonable technical measures to protect service data, but no networked system is perfectly secure. You should avoid uploading secrets or regulated data unless your own review approves that workflow.',
        ],
      },
      {
        title: '7. Your choices',
        body: [
          'You can choose BYOK instead of managed AI, remove some integrations, or stop using the service. Workspace owners also control collaborator access within shared workspaces.',
        ],
      },
    ],
  },
  ko: {
    eyebrow: '개인정보처리방침',
    title: 'Cotext 개인정보처리방침',
    description: '계정 정보, 워크스페이스 데이터, 파일, 관리형 결제 이벤트, AI 처리 경로를 Cotext가 어떻게 다루는지 설명합니다.',
    sections: [
      {
        title: '1. 수집하는 데이터',
        body: [
          'Cotext 운영을 위해 계정 식별자, 인증 상태, 워크스페이스 메타데이터, 룸 메타데이터, 저장소 연결 정보, 초대 멤버 상태, 결제 및 주문 기록을 수집할 수 있습니다.',
          'MindSync나 지원 문서 업로드를 사용할 경우 지식망 생성을 위해 추출된 텍스트와 파생 그래프 데이터를 처리할 수 있습니다.',
        ],
      },
      {
        title: '2. BYOK와 관리형 처리의 차이',
        body: [
          'BYOK를 사용하면 사용자가 입력한 제공자 자격 증명으로 요청이 전송됩니다. Cotext 관리형 AI를 사용하면 요청이 Cotext 서버 인프라를 거쳐 설정된 상위 모델 제공자로 전달될 수 있습니다.',
          '관리형 모드에서는 과금 무결성과 디버깅을 위해 워크스페이스 크레딧 사용량, 요청 크기 메타데이터, 운영 로그가 기록될 수 있습니다.',
        ],
      },
      {
        title: '3. 외부 서비스',
        body: [
          'Cotext는 Supabase, GitHub, NOWPayments, 모델 제공자 등 외부 인프라를 사용합니다. 각 플랫폼은 자체 약관과 개인정보처리 기준에 따라 데이터를 처리할 수 있습니다.',
          '카드 또는 크립토 결제 가능 여부는 연결되는 결제 레일과 해당 지역 지원 범위에 따라 달라질 수 있습니다.',
        ],
      },
      {
        title: '4. 데이터를 처리하는 이유',
        body: [
          '사용자 인증, 저장소 동기화, 협업 워크스페이스 운영, 지식망 생성, 근거 기반 응답, 관리형 사용량 계량, 남용 방지, 서비스 안정성 향상을 위해 데이터를 처리합니다.',
        ],
      },
      {
        title: '5. 보관 기간',
        body: [
          '보관 기간은 기능과 저장 경로에 따라 다릅니다. 워크스페이스 상태, 그래프 상태, 결제 이력은 계정 또는 워크스페이스가 활성 상태인 동안 운영상 또는 법적 필요에 따라 보관될 수 있습니다.',
          'GitHub 저장소처럼 사용자가 직접 소유한 외부 시스템에는 Cotext 화면에서 삭제한 뒤에도 일부 콘텐츠가 남아 있을 수 있습니다.',
        ],
      },
      {
        title: '6. 보안',
        body: [
          'Cotext는 합리적인 기술적 보호 조치를 사용하지만, 네트워크 기반 시스템에 완전한 보안은 없습니다. 별도 검토 없이 비밀정보나 규제 데이터 업로드는 피하는 것이 좋습니다.',
        ],
      },
      {
        title: '7. 사용자 선택권',
        body: [
          '사용자는 관리형 AI 대신 BYOK를 선택하거나 일부 연동을 해제하거나 서비스 사용을 중단할 수 있습니다. 공유 워크스페이스의 협업자 접근 권한은 워크스페이스 소유자가 관리합니다.',
        ],
      },
    ],
  },
} as const;

export default function PrivacyPage() {
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
