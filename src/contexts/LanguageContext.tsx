import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, getDefaultLanguage } from '../lib/i18n';
import type { Language } from '../lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('cotext-lang') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ko')) {
      setLanguageState(savedLang);
    } else {
      setLanguageState(getDefaultLanguage());
    }
  }, []);

  const setLanguage = (lang: Language) => {
    localStorage.setItem('cotext-lang', lang);
    setLanguageState(lang);
  };

  const t = (key: keyof typeof translations['en']): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
