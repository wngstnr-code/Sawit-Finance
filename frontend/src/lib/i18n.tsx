'use client';

// Sawit Finance — lightweight i18n. No routing/middleware: a single React context holds
// the active locale and exposes the matching dictionary. Choice persists in
// localStorage. First render is always 'en' (SSR-safe); the stored preference is
// applied in an effect after mount to avoid hydration mismatch.
import { createContext, useContext, useEffect, useState } from 'react';
import { dictionaries, type Dict, type Locale } from './dictionaries';

const STORAGE_KEY = 'sawit.locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dict;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'id') setLocaleState(stored);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore write failures (private mode, etc.)
    }
  };

  const value: LocaleContextValue = { locale, setLocale, t: dictionaries[locale] };
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
