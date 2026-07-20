import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-white shadow-pill hover:bg-ink/90 hover:-translate-y-0.5',
  secondary:
    'bg-white text-ink border border-line-2 hover:border-ink/30',
  ghost: 'text-ink/80 hover:text-ink hover:bg-black/[0.04]',
  dark: 'bg-white text-ink hover:-translate-y-0.5',
};

const sizes: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-[15px]',
};

type Props = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
} & Omit<ComponentProps<'button'>, 'className'>;

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  className = '',
  ...rest
}: Props) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  if (href) {
    const external = href.startsWith('http');
    return (
      <Link
        href={href}
        className={cls}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
