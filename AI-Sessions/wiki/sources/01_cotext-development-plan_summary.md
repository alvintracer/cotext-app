# Source Summary: 01_cotext-development-plan.md

이 문서는 `AI-Sessions/raw/01_cotext-development-plan.md`의 핵심 내용을 요약한 것입니다.

## 주요 내용
- **프로젝트 핵심 (North Star)**: Cotext는 multi-LLM/agent를 위한 context engineering 도구입니다. 현재 MVP는 사용자가 정보를 수집(capture)하는 2-layer 모델에 집중하고 있습니다.
- **주요 기능**:
  - 모핑 컴포저 (채팅 ↔ 에디터 전환) 및 슬래시 커맨드.
  - 디자인 시스템 적용 (다크/라이트 테마, FOUC 방지).
  - 클라이언트 사이드 이미지 자동 압축 (≤500KB) 기능 추가.
- **기술 스택**: Vite + React + Supabase (Capacitor 친화적 구조). Supabase Edge Functions를 통해 서버 작업을 처리합니다.
- **현재 진행 상태**: 인증, 채팅/에디터 UI, GitHub 동기화, UI 다국어 지원(i18n, 'Room' -> 'Chat' 변경) 등의 MVP 핵심 기능 개발이 모두 완료되었습니다.

이 문서는 향후 에이전트와 사용자가 프로젝트의 개발 히스토리 및 아키텍처 결정을 추적하기 위한 핵심 참고 자료로 활용됩니다.
