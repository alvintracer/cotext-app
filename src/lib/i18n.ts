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
  }
};

export function getDefaultLanguage(): Language {
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang && browserLang.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  return 'en';
}
