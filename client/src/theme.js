// Colour theme: 'system' (Calm, or Dark if the device prefers dark), 'calm', 'contrast' or 'dark'.
const KEY = 'phi.theme';
export const THEMES = [
  ['system', 'Auto'], ['calm', 'Calm'], ['contrast', 'High contrast'], ['dark', 'Dark'],
];
export function getTheme() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}
export function applyTheme(t = getTheme()) {
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
  const bg = getComputedStyle(el).getPropertyValue('--nav-bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#1E3A47');
}
export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
  applyTheme(t);
}
