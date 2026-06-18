---
type: project
date: 2026-06-17
status: planned
---

# MindSync — 향후 비주얼·자동화 폴리시 (Jarvis vibe + ambient)

이 문서는 [D-010](../decisions/cotext-architecture-decisions.md)에 결정된 MindSync 레이어의 **시각적 폴리시·자동화 확장** 후속 작업 목록이다. 현재 기능적 골격(Phase 1~5 + workspace anchor + auto-merge)은 완성. 아래는 "Iron Man Jarvis" 수준으로 끌어올리는 업그레이드.

관련: [[../decisions/cotext-architecture-decisions]] D-010 · [[cotext-knowledge-studio-plan]] · [[../concepts/neural-link-vs-gbrain-synthesis]]

---

## A. 시각 폴리시 (3D Jarvis vibe)

| 영역 | 현재 | 목표 |
|---|---|---|
| 그래프 뷰 | 2D SVG (d3-force) | three.js 기반 3D force layout. 노드는 깊이감 있는 구체, 클러스터는 발광 halo, 엣지는 빛나는 라인 |
| 업로드 영역 | flat dropzone + 진행 % 텍스트 | 홀로그래픽 frame · 파일 들어올 때 시뮬레이션 입자 효과 · "스캔" 라인 |
| LLM 진행 | 가로 progress bar | 회전하는 ring · 청크 진행을 호 segment로 표현 (Jarvis HUD 느낌) |
| 노드 디테일 패널 | 우측 카드 | 미니 3D 회전 + cluster ring · 메타데이터 floating |
| 갭 분석 | 텍스트 리스트 | 그래프 위에 ghost 노드(점선)로 "비어있는 자리" 시각화 |

### 기술 선택지
- **three.js + react-three-fiber**: React-friendly, 잘 익은 생태계
- **react-force-graph-3d**: 위 두 개 위에 force-directed 3D 그래프 즉시 제공. 마이그레이션 비용 최소
- **Postprocessing** (bloom, chromatic aberration): Jarvis 느낌 핵심

### 작업량 추정
- 3D 그래프 뷰 신규: ~3-5일 (성능 튜닝 포함)
- 업로드/진행 비주얼: ~1-2일
- 디테일 패널 미니 그래프: ~1일

→ **총 1주 정도의 비주얼 폴리시 phase.** 단, MindSync의 가치 자체는 이미 완성되어 있으므로 **선택적 사치재**.

---

## B. 자동화 확장 (GBrain 합성 마지막 한 칸)

[Phase 6: Ambient capture](../concepts/neural-link-vs-gbrain-synthesis.md) 의 골자. MindSync anchor가 정해진 워크스페이스에 자동으로 새 자료가 흘러들어오게.

### B.1 채널
- **이메일 forward**: 전용 이메일 주소(e.g. `inbox+abcdef@cotext.app`)로 forward → Edge Function이 받아서 본문/첨부 → 추출 → MindSync inbox staging
- **iOS 단축어**: 사용자 단축어로 텍스트·URL → POST → inbox staging
- **캘린더 webhook**: Google/Outlook calendar 이벤트 → 회의 메모 자동 import
- **Slack/Discord bot**: `@mindsync save` 같은 명령으로 메시지 staging

### B.2 Inbox 패턴
- 들어온 자료는 **staging 상태** (사용자 승급 전까진 정본 미반영)
- MindSync 페이지에 "📥 Inbox (N)" 섹션 신설 → 사용자가 검토 후 GENERATE/AUGMENT 가능
- 자동 클러스터 제안 (Phase 3 LLM 재활용)

### B.3 결정 후크
- 어느 워크스페이스 anchor로 보낼지 사용자가 정함
- 라우팅 규칙: 이메일 제목 prefix, 키워드 매칭 등으로 자동 anchor 선택 (선택 사항)

---

## C. Track B 매니지드 모델

비즈니스 측면. [v3 신서시스](../concepts/neural-link-synthesis-v3.md) §3 가격 매트릭스 기반.

### C.1 인프라
- `neural-extract-managed` Edge Function (Phase 3 lib을 서버에서 호출)
- Supabase에 `credit_balances`, `credit_transactions` 테이블
- 결제 통합 (Stripe/Toss): 크레딧 충전식

### C.2 fail-safe 추가
- JSON 깨졌을 때 LLM 1회 재시도 (BYOK는 사용자 키이고 비싸서 1회만, 매니지드는 평균비용에 흡수)
- 청크 실패 시 자동 재시도 + 모델 fallback

### C.3 UX
- BYOK / Managed 토글 (MindSync anchor 옆)
- 잔여 크레딧 + 예상 비용 미리보기
- 영수증 발급

---

## 우선순위 제안

```
1. (선택) B 일부 — 이메일 forward만 → 가장 강력한 ambient 채널, 작업량 작음
2. C — 트랙 B 매니지드 (수익화 시작점)
3. A — Jarvis 비주얼 (제품 완성도 / 마케팅 가치)
```

A는 "있으면 좋은" 것, B·C는 "비즈니스 임팩트가 큰" 것. 사용자 결정에 따라 순서 조정.

---

## Cotext 정합성 체크

- ✅ repo=정본 (모든 ambient ingest는 mindsync-imports/ 룸에 MD로 영구 저장 후 그래프 추출)
- ✅ workspace anchor 모델 유지 (자동 ingest도 anchor 워크스페이스로)
- ✅ provenance (`source: ambient-email`, `source: managed-gpt-4o` 등 라벨 분리)
- ✅ MCP 호환 (자동 ingest 결과도 즉시 `cotext-mcp` 도구로 활용 가능)

## 2026-06-18 status note

- Track B moved from roadmap-only to beta implementation.
- Done now:
  - managed server-side extraction path
  - Track selector wired to real behavior in MindSync Studio
  - returned metadata: provider, model, billing mode
- Still pending:
  - credits tables
  - balance / invoice UI
  - payment integration
  - retry / fallback policy by price tier
- Operational note: first managed credits schema is live in the hosted project; payment/credit deduction logic is still pending.
