// Modes: auto (follows device) -> light -> dark.
const KEY = 'parking-theme', mq = matchMedia('(prefers-color-scheme: dark)');
export function initTheme(btn, onChange) {
  let mode = 'auto';
  try { mode = localStorage.getItem(KEY) || 'auto'; } catch {}
  const apply = () => {
    const t = mode === 'auto' ? (mq.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = t;
    btn.textContent = { auto: 'Auto', light: 'Light', dark: 'Dark' }[mode];
    onChange(t);
  };
  btn.onclick = () => { mode = { auto: 'light', light: 'dark', dark: 'auto' }[mode]; try { localStorage.setItem(KEY, mode); } catch {} apply(); };
  mq.addEventListener('change', apply);
  apply();
}
