import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain,
  FileArrowUp,
  Lightning,
  Graph,
  Key,
  GitMerge,
  ChatText,
  Robot,
  ArrowRight,
  ArrowDown,
  Sun,
  Moon,
  Monitor,
  Terminal,
  GitBranch,
  Sparkle,
  Check,
  Copy,
} from '@phosphor-icons/react';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import Strands from '../components/Strands';
import '../styles/mindsync-landing.css';

/* ── i18n content ────────────────────────────────────────── */
const CONTENT = {
  ko: {
    eyebrow: 'MindSync',
    heroH1a: '데이터가 ',
    heroH1b: '두번째 뇌가 되다',
    heroSub:
      '워드, 한글, PDF, PPT 등 나의 데이터에서 지식망을 추출합니다. 언제나 연결 가능한 두번째 뇌로 합쳐집니다.',
    ctaPrimary: 'MindSync 시작하기',
    ctaGhost: '작동 원리 보기',
    cmdNote: '— 에이전트와 즉시 연결',

    howTitle: '3단계로 완성',
    howDesc: '복잡한 설정 없이, 파일을 올리면 끝',
    step1Title: '업로드',
    step1Subtitle: '파일을 드래그 앤 드롭',
    step1Desc:
      'PDF, DOCX, HWPX, PPTX, TXT, MD — 최대 30개 파일을 한번에 올릴 수 있습니다.',
    step2Title: '분석',
    step2Subtitle: 'AI가 자동으로 지식망 추출',
    step2Desc:
      '내 API 키를 사용하거나 Cotext 모델을 선택할 수 있습니다. 노드, 관계, 클러스터를 자동으로 식별합니다.',
    step3Title: '연결',
    step3Subtitle: '워크스페이스에 뇌 연결',
    step3Desc:
      '생성된 지식망은 대상 워크스페이스에 자동 저장됩니다. 에이전트가 이 뇌를 참조해 더 정확한 답변을 제공합니다.',

    featTitle: '핵심 기능',
    featDesc: '보안, 자동화, 질의, 연결 — 모두 내장',
    feat1Title: 'BYOK (내 API 키)',
    feat1Desc:
      '서버를 거치지 않고 직접 AI에 연결합니다. API 키는 브라우저에만 저장되어 안전합니다.',
    feat2Title: '자동 저장',
    feat2Desc:
      '생성한 지식망은 워크스페이스에 자동으로 저장됩니다. 수동 내보내기가 필요 없습니다.',
    feat3Title: '질문하기 (Think 모드)',
    feat3Desc:
      '지식망에 자연어로 질문하면 출처 노드까지 추적 가능한 근거 기반 답변을 받을 수 있습니다.',
    feat4Title: '에이전트 연결',
    feat4Desc:
      'MCP 프로토콜을 통해 Cursor, Windsurf 등 AI 에이전트가 워크스페이스의 뇌에 직접 접근합니다.',

    ctaSectionTitle: '지금 바로 나만의 두번째 뇌를 만들어 보세요',
    ctaSectionBtn: 'MindSync 시작하기',
    ctaSectionLink: 'Cotext 워크스페이스도 둘러보기',

    // ── Build paths section (knowledge graph creation guide) ──
    buildTitle: '내 지식그래프 만드는 3가지 길',
    buildDesc: '로컬 레포 · Cotext 워크스페이스 · 파일 업로드 — 상황에 맞게 고르세요',

    pathALabel: '로컬 + npx',
    pathATitle: '내 컴퓨터의 레포에 셋업',
    pathADesc: '깃 레포가 로컬에 있다면 한 줄로 wiki 구조 + push 자동컴파일까지 완성. Claude Code · Codex 같은 IDE 에이전트가 CLAUDE.md를 자동으로 읽음.',
    pathACmd: 'npx cotext init',
    pathANote: '※ 이후 push 시마다 .github/workflows가 .cotext/neural.json을 자동 재생성',

    pathBLabel: 'Cotext 1-click',
    pathBTitle: '브라우저에서 클릭만으로 셋업',
    pathBDesc: '깃 레포가 로컬에 없어도 됩니다. 워크스페이스 열고 사이드바 "wiki 셋업" 버튼 → GitHub에 한 커밋으로 시드 파일 + workflow yml 전부 푸시.',
    pathBCmd: '워크스페이스 → wiki 셋업',
    pathBNote: '※ 비파괴적 — 기존 파일은 건너뜀',

    pathCLabel: 'Studio 업로드',
    pathCTitle: '파일을 올려서 AI가 직접 추출',
    pathCDesc: 'wiki 구조를 거치지 않고 PDF/DOCX/PPT 등을 바로 올리면 LLM이 노드·엣지·클러스터를 추출해서 워크스페이스 그래프에 머지.',
    pathCCmd: 'MindSync Studio → 파일 드롭',
    pathCNote: '※ wiki 컴파일 결과와 같은 .cotext/neural.json에 합쳐짐',

    structureTitle: '셋업하면 만들어지는 것',
    structureDesc: '레포 구조 + 자동 컴파일 워크플로 + 그래프 (push 후)',

    cmdsTitle: 'npm 명령어 한눈에',
    cmdInit: '구조 시드 파일 + 워크플로 + 첫 컴파일',
    cmdCompile: '마크다운 → 지식그래프 재생성',
    cmdCheck: '그래프가 최신인지 검사 (CI/lint)',
    cmdEnrich: 'LLM이 의미 엣지 추론해서 덧붙임 (BYOK)',
    cmdCopy: '복사',

    footerText: 'MindSync is part of ',
    footerLink: 'Cotext',
  },
  en: {
    eyebrow: 'MindSync',
    heroH1a: 'Your data ',
    heroH1b: 'becomes a second brain',
    heroSub:
      "Upload Word, HWP, PDF, PPT files and AI automatically extracts a knowledge graph. All your files merge into one connected brain.",
    ctaPrimary: 'Start MindSync',
    ctaGhost: 'See how it works',
    cmdNote: '— connect agents directly',

    howTitle: 'How it works',
    howDesc: 'No complex setup — just upload your files',
    step1Title: 'Upload',
    step1Subtitle: 'Drag and drop your files',
    step1Desc:
      'PDF, DOCX, HWPX, PPTX, TXT, MD — upload up to 30 files at once.',
    step2Title: 'Analyze',
    step2Subtitle: 'AI automatically extracts knowledge graph',
    step2Desc:
      'Use your own API key or choose Cotext Model. Nodes, relations, and clusters are identified automatically.',
    step3Title: 'Connect',
    step3Subtitle: 'Connect the brain to your workspace',
    step3Desc:
      'The generated knowledge graph is auto-saved to your target workspace. Agents reference this brain for more accurate answers.',

    featTitle: 'Key Features',
    featDesc: 'Security, automation, queries, connections — all built in',
    feat1Title: 'BYOK (My API Key)',
    feat1Desc:
      'Connect directly to AI without going through our servers. Your API key stays safe in your browser only.',
    feat2Title: 'Auto-save',
    feat2Desc:
      'Generated knowledge graphs are automatically saved to your workspace. No manual export needed.',
    feat3Title: 'Ask the Brain (Think Mode)',
    feat3Desc:
      'Ask questions in natural language and get grounded answers with traceable source nodes.',
    feat4Title: 'Agent Connection',
    feat4Desc:
      'AI agents like Cursor and Windsurf access your workspace brain directly via MCP protocol.',

    ctaSectionTitle: 'Create your own second brain today',
    ctaSectionBtn: 'Start MindSync',
    ctaSectionLink: 'Also explore Cotext workspaces',

    // ── Build paths section ──
    buildTitle: 'Three ways to build your knowledge graph',
    buildDesc: 'Local repo · Cotext workspace · file upload — pick the one that fits',

    pathALabel: 'Local + npx',
    pathATitle: 'Scaffold a repo on your machine',
    pathADesc: "If you have the repo cloned locally, one command sets up the wiki structure plus the push-time auto-compile. IDE agents like Claude Code & Codex auto-read CLAUDE.md.",
    pathACmd: 'npx cotext init',
    pathANote: '※ Every push triggers the workflow to regenerate .cotext/neural.json',

    pathBLabel: 'Cotext 1-click',
    pathBTitle: 'Set it up from the browser',
    pathBDesc: 'No local clone needed. Open the workspace, click "Set up wiki" in the sidebar — all seed files + workflow yml land in one GitHub commit.',
    pathBCmd: 'Workspace → Set up wiki',
    pathBNote: '※ Non-destructive — skips files that already exist',

    pathCLabel: 'Studio upload',
    pathCTitle: 'AI extracts directly from files',
    pathCDesc: 'Skip the wiki layer entirely — drop PDFs/DOCX/PPTs and an LLM extracts nodes, edges, and clusters and merges them into the workspace graph.',
    pathCCmd: 'MindSync Studio → drop files',
    pathCNote: '※ Same .cotext/neural.json the wiki path produces',

    structureTitle: 'What gets created',
    structureDesc: 'Repo structure + auto-compile workflow + graph (after first push)',

    cmdsTitle: 'npm commands at a glance',
    cmdInit: 'Seed structure files + workflow + first compile',
    cmdCompile: 'Recompile wiki markdown → knowledge graph',
    cmdCheck: 'Check whether the graph is stale (CI/lint)',
    cmdEnrich: 'LLM-inferred semantic edges (BYOK)',
    cmdCopy: 'Copy',

    footerText: 'MindSync is part of ',
    footerLink: 'Cotext',
  },
};

export default function MindSyncLandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const c = CONTENT[language === 'ko' ? 'ko' : 'en'];
  const howRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText('npx @cotext/mcp start');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Per-command copy state for the cheatsheet.
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const scrollToHow = () => {
    howRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const cycleTheme = () =>
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');

  return (
    <div className="msl-page">
      {/* ── Top-right controls ── */}
      <div className="msl-top-controls">
        <button
          className="icon-button"
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: '0.8rem' }}
          onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
          title="Toggle Language"
        >
          {language === 'en' ? 'A' : '한'}
        </button>
        <button className="icon-button" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label="Toggle theme">
          {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
        </button>
      </div>
      {/* ── Hero Section ── */}
      <section className="msl-hero">
        {/* Background strands */}
        <div className="msl-hero-strands">
          <Strands
            colors={['#3b9eff', '#7C3AED', '#06B6D4']}
            count={4}
            speed={0.3}
            amplitude={1.2}
            thickness={0.5}
            glow={3}
            taper={2}
            intensity={0.5}
            scale={1.8}
            opacity={0.7}
          />
        </div>

        {/* Content overlay */}
        <div className="msl-hero-overlay">
          <span className="msl-eyebrow">
            <Brain size={14} weight="fill" /> {c.eyebrow}
          </span>

          <h1>
            {c.heroH1a}
            <span className="msl-grad">{c.heroH1b}</span>
          </h1>

          <p>{c.heroSub}</p>

          <div className="msl-hero-cta">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/mindsync/studio')}
            >
              {c.ctaPrimary} <ArrowRight size={18} />
            </button>
            <button className="btn btn-ghost btn-lg" onClick={scrollToHow}>
              <ArrowDown size={18} /> {c.ctaGhost}
            </button>
          </div>
          
          <div className="msl-cmd-box">
            <span className="msl-cmd-prompt">$</span>
            <code className="msl-cmd-text">npx @cotext/mcp start</code>
            <button className="msl-cmd-copy" onClick={handleCopy}>
              {copied ? 'COPIED' : 'COPY'}
            </button>
            <span className="msl-cmd-note">{c.cmdNote}</span>
          </div>
        </div>
      </section>

      {/* ── Section 1: How it Works ── */}
      <section ref={howRef} className="msl-section" id="how-it-works">
        <h2 className="msl-section-title">{c.howTitle}</h2>
        <p className="msl-section-desc">{c.howDesc}</p>

        <div className="msl-steps">
          {/* Step 1 */}
          <div className="msl-step">
            <div className="msl-step-icon">
              <FileArrowUp size={28} />
            </div>
            <div className="msl-step-num">1</div>
            <h3>{c.step1Title}</h3>
            <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              {c.step1Subtitle}
            </p>
            <p>{c.step1Desc}</p>
          </div>

          {/* Step 2 */}
          <div className="msl-step">
            <div className="msl-step-icon">
              <Lightning size={28} />
            </div>
            <div className="msl-step-num">2</div>
            <h3>{c.step2Title}</h3>
            <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              {c.step2Subtitle}
            </p>
            <p>{c.step2Desc}</p>
          </div>

          {/* Step 3 */}
          <div className="msl-step">
            <div className="msl-step-icon">
              <Graph size={28} />
            </div>
            <div className="msl-step-num">3</div>
            <h3>{c.step3Title}</h3>
            <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              {c.step3Subtitle}
            </p>
            <p>{c.step3Desc}</p>
          </div>
        </div>
      </section>

      {/* ── Section 1.5: Build your knowledge graph (3 paths) ── */}
      <section className="msl-section msl-build">
        <h2 className="msl-section-title">{c.buildTitle}</h2>
        <p className="msl-section-desc">{c.buildDesc}</p>

        <div className="msl-paths">
          {/* Path A — Local + npx */}
          <div className="msl-path msl-path-a">
            <div className="msl-path-head">
              <Terminal size={20} />
              <span className="msl-path-label">A · {c.pathALabel}</span>
            </div>
            <h3>{c.pathATitle}</h3>
            <p>{c.pathADesc}</p>
            <div className="msl-path-cmd">
              <code>{c.pathACmd}</code>
              <button onClick={() => copyCmd(c.pathACmd)} aria-label="copy">
                {copiedCmd === c.pathACmd ? <Check size={12} weight="bold" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="msl-path-note">{c.pathANote}</p>
          </div>

          {/* Path B — Cotext 1-click */}
          <div className="msl-path msl-path-b">
            <div className="msl-path-head">
              <Sparkle size={20} weight="fill" />
              <span className="msl-path-label">B · {c.pathBLabel}</span>
            </div>
            <h3>{c.pathBTitle}</h3>
            <p>{c.pathBDesc}</p>
            <div className="msl-path-cmd msl-path-cmd-click">
              <span>{c.pathBCmd}</span>
              <ArrowRight size={12} />
            </div>
            <p className="msl-path-note">{c.pathBNote}</p>
          </div>

          {/* Path C — Studio upload */}
          <div className="msl-path msl-path-c">
            <div className="msl-path-head">
              <FileArrowUp size={20} />
              <span className="msl-path-label">C · {c.pathCLabel}</span>
            </div>
            <h3>{c.pathCTitle}</h3>
            <p>{c.pathCDesc}</p>
            <div className="msl-path-cmd msl-path-cmd-click">
              <span>{c.pathCCmd}</span>
              <ArrowRight size={12} />
            </div>
            <p className="msl-path-note">{c.pathCNote}</p>
          </div>
        </div>

        {/* Structure visualization */}
        <div className="msl-structure">
          <div className="msl-structure-head">
            <GitBranch size={16} />
            <strong>{c.structureTitle}</strong>
            <span>{c.structureDesc}</span>
          </div>
          <pre className="msl-structure-tree">
{`your-repo/
├── CLAUDE.md              ← AI agent operating rules
├── AGENTS.md              ← shared multi-agent contract
├── START_HERE.md          ← 1-min orientation
├── index.md  ·  log.md    ← wiki map + work log
├── AI-Sessions/
│   ├── raw/               ← immutable source material
│   ├── conversations/     ← session handoffs
│   └── wiki/              ← sources · concepts · decisions
│                            errors · projects · design · dev-tasks
├── prompts/               ← save · ingest · query · lint
├── .github/workflows/
│   └── neural-compile.yml ← auto-compile on every push
└── .cotext/               ← auto-generated (don't edit)
    ├── neural.json        ← canonical knowledge graph
    └── NEURAL_INDEX.md    ← human + MCP readable index`}
          </pre>
        </div>

        {/* Commands cheatsheet */}
        <div className="msl-cmds">
          <div className="msl-cmds-head">
            <Terminal size={14} /> <strong>{c.cmdsTitle}</strong>
          </div>
          <div className="msl-cmds-list">
            {[
              { cmd: 'npx cotext init', desc: c.cmdInit },
              { cmd: 'npx cotext compile', desc: c.cmdCompile },
              { cmd: 'npx cotext check', desc: c.cmdCheck },
              { cmd: 'npx cotext enrich', desc: c.cmdEnrich },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="msl-cmd-row">
                <code>{cmd}</code>
                <span className="msl-cmd-desc">{desc}</span>
                <button onClick={() => copyCmd(cmd)} title={c.cmdCopy} aria-label={c.cmdCopy}>
                  {copiedCmd === cmd ? <Check size={12} weight="bold" /> : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 2: Key Features ── */}
      <section className="msl-section">
        <h2 className="msl-section-title">{c.featTitle}</h2>
        <p className="msl-section-desc">{c.featDesc}</p>

        <div className="msl-features">
          {/* Feature 1 — BYOK */}
          <div className="msl-feature">
            <div className="msl-feature-icon">
              <Key size={22} />
            </div>
            <h3>{c.feat1Title}</h3>
            <p>{c.feat1Desc}</p>
          </div>

          {/* Feature 2 — Auto-save */}
          <div className="msl-feature">
            <div className="msl-feature-icon">
              <GitMerge size={22} />
            </div>
            <h3>{c.feat2Title}</h3>
            <p>{c.feat2Desc}</p>
          </div>

          {/* Feature 3 — Think Mode */}
          <div className="msl-feature">
            <div className="msl-feature-icon">
              <ChatText size={22} />
            </div>
            <h3>{c.feat3Title}</h3>
            <p>{c.feat3Desc}</p>
          </div>

          {/* Feature 4 — Agent Connection */}
          <div className="msl-feature">
            <div className="msl-feature-icon">
              <Robot size={22} />
            </div>
            <h3>{c.feat4Title}</h3>
            <p>{c.feat4Desc}</p>
          </div>
        </div>
      </section>

      {/* ── Section 3: Final CTA ── */}
      <section className="msl-cta">
        <div className="msl-cta-inner">
          <h2>{c.ctaSectionTitle}</h2>
          <div className="msl-cta-buttons">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/mindsync/studio')}
            >
              {c.ctaSectionBtn} <ArrowRight size={18} />
            </button>
          </div>
          <span
            className="msl-cta-link"
            onClick={() => navigate('/')}
          >
            {c.ctaSectionLink} <ArrowRight size={14} />
          </span>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="msl-footer">
        {c.footerText}
        <a onClick={() => navigate('/')}>
          {c.footerLink}
        </a>
      </footer>
    </div>
  );
}
