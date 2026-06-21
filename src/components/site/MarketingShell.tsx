import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Monitor, Moon, Sun } from '@phosphor-icons/react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import '../../styles/landing.css';

type ShellCopy = {
  home: string;
  pricing: string;
  terms: string;
  privacy: string;
  refunds: string;
  launch: string;
  footer: string;
};

const SHELL_COPY: Record<'en' | 'ko', ShellCopy> = {
  en: {
    home: 'Home',
    pricing: 'Pricing',
    terms: 'Terms',
    privacy: 'Privacy',
    refunds: 'Refunds',
    launch: 'Launch',
    footer: 'One shared knowledge pool for you, your team, and your agents.',
  },
  ko: {
    home: '홈',
    pricing: '가격',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    refunds: '환불정책',
    launch: '시작하기',
    footer: '나와 팀, 그리고 에이전트를 위한 하나의 공동 지식망.',
  },
};

interface MarketingShellProps {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  ctaTitle?: string;
  ctaDescription?: string;
}

export default function MarketingShell({
  eyebrow,
  title,
  description,
  children,
  ctaTitle,
  ctaDescription,
}: MarketingShellProps) {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const copy = SHELL_COPY[language === 'ko' ? 'ko' : 'en'];

  const cycleTheme = () =>
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');

  return (
    <div className="landing">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link className="lp-brand" to="/">
            <span className="lp-brand-mark">:&gt;</span>
            <span className="lp-brand-text">Cotext</span>
          </Link>
          <div className="lp-nav-links lp-site-nav-links">
            <Link to="/">{copy.home}</Link>
            <Link to="/pricing">{copy.pricing}</Link>
            <Link to="/terms">{copy.terms}</Link>
            <Link to="/privacy">{copy.privacy}</Link>
            <Link to="/refund-policy">{copy.refunds}</Link>
          </div>
          <div className="lp-nav-right">
            <button
              className="icon-button font-medium text-sm"
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
              title="Toggle Language"
            >
              {language === 'en' ? 'A' : '가'}
            </button>
            <button className="icon-button" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label="Toggle theme">
              {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
            </button>
            <button className="lp-btn lp-btn-primary" onClick={() => navigate('/login')}>
              {copy.launch} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      <header className="lp-site-hero lp-inner">
        {eyebrow ? <span className="lp-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        <p className="lp-hero-sub">{description}</p>
      </header>

      <main className="lp-site-main lp-inner">
        {children}
      </main>

      {ctaTitle && ctaDescription ? (
        <section className="lp-inner">
          <div className="lp-cta lp-site-cta">
            <h2>{ctaTitle}</h2>
            <p>{ctaDescription}</p>
            <div className="lp-hero-cta" style={{ justifyContent: 'center', marginTop: '2rem' }}>
              <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => navigate('/login')}>
                {copy.launch} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="lp-footer">
        <div className="lp-footer-inner lp-inner">
          <Link className="lp-brand" to="/">
            <span className="lp-brand-mark">:&gt;</span>
            <span className="lp-brand-text">Cotext</span>
          </Link>
          <div className="lp-footer-links lp-site-footer-links">
            <Link to="/pricing">{copy.pricing}</Link>
            <Link to="/terms">{copy.terms}</Link>
            <Link to="/privacy">{copy.privacy}</Link>
            <Link to="/refund-policy">{copy.refunds}</Link>
          </div>
          <p className="lp-footer-copy">{copy.footer}</p>
        </div>
      </footer>
    </div>
  );
}
