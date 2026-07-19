'use client';

// EN | ID segmented toggle. Two variants tune colors for their backdrop:
//   'nav'    — sits over the dark hero (light text)
//   'footer' — sits on the light footer (ink text)
import { useLocale } from '@/lib/i18n';
import type { Locale } from '@/lib/dictionaries';

const OPTIONS: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'id', label: 'ID' },
];

export default function LangToggle({ variant = 'nav' }: { variant?: 'nav' | 'footer' }) {
  const { locale, setLocale } = useLocale();

  const wrap =
    variant === 'nav'
      ? 'border-white/20 bg-white/5'
      : 'border-line bg-transparent';
  const activeCls =
    variant === 'nav' ? 'bg-white text-ink' : 'bg-ink text-white';
  const idleCls =
    variant === 'nav'
      ? 'text-white/70 hover:text-white'
      : 'text-muted hover:text-ink';

  // nav variant stretches to its sibling's height (parent is items-stretch);
  // footer variant keeps a natural compact height.
  return (
    <div
      role="group"
      aria-label="Language / Bahasa"
      className={`inline-flex items-stretch rounded-lg border p-0.5 ${wrap}`}
    >
      {OPTIONS.map(({ code, label }) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`flex items-center justify-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
              variant === 'footer' ? 'py-1' : ''
            } ${active ? activeCls : idleCls}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
