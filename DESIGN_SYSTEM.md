# LawLens — Design System

Reverse-engineered from the implementation, not from a spec deck. Every value below is traceable to
`src/index.css`, `src/App.tsx`, `src/components/DesktopLanding.tsx`, `src/components/DesktopWorkspace.tsx`
or `src/components/MobileFlow.tsx`. Where the shipped code disagrees with the intended design
(e.g. a 62px bar, an 18% dim), the **actual** value is documented and the deviation is called out in
[§8 Implementation notes](#8-implementation-notes--deviations).

---

## 1. Foundation

| Concern | Value | Source |
| --- | --- | --- |
| Framework | Tailwind v4 (`@import "tailwindcss"` + `@theme` block, no `tailwind.config.js`) | `src/index.css` |
| Token surface | CSS custom properties consumed as `bg-*` / `text-*` / `border-*` | `src/index.css` |
| Base font | `--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | `src/index.css` |
| App background | `#faf8ff` (surface) with `#131b2e` text, set on `html, body` | `src/index.css` |
| Scroll | `overscroll-behavior: none` on body; `no-scrollbar` and 6px `custom-scroll` utilities | `src/index.css` |
| Dark mode | `@custom-variant dark` declared but **no dark styling is shipped** — the product is light-only | `src/index.css` |

Theme language is Material-3-flavoured (surface-container ladder, `on-*` pairs, inverse tokens,
`*-fixed` / `*-fixed-dim` pairs), tinted as **Trust Indigo**.

---

## 2. Color tokens

All values are the literal hexes declared in `@theme`.

### 2.1 Primary — Trust Indigo

| Token | Hex | Usage |
| --- | --- | --- |
| `--color-primary` | `#0037b0` | Avatar fill, deep indigo text emphasis |
| `--color-on-primary` | `#ffffff` | Text/icons on primary |
| `--color-primary-container` | `#1d4ed8` | **The accent.** Every primary button, active pill, logo tile, focus ring, progress fill |
| `--color-on-primary-container` | `#cad3ff` | Text on container fills |
| `--color-primary-fixed` | `#dce1ff` | Pale indigo chips |
| `--color-primary-fixed-dim` | `#b7c4ff` | |
| `--color-inverse-primary` | `#b7c4ff` | |
| `--color-surface-tint` | `#2151da` | |

`#1d4ed8` is also hardcoded in `pulse-ring` keyframes and in the mobile telemetry laser
(`shadow-[0_0_12px_2px_#1d4ed8]`) — keep those in sync if the accent ever moves.

### 2.2 Surface ladder

| Token | Hex | Typical role |
| --- | --- | --- |
| `--color-surface` / `--color-background` | `#faf8ff` | Page canvas |
| `--color-surface-container-lowest` | `#ffffff` | Cards, sheets, sticky headers (`bg-white/95` is used equivalently in the workspace) |
| `--color-surface-container-low` | `#f2f3ff` | Inset panels, footer, tip cards |
| `--color-surface-container` | `#eaedff` | Segmented-control tracks, neutral chips |
| `--color-surface-container-high` | `#e2e7ff` | Hover state, active nav pill |
| `--color-surface-container-highest` | `#dae2fd` | Toggle tracks, progress rails, count badges |
| `--color-surface-variant` | `#dae2fd` | |
| `--color-on-surface` | `#131b2e` | Primary text |
| `--color-on-surface-variant` | `#434655` | Secondary text, captions |
| `--color-outline` | `#747686` | |
| `--color-outline-variant` | `#c4c5d7` | All hairline borders — always used with an opacity suffix: `/30`, `/40`, `/50`, `/60` |

Elevation is **shadow-only, never a border weight change**: `shadow-sm` → `shadow-md` on hover
(`hover:shadow-md transition-all`), hairline `border-outline-variant/40` on every card.

### 2.3 Severity triplet — critical / caution / safe

The severity palette is the single most important semantic system in the product. It is expressed as
**three coordinated tones**, not one color: a text tone, a tinted fill, and a border. Note that
critical/caution/safe use Tailwind's stock red/amber/emerald ramps rather than the M3
`error` / `tertiary` tokens — only `--color-error` is reused, for critical text.

| Severity | Text | Fill | Border | Chip |
| --- | --- | --- | --- | --- |
| **critical** | `text-error` `#ba1a1a` (or `text-red-*`) | `bg-red-50/35` | `border-red-300` | `bg-red-100 text-error` |
| **caution** | `text-amber-800` `#92400e` | `bg-amber-50/35` | `border-amber-300` | `bg-amber-100 text-amber-900` |
| **safe** | `text-emerald-800` `#065f46` (or `text-emerald-700`) | `bg-emerald-50/30` | `border-emerald-300` | `bg-emerald-100 text-emerald-900` |

Supporting tokens: `--color-error` `#ba1a1a`, `--color-on-error` `#ffffff`,
`--color-error-container` `#ffdad6`, `--color-on-error-container` `#93000a`,
`--color-tertiary` `#7f2500` (used for the "Unilateral Traps" warning micro-badge),
`--color-secondary-fixed` `#dce1ff` + `--color-on-secondary-fixed` `#03164d` (the "safe"/"AI"/"Local Vault"
neutral badges).

Band → color mapping is derived from the score in code, not sent by the API accent:

```
risk_score >= 75 → critical   (red)
risk_score >= 45 → caution    (amber)
otherwise        → safe       (emerald)
```
(`src/App.tsx` `hydrateAuditFromApiPayload`)

Critical clauses additionally get a `●` glyph prefix on their badge label; caution and safe do not.

---

## 3. Type scale

Three families, three jobs.

| Token | Stack | Job |
| --- | --- | --- |
| `--font-sans` | Inter → system | **All UI chrome.** Nav, buttons, labels, headings, metric numbers |
| `--font-serif` / `--font-contract-sheet` | Source Serif 4 → Georgia → Times | **Contract body only.** Reconstructed document text, clause text, stamp header. Signals "this is the legal artefact" |
| `--font-typewriter` | Courier Prime → Courier New | Declared for statute/stamp fidelity |
| `font-mono` (Tailwind default) | ui-monospace stack | What the components *actually* use for `line_ref`, OCR confidence, page numbers, file size, gate timings, key-value rows |

> **Deviation:** `--font-typewriter` (Courier Prime) is defined but never referenced by a component —
> every "typewriter" surface uses Tailwind's `font-mono` instead. See §8.

Observed scale (arbitrary-value utilities, `text-[Npx]/leading-[Mpx]`; there is no `--text-*` scale in
`@theme`, so these are the de-facto steps):

| Step | Size / leading | Where |
| --- | --- | --- |
| Display | `32px / 40px` bold, `tracking-[-0.02em]`, `text-balance` | Landing H1 |
| H2 | `22px / 28px` bold | Section headers ("One-Tap Evaluation Presets") |
| H3 | `18px / 24px` bold | Card titles, dropzone headline, mobile app-bar title |
| H4 | `17px / 23px` bold | Preset card titles |
| Body-lg | `16px / 25px` | Hero paragraph |
| Body | `15px` | Dropzone caption, mobile contract body (`font-serif`) |
| Body-sm | `14px` `leading-relaxed` | **Clause text in the reconstructed sheet — always `font-serif`** |
| Meta | `13px` `leading-[19px]` | Nav pills, card descriptions, footer |
| Caption | `12px` | Buttons (`text-xs`), dense labels |
| Micro | `11px` | Badges, compliance bar, chips — with `tabular-nums` for any number |
| Micro-mono | `10px` | `font-mono uppercase tracking-wider` — OCR confidence, stamp reg-line, gate timings |

Rules of thumb enforced by the code: numbers are always `tabular-nums`; statute/label microcopy is
uppercase with `tracking-wider`/`tracking-widest`; the only italic in the system is a verbatim quote
(`font-serif italic "…"`).

---

## 4. Spacing, radius, elevation

- `@theme` declares `--spacing-gutter`, `--spacing-margin`, `--spacing-space-xs|sm|md|lg|xl`
  (all `0.25–2rem`); components in practice use literal Tailwind spacing (`p-4`, `gap-2.5`, `py-6`).
- Layout gutters: landing `px-6`; workspace `px-4 lg:px-6`.
- Content rails: landing `max-w-[1440px]`; workspace header/controls `max-w-[1600px]`;
  reconstructed sheet `max-w-[680px]` (portrait page); report column `max-w-4xl` in Report mode.
- Radius ladder: `rounded` (2–4px, chips/tags) → `rounded-lg` (8px, buttons, icon tiles) →
  `rounded-xl` (12px, cards) → `rounded-2xl` (16px, dropzone, mobile cards) → `rounded-3xl`
  (24px, mobile hero card) → `rounded-full` (badges, toggles, avatars).
- Icon tiles are consistently `w-8 h-8` / `w-9 h-9` (+ `w-7 h-7` for compact rows) with a
  `bg-primary-container text-white` or `bg-surface-container text-primary-container` pair.

---

## 5. Responsive architecture — the 900px split

This is a **hard product fork**, not a responsive reflow. Two entirely different component trees.

```
width < 900px   →  <MobileFlow/>     mobile feed: M1 Analyze → M2 Photo → M3 Telemetry
                                     → M4 Report → M5 Inspector → M6 Negotiate → M7 Voice
                                     → M8 Vault, driven by 4-tab bottom nav
width >= 900px  →  <DesktopLanding/> → <DesktopWorkspace/>
```

- Implemented in JS, not CSS: `window.innerWidth < 900` in the `useState` initializer
  (`src/App.tsx:90`) and in the resize listener (`src/App.tsx:126`), feeding
  `useMobileUI = isMobileViewport || manualMobilePreview` (`src/App.tsx:140`).
- A manual override exists in both directions: the desktop header's "Mobile Flow" button sets
  `manualMobilePreview`, which renders `MobileFlow` inside a **390px** frame with a dark exit strip
  ("Mobile Preview Mode (390px) → Back to Desktop"); the mobile side can hand back via
  `onSwitchToDesktop`.
- Because the fork is JS-only, Tailwind's own `md:` (768px) / `lg:` (1024px) breakpoints still apply
  *inside* each tree. Inside the desktop workspace that means the 48/52 split only reaches its full
  two-column form at `lg` (1024px); between 900–1023px the workspace header is visible but the panes
  stack and the Report/Split/Original Scan toggle stays hidden (`hidden lg:flex`).

### 5.1 Desktop workspace layout

Header (sticky, `z-40`) has two rows: a 56px (`h-14`) primary bar and a
`py-1.5` statutory/PII compliance strip (`bg-surface-container-low/80`). Body is
`flex-1 flex overflow-hidden`, i.e. **the panes scroll independently, the page does not**.

Three modes, toggled in the header:

| Mode | Left pane | Right pane |
| --- | --- | --- |
| **Report** | `w-full max-w-4xl mx-auto` | hidden |
| **Split** | `w-full lg:w-[48%]` | `hidden lg:flex lg:w-[52%]` |
| **Original Scan** | hidden | `w-full` |

So Split is a **48 / 52** horizontal split: 48% = analysis (3-tab: Findings / Key Terms / Way Out +
Negotiate), 52% = the contract sheet (Reconstructed / Original toggle). Left pane carries
`border-r border-outline-variant/40`; both panes are `h-full overflow-hidden` with their own scroll
containers.

### 5.2 Mobile layout

- Top app bar: `sticky top-0 z-30 h-14` = **56px**, `bg-white/95 backdrop-blur-md`,
  `border-b border-outline-variant/30`.
- Bottom nav: `sticky bottom-0 z-30`, `grid grid-cols-4`, `px-2 py-1.5`, `pb-safe`, each tab
  `min-h-[48px]` with a 20px icon over an `11px` label; active = `text-primary-container
  bg-surface-container-low` + `filled` icon.
- Touch targets are floored at `min-h-[40px]`/`[44px]`/`[46px]`/`[48px]` depending on row density —
  primary CTAs are `min-h-[48px]` (Apple HIG minimum), secondary are 44px.
- Content scrolls in `flex-1 min-h-0 overflow-y-auto pb-6`, separate from the sticky chrome.
- Safe areas: `.pt-safe` / `.pb-safe` wrappers around `env(safe-area-inset-*)`.

> **Deviation:** the reference spec calls for a **62px** sticky mobile bar; the shipped header is
> `h-14` = **56px** (`src/components/MobileFlow.tsx:421`). Everything anchored to it — the toast at
> `top-20`, the sticky sub-header, the clause scroll offset — assumes 56px. See §8.1.

---

## 6. Signature interactions

### 6.1 Clause dim-to-55% + pulse ring — **driven by audio playback**

The desktop reconstructed sheet is a bidirectional synchronised viewer: **audio playback and the Q&A jump
drive the clause state**, and clicking a finding jumps into the same state.

```
idle                       → opacity-100, no outline
some clause is active      → the *other* clauses drop to opacity-55  (`transition-all duration-300`)
the target clause          → .clause-active-pulse
```

The canonical source of the active clause is the **audio walkthrough**, not the click. When a narration item
for a clause starts (`onItemStart` from the clause playlist, which resolves each item through
`audioSync.playRegionalSpeech`), the viewer:

1. **scrolls** the reconstructed sheet to that clause (`scrollIntoView({behavior:'smooth', block:'center'})`),
2. **pulses** it via `.clause-active-pulse`, and
3. **dims** every other clause to `opacity-55` for as long as that item is the active one.

The same state machine is entered by `jumpToClause()` — which is what a finding's "Jump to Clause in Sheet →"
button, a grounded Q&A answer, and a Q&A history item all call. That helper sets `activeClauseId`, scrolls
after a 60 ms tick (so the sheet view has swapped back to `reconstructed` first), and clears the state after
2600 ms so the sheet settles while the user reads (`src/components/DesktopWorkspace.tsx:142-155`).

```css
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0    rgba(29, 78, 216, 0.55); }
  70%  { box-shadow: 0 0 0 12px rgba(29, 78, 216, 0);    }
  100% { box-shadow: 0 0 0 0    rgba(29, 78, 216, 0);    }
}
.clause-active-pulse {
  animation: pulse-ring 1.1s ease-out 2;   /* exactly two rings, then settle */
  outline: 3px solid #1d4ed8 !important;
}
```

The pulse is intentionally finite (2 iterations, 1.1s each, so **1.1s × 2** total) so the sheet stops moving
while the user reads; the 3px solid outline persists as the resting "you are here" marker. Class application
lives in `src/components/DesktopWorkspace.tsx:1295-1296`:

```tsx
const isActive   = activeClauseId === clause.clause_id;
const isAnyActive = activeClauseId !== null;
… isActive ? 'clause-active-pulse' : isAnyActive ? 'opacity-55' : 'opacity-100'
```

> **Deviation:** the spec describes dimming to **18%**; the code dims to **55%** (`opacity-55`).
> 55% is the shipped, readable value — 18% would push `#131b2e` text below AA on `#faf8ff`.

> **Audio drives the state:** the clause playlist (`src/utils/audioPlaylist.ts`,
> `buildClausePlaylist` / `playClausePlaylist`) is wired into both shells. On desktop,
> `onItemStart` calls `jumpToClause(item.clauseId)`, so playing the walkthrough scrolls the sheet,
> pulses the active clause, and dims the rest to 55% as each item advances. Mobile uses the same
> playlist but only sets the focused clause and scrolls it into view — it has no pulse/dim, so the
> desktop is the reference implementation. A finding's Listen button plays a one-item playlist and
> therefore pulses the same way.

Supporting affordances in the same viewer: OCR tokens are underlined-dashed buttons
(`bg-blue-100 text-primary-container` → `bg-emerald-100 text-emerald-900` once verified) that open a
"OCR confidence / mark verified" popover; the sheet zooms via a `transform: scale(zoomPct/100)` on an
`origin-top` wrapper with `aria-label="Zoom in"` / `"Zoom out"` controls.

### 6.2 Telemetry stepper (mobile "Neural X-Ray")

Four gates, advanced by `telemetryStage` (1→4), each rendered as a card that changes state:

| Stage | Gate | Shown time/value |
| --- | --- | --- |
| 1 | Blur & Legibility Check | `0.2s` |
| 2 | Local PII Shield Masking | `0.4s` |
| 3 | Rule Pack Match | `{match_pct}%` |
| 4 | Legal Grounding Check | `Done` while running, `Queued` before |

Visual grammar: `telemetryStage > step` → `bg-primary-container text-white` + `check` icon;
`=== step` → `border-primary-container shadow-xs`, `bg-blue-100 text-primary-container
animate-pulse`, `sync` icon; `< step` → `bg-surface-container text-on-surface-variant`,
`hourglass_empty`. Progress is a `Math.min(100, stage * 25)` percent label plus a 6px
(`h-1.5`) `bg-surface-container-highest` rail filled with `bg-primary-container`
`transition-all duration-300`. Above the gates sits a "laser" card: two severity slabs
(red lock-in, amber fee) separated by a 2px `bg-primary-container` line with a
`0 0 12px 2px #1d4ed8` glow, captioned `DEEP CLAUSE EXTRACTION` / `● Live OCR Sync`.

The same 4-stage ticker drives the desktop scanning modal (`Stage {n} / 4`, `duration-300` bar).

---

## 7. Accessibility

### 7.1 Reduced motion

`src/index.css` ships a global opt-out, applied to the whole animation vocabulary rather than
per-component:

```css
@media (prefers-reduced-motion: reduce) {
  .clause-active-pulse,
  .animate-ping,
  .animate-pulse,
  .animate-spin { animation: none !important; }
}
```

Consequence: under reduced motion the pulse is suppressed but the 3px indigo outline remains, so the
active clause is still identifiable by position and border alone — the cue degrades, it does not
disappear.

**Standing rule for new work: any new animation must be added to this list.** The opt-out is a manual
allow-list of selectors, not a blanket rule, so a new keyframe or a new `animate-*` utility added to a
component is *not* covered by default — it will keep moving for users who asked it not to. When you add
`.clause-pulse-v2`, `animate-bounce`, a framer-motion spring, a `scrollIntoView({behavior:'smooth'})` that
runs unprompted, or a CSS `transition` that carries meaning rather than polish, add its selector here in the
same commit. Check with `npm run dev` + OS "Reduce motion" on, and expect a `prefers-reduced-motion` block in
any third-party widget you drop in.

### 7.2 Labels and semantics present in the build

- `aria-label="Main navigation"` on the desktop nav; `aria-label="Mobile navigation"` on the bottom tab bar.
- Language switcher is a real radio group: `role="radiogroup"` on the container,
  `role="radio"` + `aria-checked` on each option, with a `check_circle` icon for the active one.
- Icon-only controls are labelled: `"Go back"`, `"Open Vault"`, `"Security & Privacy Shield"`,
  `"Zoom in"`, `"Zoom out"`, `"Play audio walkthrough"` / `"Pause audio walkthrough"`,
  `"Close Ask this contract drawer"`, `"Close summary banner"`, `"Open Mobile QR"`,
  `"Way Out Timeline exit month"` (range input), `"Mobile Way Out Slider"`,
  `"1-Tap Privacy Blackout"`.
- The PII auto-mask switch is a visually-hidden native checkbox (`sr-only peer`) with
  `aria-label="Auto-mask Aadhaar, Phone and PAN on-device"` — keyboard operable, custom track/slider
  drawn with `peer-checked:` pseudo-elements.
- Toggles and tabs are `<button type="button">`; the file input is a hidden native input triggered by
  a button, so it stays in the tab order.
- Live regions: the global toast **is** an announced live region — `role="status"` + `aria-live="polite"`
  (`src/App.tsx:567-570`), so status feedback (`fixed top-20 right-6 z-[60]`, `shadow-xl`, auto-dismissed
  after 3200 ms) is spoken by screen readers without stealing focus. Because the node is mounted only while
  `toastMsg` is set, each message is a fresh insertion into the politeness queue, which is what makes it
  announce reliably. Copy is short and self-contained by design; do not turn it into a multi-step status log
  without revisiting the 3200 ms window.
- Colour is never the *only* carrier: severity also appears as a text label, a `●` prefix, an icon
  (`warning` / `check_circle` / `error`) and a numeric score, and `risk_band_label` is plain text.

### 7.3 Known gaps

1. Clause cards in the reconstructed sheet are `<div>`s with no `tabIndex`, `role`, or
   `aria-current` — the dim/pulse state is a purely visual affordance and is not reachable by keyboard
   or announced to a screen reader. Add `role="article"` + `tabIndex={0}` + `aria-current` when the
   viewer is next touched. This matters more now that the pulse is audio-driven: a sighted user gets a
   scroll + ring + dim sequence for each narrated clause, and a screen-reader user gets the audio alone
   with no announcement of *which* clause is speaking.
2. **New animations must be registered in the reduced-motion list (§7.1).** The `@media
   (prefers-reduced-motion: reduce)` block is an explicit selector list, so it silently misses anything added
   later — a new keyframe, a new `animate-*` class, a motion-library spring. Treat "add the selector" as part
   of the definition of done for animation work, not as a follow-up.
3. Some 10–11px caps microcopy (`text-[10px] uppercase tracking-wider`) is below comfortable minimums;
   it is decorative/labelling only and always paired with a larger label.
4. The 900px JS fork means resizing across the threshold fully remounts the tree — in-progress scroll
   position and local viewer state (zoom, selected clause) are lost.
5. The audio-driven clause state (scroll + pulse + dim) has no keyboard equivalent — there is no
   previous/next-clause control, so a keyboard-only or screen-reader user cannot step through the walkthrough
   the way a listener does. A `role="group"` with arrow-key clause navigation would close both this and
   gap 1.

---

## 8. Implementation notes / deviations

Recorded so the doc and the code do not silently diverge. **The code is the source of truth.**

| Item | Spec / intent | Shipped | Where |
| --- | --- | --- | --- |
| **Mobile sticky bar height** | 62px | **56px** (`h-14`) | `MobileFlow.tsx:421` (`sticky top-0 z-30 h-14`) |
| **Clause pulse duration** | "1100ms" | **1.1s × 2** iterations = **2.2s** total, then the 3px outline persists | `src/index.css:122-125` |
| Clause dim when another is active | 18% | **55%** (`opacity-55`) | `DesktopWorkspace.tsx:1296` |
| Clause state trigger | audio `onplay` per clause | `onItemStart` per clause is intended; today `jumpToClause()` fires it per user action (§6.1) | `DesktopWorkspace.tsx:142-155`, `:1296` |
| Typewriter family | Courier Prime (`--font-typewriter`) | Token defined, unused; components use Tailwind `font-mono` | `index.css` vs `*.tsx` |
| Breakpoint | 900px fork | 900px in JS; Tailwind `lg`=1024px still gates the 48/52 split | `App.tsx:90,126`; `DesktopWorkspace.tsx:586,1110` |
| Toast live region | (previously a gap) | **Shipped**: `role="status"` + `aria-live="polite"` | `App.tsx:567-570` |
| Dark mode | variant declared | no dark styles | `index.css` |
| `--spacing-space-*` tokens | declared | components use literal spacing utilities | `index.css` |

### 8.1 The two values people get wrong

**Mobile sticky bar height — 56px, not 62px.** The reference spec asks for a 62px app bar; the shipped header
is `h-14` = 56px (`MobileFlow.tsx:421`). Everything anchored to it assumes 56px: the toast sits at `top-20`
(80px = 56 + 24 of breathing room), the sticky sub-header row stacks directly beneath, and the content rail
uses `pb-6` above the 4-tab bottom nav. If the bar is ever bumped to 62px, the toast offset and any
`scroll-margin-top` used for clause scrolling must move with it, or content will slide under the chrome. The
56px figure also matters for it being *above* the 44px minimum touch target with room for a 20px icon and an
11px label.

**Clause pulse — 1.1s × 2, i.e. 2.2s of motion.** `.clause-active-pulse` runs `pulse-ring 1.1s ease-out 2`
(`src/index.css:122-125`): two rings, 2.2 seconds of movement in total, then the animation stops and only the
`3px solid #1d4ed8` outline remains. Read that as a hard budget, not a starting point. The two-iteration cap
is what keeps the sheet still while someone reads, and it is what makes the audio-driven version tolerable
when several clauses are narrated in sequence. Lengthening it, looping it, or adding an `animate-pulse`
alongside it would push a reading surface past the point of comfort — and any change here must land in the
reduced-motion selector list (§7.1) in the same edit.

---

## 9. Quick reference for new surfaces

```
Page canvas      bg-surface text-on-surface  (#faf8ff / #131b2e)
Card             bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm
                 hover:shadow-md transition-all
Primary action   bg-primary-container text-on-primary rounded-lg text-xs font-semibold shadow-sm
                 hover:opacity-95   (min-h-[48px] on mobile)
Secondary action bg-surface-container-high text-on-surface hover:bg-surface-container-highest
Segmented control p-1 rounded-xl bg-surface-container border border-outline-variant/40
                 active: bg-white text-primary-container font-bold shadow-xs
Micro label      text-[11px] font-semibold uppercase tracking-wider text-primary-container
Number           tabular-nums
Contract text    font-serif text-[14px] leading-relaxed text-on-surface
Statute/OCR ref  font-mono text-[10px] text-on-surface-variant
Critical         text-error   bg-red-50/35    border-red-300
Caution          text-amber-800 bg-amber-50/35 border-amber-300
Safe             text-emerald-800 bg-emerald-50/30 border-emerald-300
Focus/active     outline: 3px solid #1d4ed8 + pulse-ring 1.1s ×2 = 2.2s of motion
                 (animation suppressed under prefers-reduced-motion; outline stays)
Mobile app bar   h-14 = 56px (NOT 62px) — re-check toast top-20 + scroll offsets if you change it
New animation    MUST be appended to the §7.1 reduced-motion selector list in the same commit
```

## 10. Related docs

- [`docs/audit-result.schema.md`](docs/audit-result.schema.md) — the `/api/*` response contracts this UI
  renders, including `injection_defense`, the success-path `completeness` envelope, `panIndiaOnly`, and the
  server-recomputed `rupee_exposure_inr`.
- [`docs/phase-status.md`](docs/phase-status.md) — what is actually built, phase by phase.
- [`todo.md`](todo.md) — the build checklist with a `## Status (auto-verified)` header at the top.
