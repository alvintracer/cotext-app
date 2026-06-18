import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Sun, Moon, Monitor, PaperPlaneRight as Send,
  Image as ImageIcon, DeviceMobile as Smartphone, Robot as Bot, Check, Stack as Layers,
  ChatText as MessageSquare, GitBranch, GithubLogo, Package, ShareNetwork, AndroidLogo, Brain,
} from '@phosphor-icons/react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import '../styles/landing.css';

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  assets: GithubReleaseAsset[];
}

const CONTENT = {
  ko: {
    nav: { capture: '캡처', github: 'GitHub', context: '컨텍스트', how: '작동 방식' },
    launch: 'Launch',
    open: '열기',
    eyebrow: 'GitHub-native context capture',
    mindsync: {
      tag: '두뇌 레이어 · MindSync',
      title: '데이터를 두뇌로, 두뇌를 워크스페이스로',
      desc: '워드·한글·PPT·PDF를 한 번에 올리면 BYOK LLM이 의미 단위로 지식 그래프(노드·클러스터·엣지)를 뽑아 대상 워크스페이스의 두뇌에 시드하거나 증강합니다. 질문하면 출처 노드까지 클릭으로 추적.',
      cta: 'MindSync 열기',
      sub: 'Cotext 워크스페이스가 컨텍스트 풀이라면, MindSync는 그 위의 두뇌 레이어 — 어디서든 같은 두뇌에 접근합니다.',
    },
    tools: {
      title: '바로 써보기',
      desc: '로그인하면 5단계까지 만들어둔 기능을 곧바로 사용할 수 있어요.',
      workspaces: { label: '워크스페이스', desc: 'GitHub repo를 컨텍스트 풀로 연결하고 채팅하듯 메모', tag: 'Phase 1·2' },
      studio: { label: 'Knowledge Studio', desc: '파일을 한 번에 업로드 → BYOK LLM이 의미 단위로 지식 그래프 추출 + 갭 분석', tag: 'Phase 3·4' },
      think: { label: 'Think 모드', desc: '생성된 지식망에 질문 → 출처(노드) 클릭으로 점프하는 근거 기반 답변', tag: 'Phase 5' },
    },
    heroH1a: '당신의 생각을 항상',
    heroH1b: '팀과 에이전트와 연결하세요',
    heroSub:
      '채팅하듯 언제든 메모하세요. 언제 어디서든 당신의 메모가 당신의 팀과 AI 에이전트가 가장 이해하기 쉬운 언어로 동기화됩니다.',
    githubStart: 'GitHub로 시작',
    downloadApp: '안드로이드 앱 다운로드',
    heroNote: '무료로 시작 · 당신의 repo가 정본 · 토큰은 서버에만',
    trustLabel: '함께 쓰는 도구',
    f1Title: '채팅하듯 캡처, 에디터처럼 확장',
    f1Desc: '평소엔 한 줄짜리 채팅 입력창. 길어지면 부드럽게 풀 Markdown 에디터로 늘어납니다. 모드를 바꾸는 게 아니라, 하나의 입력창이 생각의 크기에 맞춰 자랍니다.',
    f1l1a: '모바일에서 빠르게, PC에서 깊게 이어쓰기',
    f1l2b: ' 슬래시 커맨드로 구조화',
    f1l3: 'Enter 전송 · Shift+Enter 줄바꿈 · 한글 IME 안전',
    f2Title: '당신의 GitHub repo가 정본',
    f2DescA: 'Cotext는 또 하나의 노트 사일로가 아닙니다. 디렉토리를 채팅방처럼 열면 그 안에 ',
    f2DescB: '가 생기고, 메모는 버전관리되는 Markdown으로 쌓입니다.',
    f2l1: '어디서든 접속 · pull / push로 동기화',
    f2l2: 'pushed/draft 시각 구분, SHA 기반 충돌 감지',
    f2l3: '토큰은 서버(Edge Functions)에만 — 브라우저 노출 없음',
    f3Title: '에이전트가 이해하는 구조로 — 입력하는 순간부터',
    f3DescA: '나중에 AI가 분류하는 게 아니라, 적는 순간 가벼운 타입·태그를 붙입니다. 결정·출처·아이디어·질문이 구조화된 블록이 되고, 골라 묶으면 그대로 멀티 LLM에 주입할 ',
    f3DescB: '이 됩니다.',
    f3l1: 'decision / source / idea / question 블록',
    f3l2: '룸·태그 필터로 컨텍스트 팩 발행 (clipboard / repo commit)',
    f3l3: 'Repo-as-MCP — 어떤 에이전트든 같은 풀에 접속',
    gridKicker: '디테일까지',
    gridTitle: '가볍고, 빠르고, 어디서든',
    g1t: '이미지 자동 압축', g1d: '어떤 이미지든 업로드 직전 ≤500KB로 압축(WebP). repo가 가벼워지고 LFS가 필요 없습니다.',
    g2t: '라이트 / 다크', g2d: '토큰 기반 테마로 첫 페인트부터 깜빡임 없이. 시스템 설정도 자동 반영.',
    g3t: '모바일 · PWA', g3d: '반응형 레이아웃과 설치형 PWA. 향후 Capacitor 네이티브 앱으로 확장.',
    g4t: '멀티 LLM 팬아웃', g4d: '하나의 컨텍스트를 여러 모델에 동시 전송하고 응답을 비교, 채택본을 다시 저장.',
    howKicker: '3단계',
    howTitle: '연결하고, 적고, 발행한다',
    s1t: 'GitHub 연결', s1d: 'repo를 workspace로 연결하거나 새로 만듭니다. 디렉토리를 채팅방처럼 엽니다.',
    s2t: '채팅하듯 캡처', s2d: '텍스트·이미지·파일을 남기면 Markdown과 assets로 정리되어 쌓입니다.',
    s3t: '에이전트 연결', s3d: '링크 버튼으로 팀 초대 또는 AI 연결. 플랫폼 선택하면 복사할 프롬프트/MCP 설정이 자동 생성.',
    ctaTitle: '당신의 컨텍스트를 깨우세요',
    ctaDesc: '흩어진 메모를 사람과 AI가 함께 쓰는 GitHub-native 컨텍스트 풀로.',
    ctaBtn: 'Launch Cotext',
    footerCopy: '© 2026 Cotext · 빌더와 에이전트를 위한 GitHub-native 컨텍스트',
    chip: { decision: '결정', source: '출처', idea: '아이디어', spec: '스펙' },
    mockSync: 'synced · main',
    packArrow: 'decision + spec 필터 → 묶기',
    packOut: 'Context Pack → Claude · GPT · Cursor',
    f3b1: '3-step 온보딩 확정',
    f3b2: '빈 룸 상태 화면',
    f3b3: '경쟁 분석 표',
    roomInbox: '빠른 메모 · 9',
    roomRoadmap: '로드맵 · 24',
    roomDesign: '랜딩 · 16',
    roomEng: '동기화 · 31',
    mockMsg1: '온보딩은 GitHub 연결 → 디렉토리 선택 → 첫 메모까지 3단계로 고정. 그 이상은 다음 버전에서.',
    mockMsg2: '경쟁 분석은 research/competitors 룸에 정리 — Notion / Obsidian / Linear 비교 표.',
    mockMsg3: '컴포저에 /handoff 추가하자 — 블록을 담당자에게 바로 배정하고 알림.',
    mockComposer: '다음 스프린트는 컨텍스트 팩 공유 링크에 집중…',
  },
  en: {
    nav: { capture: 'Capture', github: 'GitHub', context: 'Context', how: 'How it works' },
    launch: 'Launch',
    eyebrow: 'GitHub-native context capture',
    open: 'Open',
    mindsync: {
      tag: 'Brain layer · MindSync',
      title: 'Docs into a brain, brain into your workspace',
      desc: 'Drop Word, HWPX, PPT, PDF; BYOK LLM extracts a semantic graph (nodes / clusters / edges) and seeds (or augments) your target workspace brain. Ask the brain — click any [S#] to jump to its source node.',
      cta: 'Open MindSync',
      sub: 'If a Cotext workspace is the context pool, MindSync is the brain layer above — the same brain, reachable from anywhere.',
    },
    tools: {
      title: 'Try it now',
      desc: 'After login, every feature we shipped through Phase 5 is one click away.',
      workspaces: { label: 'Workspaces', desc: 'Connect a GitHub repo as your context pool and capture notes like chat', tag: 'Phase 1·2' },
      studio: { label: 'Knowledge Studio', desc: 'Upload docs at once → BYOK LLM extracts a semantic knowledge graph with gap analysis', tag: 'Phase 3·4' },
      think: { label: 'Think mode', desc: 'Ask the graph and get grounded answers — click [S#] refs to jump to source nodes', tag: 'Phase 5' },
    },
    heroH1a: 'Sync your idea with',
    heroH1b: 'your team and agents',
    heroSub:
      'Capture notes anytime, like chatting. Anywhere, anytime, your notes sync into the language your team and AI agents understand best.',
    githubStart: 'Start with GitHub',
    downloadApp: 'Download Android App',
    heroNote: 'Free to start · Your repo is the source of truth · Tokens stay on the server',
    trustLabel: 'Works with',
    f1Title: 'Capture like chat, expand like an editor',
    f1Desc: 'Normally a single-line chat box. As you write more, it smoothly grows into a full Markdown editor. Not a mode switch — one input that grows with your thinking.',
    f1l1a: 'Quick on mobile, deep on desktop',
    f1l2b: ' slash commands to structure',
    f1l3: 'Enter to send · Shift+Enter newline · Korean IME-safe',
    f2Title: 'Your GitHub repo is the source of truth',
    f2DescA: "Cotext isn't another note silo. Open a directory like a chat room and a ",
    f2DescB: ' appears inside — your notes accumulate as version-controlled Markdown.',
    f2l1: 'Access anywhere · sync with pull / push',
    f2l2: 'Pushed/draft visual states, SHA-based conflict detection',
    f2l3: 'Tokens only on the server (Edge Functions) — never in the browser',
    f3Title: 'Structured for agents — from the moment you type',
    f3DescA: 'Instead of AI classifying later, you add lightweight types and tags as you write. Decisions, sources, ideas and questions become structured blocks — bundle them into a ',
    f3DescB: ' you can feed to any LLM.',
    f3l1: 'Source tags distinguish human vs AI — visual badges per author',
    f3l2: 'Context Packs via clipboard, share link, or repo commit',
    f3l3: 'MCP + REST API — connect ChatGPT, Claude, Cursor, Antigravity',
    gridKicker: 'Down to the details',
    gridTitle: 'Light, fast, open',
    g1t: 'Auto image compression', g1d: 'Any image is compressed to ≤500KB (WebP) before upload. Your repo stays light — no LFS needed.',
    g2t: 'Token-gated sharing', g2d: 'Share context with expiring URLs and scope controls. Even private repos, no login required.',
    g3t: 'Mobile · PWA', g3d: 'Responsive layout and installable PWA. Later wrapped as a Capacitor native app.',
    g4t: 'AI agent connect', g4d: 'One API key connects ChatGPT, Claude, Gemini, Cursor, and Antigravity. Prompt/MCP config auto-generated.',
    howKicker: 'Three steps',
    howTitle: 'Connect, capture, publish',
    s1t: 'Connect GitHub', s1d: 'Link a repo as a workspace or create one. Open a directory like a chat room.',
    s2t: 'Capture like chatting', s2d: "Drop text, images and files — they're organized into Markdown and assets.",
    s3t: 'Connect agents', s3d: 'Hit the link button to invite teammates or connect AI. Pick a platform, copy the prompt/config, done.',
    ctaTitle: 'Wake up your context',
    ctaDesc: 'Turn scattered notes into a GitHub-native context pool shared by humans and AI.',
    ctaBtn: 'Launch Cotext',
    footerCopy: '© 2026 Cotext · GitHub-native context for builders & agents',
    chip: { decision: 'Decision', source: 'Source', idea: 'Idea', spec: 'Spec' },
    mockSync: 'synced · main',
    packArrow: 'filter decision + spec → bundle',
    packOut: 'Context Pack → Claude · GPT · Cursor',
    f3b1: 'lock 3-step onboarding',
    f3b2: 'empty-room state screen',
    f3b3: 'competitor analysis',
    roomInbox: 'quick notes · 9',
    roomRoadmap: 'roadmap · 24',
    roomDesign: 'landing · 16',
    roomEng: 'sync · 31',
    mockMsg1: 'Lock onboarding to 3 steps: connect GitHub → pick a directory → first note. More can wait for the next version.',
    mockMsg2: 'Competitor analysis lives in research/competitors — Notion / Obsidian / Linear comparison.',
    mockMsg3: "Let's add /handoff to the composer — assign a block to a teammate and notify them.",
    mockComposer: 'Next sprint, focus on context-pack share links…',
  },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const c = CONTENT[language === 'ko' ? 'ko' : 'en'];
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  const launch = () => navigate('/login');
  const launchTo = (path: string) => {
    try {
      localStorage.setItem('cotext-post-login-redirect', path);
    } catch {
      // Ignore storage write failures and continue to login.
    }
    navigate('/login');
  };

  // Fetch latest release version on mount
  useEffect(() => {
    fetch('https://api.github.com/repos/alvintracer/cotext-app/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.tag_name) setLatestVersion(data.tag_name); })
      .catch(() => undefined);
  }, []);
  
  const downloadAndroidApp = async () => {
    try {
      const res = await fetch('https://api.github.com/repos/alvintracer/cotext-app/releases/latest');
      if (!res.ok) throw new Error('No release found');
      const data = await res.json() as GithubRelease;
      const apkAsset = data.assets.find((asset) => asset.name.endsWith('.apk'));
      if (apkAsset) {
        window.open(apkAsset.browser_download_url, '_blank');
      } else {
        alert(language === 'ko' ? '아직 배포된 APK 파일이 없습니다.' : 'APK release not found yet.');
      }
    } catch {
      alert(language === 'ko' ? '최신 릴리즈 정보를 가져오지 못했습니다.' : 'Failed to fetch release info.');
    }
  };

  const cycleTheme = () =>
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="lp-brand-mark">:&gt;</span>
            <span className="lp-brand-text">Cotext</span>
          </div>
          <div className="lp-nav-links">
            <a href="#capture">{c.nav.capture}</a>
            <a href="#github">{c.nav.github}</a>
            <a href="#context">{c.nav.context}</a>
            <a href="#how">{c.nav.how}</a>
          </div>
          <div className="lp-nav-right">
            <button
              className="icon-button font-medium text-sm"
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
              title="Toggle Language"
            >
              {language === 'en' ? 'A' : '한'}
            </button>
            <button className="icon-button" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label="Toggle theme">
              {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
            </button>
            <button className="lp-btn lp-btn-primary" onClick={launch}>
              {c.launch} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="lp-hero lp-inner">
        <span className="lp-eyebrow"><GithubLogo size={13} /> {c.eyebrow}</span>
        <h1>
          {c.heroH1a}<br />
          <span className="grad">{c.heroH1b}</span>
        </h1>
        <p className="lp-hero-sub">{c.heroSub}</p>
        <div className="lp-hero-cta">
          <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={launch}>
            {c.launch} <ArrowRight size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <button className="lp-btn lp-btn-ghost" onClick={downloadAndroidApp}>
              <AndroidLogo size={18} /> {c.downloadApp}
            </button>
            {latestVersion && <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{latestVersion}</span>}
          </div>
          <button className="lp-btn lp-btn-ghost" onClick={launch}>
            <GithubLogo size={18} /> {c.githubStart}
          </button>
        </div>
        {/* MindSync panel — single-CTA brain-layer surface (replaces 3 separate tool cards) */}
        <section className="lp-mindsync" aria-label={c.mindsync.title}>
          <span className="lp-mindsync-tag"><Brain size={12} weight="fill" /> {c.mindsync.tag}</span>
          <h2 className="lp-mindsync-title">{c.mindsync.title}</h2>
          <p className="lp-mindsync-desc">{c.mindsync.desc}</p>
          <button className="lp-btn lp-btn-primary lp-btn-lg lp-mindsync-cta" onClick={() => navigate('/mindsync')}>
            <Brain size={18} weight="fill" /> {c.mindsync.cta} <ArrowRight size={16} />
          </button>
          <p className="lp-mindsync-sub">{c.mindsync.sub}</p>
        </section>
        <p className="lp-hero-note">{c.heroNote}</p>

        <AppMockup c={c} />
      </header>

      {/* ── Trust row ── */}
      <section className="lp-trust lp-inner">
        <p className="lp-trust-label">{c.trustLabel}</p>
        <div className="lp-trust-row">
          {['GitHub', 'Claude Code', 'Cursor', 'ChatGPT', 'Obsidian'].map((n) => (
            <span className="lp-trust-pill" key={n}><span className="lp-sync-dot" />{n}</span>
          ))}
        </div>
      </section>

      {/* ── Feature 1: Capture ── */}
      <section id="capture" className="lp-section lp-inner">
        <div className="lp-feature">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><MessageSquare size={22} /></span>
            <h3>{c.f1Title}</h3>
            <p>{c.f1Desc}</p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> {c.f1l1a}</li>
              <li><Check size={16} /> <code>/decision</code> <code>/idea</code>{c.f1l2b}</li>
              <li><Check size={16} /> {c.f1l3}</li>
            </ul>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-card lp-card-pad lp-morph">
              <div className="lp-morph-stage">
                <div className="label">Collapsed · chat</div>
                <div className="lp-morph-chat"><span>{language === 'ko' ? '메모 입력…  ( / 로 구조화 )' : 'Type a note…  ( / to structure )'}</span><Send size={15} /></div>
              </div>
              <div className="lp-arrow-down"><ArrowRight size={16} style={{ transform: 'rotate(90deg)' }} /></div>
              <div className="lp-morph-stage">
                <div className="label">Composer · editor</div>
                <div className="lp-morph-editor">
                  <span className="h"># 온보딩 개선</span><br />
                  <span className="dim">## Decision</span><br />
                  - 3-step 온보딩 고정<br />
                  <span className="dim">## Spec</span><br />
                  - 빈 룸 상태 화면 추가
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: GitHub ── */}
      <section id="github" className="lp-section lp-inner" style={{ paddingTop: 0 }}>
        <div className="lp-feature reverse">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><GitBranch size={22} /></span>
            <h3>{c.f2Title}</h3>
            <p>{c.f2DescA}<code>.cotext/cotext.md</code>{c.f2DescB}</p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> {c.f2l1}</li>
              <li><Check size={16} /> {c.f2l2}</li>
              <li><Check size={16} /> {c.f2l3}</li>
            </ul>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-card">
              <div className="lp-window-bar">
                <span className="lp-dot r" /><span className="lp-dot y" /><span className="lp-dot g" />
                <span className="lp-window-title">cotext-team</span>
              </div>
              <div className="lp-card-pad">
                <div className="lp-repo">
                  <span className="dir">product/</span><br />
                  &nbsp;&nbsp;<span className="dir">roadmap/</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="dir">.cotext/</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="file">cotext.md</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="dir">assets/</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="file">2026-06-13-flow.webp</span> <span className="muted"># ≤500KB</span><br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="file">metadata.json</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 3: Context engineering (core) ── */}
      <section id="context" className="lp-section lp-inner" style={{ paddingTop: 0 }}>
        <div className="lp-feature">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><Bot size={22} /></span>
            <h3>{c.f3Title}</h3>
            <p>{c.f3DescA}<strong>Context Pack</strong>{c.f3DescB}</p>
            <ul className="lp-feature-list">
              <li><Check size={16} /> {c.f3l1}</li>
              <li><Check size={16} /> {c.f3l2}</li>
              <li><Check size={16} /> {c.f3l3}</li>
            </ul>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-card lp-card-pad">
              <div className="lp-pack-blocks">
                <div className="lp-pack-block"><span className="lp-chip decision">{c.chip.decision}</span> {c.f3b1}</div>
                <div className="lp-pack-block"><span className="lp-chip" style={{ color: 'var(--info)', background: 'var(--info-bg)' }}>{c.chip.spec}</span> {c.f3b2}</div>
                <div className="lp-pack-block"><span className="lp-chip source">{c.chip.source}</span> {c.f3b3}</div>
              </div>
              <div className="lp-pack-arrow"><Layers size={14} /> {c.packArrow}</div>
              <div className="lp-pack-out"><Package size={16} /> {c.packOut}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Small feature grid ── */}
      <section className="lp-section lp-inner" style={{ paddingTop: 0 }}>
        <div className="lp-section-head">
          <p className="lp-kicker">{c.gridKicker}</p>
          <h2>{c.gridTitle}</h2>
        </div>
        <div className="lp-grid">
          <div className="lp-grid-card">
            <span className="ic"><ImageIcon size={20} /></span>
            <h4>{c.g1t}</h4>
            <p>{c.g1d}</p>
          </div>
          <div className="lp-grid-card">
            <span className="ic"><ShareNetwork size={20} /></span>
            <h4>{c.g2t}</h4>
            <p>{c.g2d}</p>
          </div>
          <div className="lp-grid-card">
            <span className="ic"><Smartphone size={20} /></span>
            <h4>{c.g3t}</h4>
            <p>{c.g3d}</p>
          </div>
          <div className="lp-grid-card">
            <span className="ic"><Bot size={20} /></span>
            <h4>{c.g4t}</h4>
            <p>{c.g4d}</p>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="lp-section lp-inner" style={{ paddingTop: 0 }}>
        <div className="lp-section-head">
          <p className="lp-kicker">{c.howKicker}</p>
          <h2>{c.howTitle}</h2>
        </div>
        <div className="lp-steps">
          <div className="lp-step"><span className="lp-step-num">1</span><h4>{c.s1t}</h4><p>{c.s1d}</p></div>
          <div className="lp-step"><span className="lp-step-num">2</span><h4>{c.s2t}</h4><p>{c.s2d}</p></div>
          <div className="lp-step"><span className="lp-step-num">3</span><h4>{c.s3t}</h4><p>{c.s3d}</p></div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="lp-inner">
        <div className="lp-cta">
          <h2>{c.ctaTitle}</h2>
          <p>{c.ctaDesc}</p>
          <div className="lp-hero-cta" style={{ justifyContent: 'center', marginTop: '2rem' }}>
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={launch}>
              {c.ctaBtn} <ArrowRight size={18} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <button className="lp-btn lp-btn-ghost" onClick={downloadAndroidApp}>
                <AndroidLogo size={18} /> {c.downloadApp}
              </button>
              {latestVersion && <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{latestVersion}</span>}
            </div>
            <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/mindsync')}>
              <Brain size={18} /> MindSync
            </button>
            <button className="lp-btn lp-btn-ghost" onClick={() => launchTo('/mindsync/think')}>
              <Bot size={18} /> Think Mode
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner lp-inner">
          <div className="lp-brand">
            <span className="lp-brand-mark">:&gt;</span>
            <span className="lp-brand-text">Cotext</span>
          </div>
          <div className="lp-footer-links">
            <a href="#capture">{c.nav.capture}</a>
            <a href="#github">{c.nav.github}</a>
            <a href="#context">{c.nav.context}</a>
            <a onClick={launch} style={{ cursor: 'pointer' }}>{c.launch}</a>
          </div>
          <p className="lp-footer-copy">{c.footerCopy}</p>
        </div>
      </footer>
    </div>
  );
}

type Content = (typeof CONTENT)['ko'];

/* Hero app mockup — recreates the real Cotext UI, filled with sample content */
function AppMockup({ c }: { c: Content }) {
  return (
    <div className="lp-window">
      <div className="lp-window-bar">
        <span className="lp-dot r" /><span className="lp-dot y" /><span className="lp-dot g" />
        <span className="lp-window-title">cotext · cotext-team</span>
      </div>
      <div className="lp-app">
        <aside className="lp-app-side">
          <div className="lp-app-side-h"><span className="lp-brand-mark" style={{ fontSize: 18 }}>:&gt;</span> cotext-team</div>
          <div className="lp-room"><span className="lp-room-name">inbox/quick-notes</span><span className="lp-room-meta">{c.roomInbox}</span></div>
          <div className="lp-room active"><span className="lp-room-name">product/roadmap</span><span className="lp-room-meta">{c.roomRoadmap}</span></div>
          <div className="lp-room"><span className="lp-room-name">design/landing-page</span><span className="lp-room-meta">{c.roomDesign}</span></div>
          <div className="lp-room"><span className="lp-room-name">eng/sync-engine</span><span className="lp-room-meta">{c.roomEng}</span></div>
          <div className="lp-app-side-foot"><span className="lp-sync-dot" /> {c.mockSync}</div>
        </aside>
        <main className="lp-app-main">
          <div className="lp-app-main-h">
            <div>
              <div className="t">product/roadmap</div>
              <div className="p">.cotext/cotext.md</div>
            </div>
            <div className="lp-modes">
              <span className="lp-mode active">Chat</span>
              <span className="lp-mode">Split</span>
              <span className="lp-mode">Preview</span>
            </div>
          </div>
          <div className="lp-timeline">
            <div className="lp-msg pushed">
              <div className="lp-msg-head"><span className="lp-chip decision">{c.chip.decision}</span><span className="lp-time">2026-06-13 14:32</span><span className="lp-state pushed">· pushed</span></div>
              <div className="lp-msg-body">{c.mockMsg1}</div>
            </div>
            <div className="lp-msg pushed">
              <div className="lp-msg-head"><span className="lp-chip source">{c.chip.source}</span><span className="lp-time">14:35</span><span className="lp-state pushed">· pushed</span></div>
              <div className="lp-msg-body">{c.mockMsg2}</div>
            </div>
            <div className="lp-msg draft">
              <div className="lp-msg-head"><span className="lp-chip idea">{c.chip.idea}</span><span className="lp-time">15:02</span><span className="lp-state draft">· draft</span></div>
              <div className="lp-msg-body">{c.mockMsg3}</div>
            </div>
          </div>
          <div className="lp-composer">
            <div className="lp-composer-top"><span>H</span><strong>B</strong><span>•</span><span>{'</>'}</span><ImageIcon size={15} /></div>
            <div className="lp-composer-row">
              <div className="lp-composer-text"><span className="muted">/decision </span>{c.mockComposer}</div>
              <div className="lp-send"><Send size={16} /></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
