---
name: Consumer Legal Clarity
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#4d5b94'
  on-secondary: '#ffffff'
  secondary-container: '#b0befe'
  on-secondary-container: '#3d4c83'
  tertiary: '#7f2500'
  on-tertiary: '#ffffff'
  tertiary-container: '#a73400'
  on-tertiary-container: '#ffc9b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b7c4ff'
  on-secondary-fixed: '#03164d'
  on-secondary-fixed-variant: '#35437b'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 25px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 23px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  contract-sheet:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 27px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is built for a mobile contract analyzer app serving everyday consumers—renters, freelancers, and small business owners—who need to understand complex legal agreements without feeling overwhelmed. The emotional goal is calm authority: the interface should feel like a sharp, trustworthy legal aide that cuts through dense jargon with surgical precision.

The visual language blends **Minimalism** with **Corporate / Modern** structure. It relies on generous whitespace, high-contrast typography, and crisp hairline borders to create zero-clutter reading and scanning environments. Decorative flourishes are avoided in favor of functional clarity, with color reserved strictly for primary actions and semantic risk indicators.

## Colors

The palette defaults to **Light mode**, pairing **Trust Indigo** (`#1D4ED8` primary, `#1E40AF` hover, `#FFFFFF` text on primary) with a **Tailwind Slate** neutral scale:
- **Canvas Background:** `#F8FAFC`
- **Elevated Surface:** `#FFFFFF`
- **Primary Text:** `#0F172A`
- **Secondary Text:** `#475569`
- **Hairline Border:** `#E2E8F0`

### Semantic Severity Triplets (Background / Border / Text)
Color is used purposefully to classify contract clauses and OCR confidence:
- **Critical Risk:** `#FEF2F2` / `#FECACA` / `#B91C1C`
- **Caution:** `#FFFBEB` / `#FDE68A` / `#B45309`
- **Safe:** `#ECFDF5` / `#A7F3D0` / `#047857`
- **OCR Verify:** `#F0F9FF` / `#7DD3FC` / `#0369A1` (paired with a dashed underline on inline text to signal low-confidence scans)

## Typography

The typography system separates **app chrome** from **reconstructed contract sheets** to help users distinguish between interface controls and legal source text:
- **App Chrome:** Uses a clean sans-serif (`Inter` or the native System UI sans-serif stack) for navigation, summaries, and controls. Body copy sits at `15px–16px` with a `1.55` line height for effortless mobile scanning.
- **Reconstructed Contract Sheets:** Uses a classic serif (`Source Serif 4` or `Georgia, 'Times New Roman', serif`) at `16px` with a generous `1.7` line height (`27px`), preserving the familiar cadence of printed legal documents while remaining legible on mobile screens.

## Layout & Spacing

The layout uses a **fluid 4-column mobile grid** with `16px` (`1rem`) gutters and `16px` (`1rem`) outer canvas margins, expanding to an 8-column grid on tablets and a centered `768px` max-width reading column on desktop viewports.

Spacing follows a strict `4px` (`0.25rem`) base rhythm:
- **Mobile (< 640px):** Single-column stacked cards with `1rem` horizontal margins and `1rem` vertical gaps between summary blocks.
- **Tablet & Desktop (>= 640px):** Side-by-side split view pairing the reconstructed contract sheet on the left with the clause risk breakdown on the right, separated by `1.5rem` (`space-lg`) gutters.

## Elevation & Depth

Visual hierarchy is achieved through **low-contrast outlines** and **tonal surface layering** rather than heavy drop shadows.
- **Primary Canvas:** `#F8FAFC` forms the base layer.
- **Cards & Sheets:** `#FFFFFF` surfaces sit directly on the canvas, defined by a crisp `1px solid #E2E8F0` border.
- **Interactive Focus & Motion:** State changes use crisp `0.18s ease` transitions. When a user taps a risk summary to jump to a clause in the contract sheet, the target paragraph triggers a `1100ms` `clause-pulse` highlight animation to orient the reader without jarring layout shifts.

## Shapes

The design system uses a **Rounded (`2`)** shape language (`0.5rem` / `8px` base radius) to soften theclinical feel of legal analysis while maintaining structural precision:
- **Buttons, Inputs & Chips:** `0.5rem` (`8px`) radius.
- **Cards & Contract Sheets:** `1rem` (`16px` / `rounded-lg`) radius.
- **Bottom Sheets & Modals:** `1.5rem` (`24px` / `rounded-xl`) top-corner radius.

## Components

- **Buttons:** Primary actions use `#1D4ED8` (`--primary`) with `#FFFFFF` text, transitioning to `#1E40AF` on hover over `0.18s ease`. Secondary actions use `#FFFFFF` backgrounds with `1px solid #E2E8F0` borders and `#0F172A` text.
- **Severity Chips:** Compact pills (`0.5rem` radius, `label-md` typography) styled with the exact bg/border/text triplets for Critical, Caution, Safe, and OCR Verify states.
- **Clause Cards:** `#FFFFFF` surface, `1px solid #E2E8F0` border, `1rem` padding, and a left-aligned severity chip above the plain-English summary.
- **OCR Verify Inline Highlights:** Rendered with `#F0F9FF` background, `#0369A1` text, and a `1px dashed #7DD3FC` underline to invite tap-to-verify correction.
- **Lists, Checkboxes & Radio Buttons:** Clean `1px solid #E2E8F0` dividers between list items; checkboxes and radios use `#1D4ED8` fill when selected with `0.18s ease` state transitions.
- **Input Fields:** `#FFFFFF` background, `1px solid #E2E8F0` border, `#0F172A` text, focusing to a `1px solid #1D4ED8` border.