/**
 * Smooth scrolling is a motion preference, but `scrollIntoView({ behavior: 'smooth' })`
 * ignores `prefers-reduced-motion` — unlike CSS transitions, it is not covered by the
 * allow-list media query in `index.css`. Callers must ask instead.
 */
export const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
