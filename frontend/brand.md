# Sawit Finance — Brand & Design System

Premium, institutional, calm — modelled on ondo.finance. Clean off-white/black
with a **green** brand accent (palm-oil / plantation green), rounded-geometric
type, cinematic photography, generous whitespace.

This document is kept in sync with what actually ships: `tailwind.config.ts`
(palette) and `src/app/layout.tsx` (typography) are the sources of truth.

## Palette

Source: `tailwind.config.ts`.

- Backgrounds: near-white `#FBFBFC` (`bg`), light grey `#F4F4F6` (`bg-2`), white cards (`card`)
- Lines: `#EAEAEC` (`line`) / `#E0E0E4` (`line-2`)
- Text: near-black `#0B0B0C` (`ink`), muted `#5B5D66` (`muted`), faint `#9A9CA4` (`faint`)
- Accent (green): `#1E7A4F` (`brand` DEFAULT), mid `#2E9E68` (`brand-mid`),
  bright `#34A86B` (`brand-bright`), tint `#E7F2EC` (`brand-tint`)
- Graphic accents: violet `#9B5DE5`, orange `#FB7A3C` (chart highlights, status dots)
- Primary buttons + top nav = **black** (`ink`) pill; green (`brand`) for links,
  eyebrows, active nav state, and keyboard focus rings.

## Typography

Source: `src/app/layout.tsx` (loaded via `next/font/google`).

- Display + sans body: **Space Grotesk** (rounded geometric grotesque) —
  CSS vars `--font-display` / `--font-sans`.
- Serif accents (editorial headings, pull quotes): **Fraunces**, normal and
  italic weights — CSS var `--font-serif`.
- Data / hashes / addresses: **JetBrains Mono**, tabular-nums — CSS var
  `--font-mono`.

Tailwind exposes these as `font-display`, `font-sans`, `font-serif`, and
`font-mono` (`tailwind.config.ts`).

## Motion

framer-motion-driven scroll reveals, count-up numbers, and a `fade-up`
keyframe animation (`tailwind.config.ts` → `keyframes.fade-up` /
`animation.fade-up`). Interactive elements use `focus-visible:ring-2
focus-visible:ring-brand` for keyboard-accessible focus states.

## Imagery

Aerial palm photography in `public/hero/`. Credit: T. R. Shankar Raman, CC BY-SA 4.0.
