export type Language = 'en' | 'ko';

type TranslationKey = 
  | 'nav.workspaces'
  | 'nav.settings'
  | 'nav.logout'
  | 'workspaces.title'
  | 'workspaces.desc'
  | 'workspaces.new'
  | 'workspaces.empty.title'
  | 'workspaces.empty.desc'
  | 'workspaces.loading'
  | 'workspaces.tag.owner'
  | 'workspaces.tag.invited'
  | 'modal.title.choose'
  | 'modal.desc.choose'
  | 'modal.mode.connect'
  | 'modal.mode.connect.desc'
  | 'modal.mode.create'
  | 'modal.mode.create.desc'
  | 'modal.title.repo'
  | 'modal.desc.repo'
  | 'modal.search.placeholder'
  | 'modal.empty.repo'
  | 'modal.title.create'
  | 'modal.title.settings'
  | 'modal.step.reponame'
  | 'modal.step.owner'
  | 'modal.step.workspace'
  | 'modal.btn.next'
  | 'modal.btn.create'
  | 'modal.btn.connect'
  | 'modal.btn.creating'
  | 'modal.btn.back'
  | 'composer.placeholder'
  | 'composer.attach'
  | 'composer.photo'
  | 'composer.ocr'
  | 'sidebar.search.placeholder'
  | 'sidebar.newChat'
  | 'sidebar.emptyChats'
  | 'chat.selectPrompt'
  | 'chat.selectDesc'
  | 'chat.loading'
  | 'modal.title.addChat'
  | 'modal.desc.addChat'
  | 'modal.btn.openChat'
  | 'invite.title'
  | 'invite.desc'
  | 'invite.accept'
  | 'invite.accepting'
  | 'invite.expired'
  | 'invite.invalid'
  | 'invite.loginRequired'
  | 'invite.loginBtn'
  | 'invite.alreadyConnected'
  | 'invite.goToWorkspace'
  | 'invite.invitedBy'
  | 'invite.repo'
  | 'team.title'
  | 'team.invite'
  | 'team.empty'
  | 'team.you'
  | 'team.modal.title'
  | 'team.modal.desc'
  | 'team.modal.generate'
  | 'team.modal.copied'
  | 'team.modal.copyLink'
  | 'team.modal.expires'
  | 'team.modal.7days'
  | 'team.modal.30days'
  | 'team.modal.never'
  | 'contextPack.copy'
  | 'contextPack.copied'
  | 'contextPack.title'
  | 'sync.guideGenerated'
  | 'share.title'
  | 'share.desc'
  | 'share.scope'
  | 'share.scopeRoom'
  | 'share.scopeAll'
  | 'share.expires'
  | 'share.1h'
  | 'share.24h'
  | 'share.7d'
  | 'share.30d'
  | 'share.never'
  | 'share.createLink'
  | 'share.creating'
  | 'share.copy'
  | 'share.copied'
  | 'apiKey.title'
  | 'apiKey.desc'
  | 'apiKey.create'
  | 'apiKey.labelPlaceholder'
  | 'apiKey.empty'
  | 'apiKey.usage'
  ;

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    'nav.workspaces': 'Workspaces',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'workspaces.title': 'Workspaces',
    'workspaces.desc': 'Connect GitHub repositories as workspaces',
    'workspaces.new': 'New Workspace',
    'workspaces.empty.title': 'No workspaces yet',
    'workspaces.empty.desc': 'Create your first workspace to connect a GitHub repository.',
    'workspaces.loading': 'Loading workspaces...',
    'workspaces.tag.owner': 'Owner',
    'workspaces.tag.invited': 'Invited',
    'modal.title.choose': 'New Workspace',
    'modal.desc.choose': 'Connect an existing repository or create a new one.',
    'modal.mode.connect': 'Connect Repository',
    'modal.mode.connect.desc': 'Select an existing GitHub repository',
    'modal.mode.create': 'Create Repository',
    'modal.mode.create.desc': 'Create a new repository and connect it',
    'modal.title.repo': 'Select Repository',
    'modal.desc.repo': 'Choose a GitHub repository to connect.',
    'modal.search.placeholder': 'Search repositories...',
    'modal.empty.repo': 'No repositories found',
    'modal.title.create': 'Create Repository',
    'modal.title.settings': 'Workspace Settings',
    'modal.step.reponame': 'Repository Name',
    'modal.step.owner': 'Owner',
    'modal.step.workspace': 'Workspace Name',
    'modal.btn.next': 'Next',
    'modal.btn.create': 'Create',
    'modal.btn.connect': 'Connect',
    'modal.btn.creating': 'Creating...',
    'modal.btn.back': '← Back',
    'composer.placeholder': 'Type a note... (Enter to send)',
    'composer.attach': 'Attach file',
    'composer.photo': 'Take photo',
    'composer.ocr': 'Extract Text',
    'sidebar.search.placeholder': 'Search chats...',
    'sidebar.newChat': 'New Chat',
    'sidebar.emptyChats': 'No chats yet',
    'chat.selectPrompt': 'Select a chat',
    'chat.selectDesc': 'Choose a chat from the sidebar or create a new one to start capturing context.',
    'chat.loading': 'Loading chat...',
    'modal.title.addChat': 'Add Chat',
    'modal.desc.addChat': 'Select a directory from {repo} to open as a chat.',
    'modal.btn.openChat': 'Open as Chat',
    'invite.title': 'Join Workspace',
    'invite.desc': 'You\'ve been invited to connect a repository as a workspace.',
    'invite.accept': 'Connect Workspace',
    'invite.accepting': 'Connecting...',
    'invite.expired': 'This invite link has expired.',
    'invite.invalid': 'Invalid or expired invite link.',
    'invite.loginRequired': 'Log in with GitHub to accept this invite.',
    'invite.loginBtn': 'Log in with GitHub',
    'invite.alreadyConnected': 'You\'re already connected to this repository.',
    'invite.goToWorkspace': 'Go to Workspace',
    'invite.invitedBy': 'Invited by',
    'invite.repo': 'Repository',
    'team.title': 'Team',
    'team.invite': 'Invite',
    'team.empty': 'No teammates yet',
    'team.you': 'you',
    'team.modal.title': 'Invite to Workspace',
    'team.modal.desc': 'Share this link so teammates can connect to the same repository.',
    'team.modal.generate': 'Generate Link',
    'team.modal.copied': 'Copied!',
    'team.modal.copyLink': 'Copy Link',
    'team.modal.expires': 'Expires in',
    'team.modal.7days': '7 days',
    'team.modal.30days': '30 days',
    'team.modal.never': 'Never',
    'contextPack.copy': 'Copy for LLM',
    'contextPack.copied': 'Copied!',
    'contextPack.title': 'Context Pack',
    'sync.guideGenerated': 'Guide files synced',
    'share.title': 'Share Context',
    'share.desc': 'Create a secure link to share context. Recipients can view and copy without a GitHub account.',
    'share.scope': 'Scope',
    'share.scopeRoom': 'This chat',
    'share.scopeAll': 'All chats',
    'share.expires': 'Expires in',
    'share.1h': '1 hour',
    'share.24h': '24 hours',
    'share.7d': '7 days',
    'share.30d': '30 days',
    'share.never': 'Never',
    'share.createLink': 'Create Link',
    'share.creating': 'Creating...',
    'share.copy': 'Copy',
    'share.copied': 'Copied!',
    'apiKey.title': 'API Keys',
    'apiKey.desc': 'Use API keys to connect AI agents (ChatGPT, Claude, etc.) to your workspace via the remote API.',
    'apiKey.create': 'Create Key',
    'apiKey.labelPlaceholder': 'Key label (e.g., chatgpt, claude)',
    'apiKey.empty': 'No API keys yet',
    'apiKey.usage': 'Usage',
  },
  ko: {
    'nav.workspaces': '워크스페이스',
    'nav.settings': '설정',
    'nav.logout': '로그아웃',
    'workspaces.title': '워크스페이스',
    'workspaces.desc': 'GitHub 저장소를 워크스페이스로 연결하세요',
    'workspaces.new': '새 워크스페이스',
    'workspaces.empty.title': '워크스페이스가 없습니다',
    'workspaces.empty.desc': '첫 번째 워크스페이스를 생성하여 저장소를 연결하세요.',
    'workspaces.loading': '워크스페이스 불러오는 중...',
    'modal.title.choose': '새 워크스페이스',
    'modal.desc.choose': 'GitHub 저장소를 연결하거나 새로 만들어보세요.',
    'modal.mode.connect': '기존 레포 연결',
    'modal.mode.connect.desc': '이미 있는 GitHub 저장소를 선택합니다',
    'modal.mode.create': '새 레포 생성',
    'modal.mode.create.desc': '새로운 저장소를 만들고 연결합니다',
    'modal.title.repo': '레포 선택',
    'modal.desc.repo': '연결할 GitHub 저장소를 선택하세요.',
    'modal.search.placeholder': '저장소 검색...',
    'modal.empty.repo': '저장소가 없습니다',
    'modal.title.create': '새 레포 생성',
    'modal.title.settings': '워크스페이스 설정',
    'modal.step.reponame': 'Repository 이름',
    'modal.step.owner': 'Owner (소유자)',
    'modal.step.workspace': '워크스페이스 이름',
    'modal.btn.next': '다음',
    'modal.btn.create': '생성하기',
    'modal.btn.connect': '연결하기',
    'modal.btn.creating': '생성 중...',
    'modal.btn.back': '← 뒤로',
    'composer.placeholder': '메모 입력… (Enter: 전송)',
    'composer.attach': '파일 첨부',
    'composer.photo': '사진 촬영',
    'composer.ocr': '텍스트 추출',
    'sidebar.search.placeholder': '채팅 검색...',
    'sidebar.newChat': '새 채팅',
    'sidebar.emptyChats': '채팅이 없습니다',
    'chat.selectPrompt': '채팅을 선택하세요',
    'chat.selectDesc': '사이드바에서 채팅을 선택하거나 새 채팅을 만들어 컨텍스트 캡처를 시작하세요.',
    'chat.loading': '채팅 불러오는 중...',
    'modal.title.addChat': '채팅 추가',
    'modal.desc.addChat': '{repo}에서 채팅으로 열 디렉토리를 선택하세요.',
    'modal.btn.openChat': '채팅으로 열기',
    'invite.title': '워크스페이스 참여',
    'invite.desc': '레포지토리를 워크스페이스로 연결하는 초대를 받았습니다.',
    'invite.accept': '워크스페이스 연결',
    'invite.accepting': '연결 중...',
    'invite.expired': '만료된 초대 링크입니다.',
    'invite.invalid': '유효하지 않거나 만료된 초대 링크입니다.',
    'invite.loginRequired': '초대를 수락하려면 GitHub으로 로그인하세요.',
    'invite.loginBtn': 'GitHub으로 로그인',
    'invite.alreadyConnected': '이미 연결된 레포지토리입니다.',
    'invite.goToWorkspace': '워크스페이스로 이동',
    'invite.invitedBy': '초대한 사람',
    'invite.repo': '레포지토리',
    'team.title': '팀',
    'team.invite': '초대',
    'team.empty': '아직 팀원이 없습니다',
    'team.you': '나',
    'team.modal.title': '워크스페이스 초대',
    'team.modal.desc': '팀원이 같은 레포지토리에 연결할 수 있도록 이 링크를 공유하세요.',
    'team.modal.generate': '링크 생성',
    'team.modal.copied': '복사됨!',
    'team.modal.copyLink': '링크 복사',
    'team.modal.expires': '만료 기간',
    'team.modal.7days': '7일',
    'team.modal.30days': '30일',
    'team.modal.never': '무제한',
    'contextPack.copy': 'LLM용 복사',
    'contextPack.copied': '복사됨!',
    'contextPack.title': 'Context Pack',
    'sync.guideGenerated': '가이드 파일 동기화됨',
    'share.title': '컨텍스트 공유',
    'share.desc': '보안 링크를 생성하여 컨텍스트를 공유합니다. GitHub 계정 없이도 열람 가능합니다.',
    'share.scope': '범위',
    'share.scopeRoom': '이 채팅만',
    'share.scopeAll': '전체 채팅',
    'share.expires': '만료 기간',
    'share.1h': '1시간',
    'share.24h': '24시간',
    'share.7d': '7일',
    'share.30d': '30일',
    'share.never': '무제한',
    'share.createLink': '링크 생성',
    'share.creating': '생성 중...',
    'share.copy': '복사',
    'share.copied': '복사됨!',
    'apiKey.title': 'API 키',
    'apiKey.desc': 'AI 에이전트(ChatGPT, Claude 등)를 원격 API로 워크스페이스에 연결하려면 API 키를 사용하세요.',
    'apiKey.create': '키 생성',
    'apiKey.labelPlaceholder': '키 라벨 (예: chatgpt, claude)',
    'apiKey.empty': 'API 키가 없습니다',
    'apiKey.usage': '사용법',
  }
};

export function getDefaultLanguage(): Language {
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang && browserLang.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  return 'en';
}
