const KEY = 'parking-theme';
const mq = matchMedia('(prefers-color-scheme: dark)');
const nextMode = { auto: 'light', light: 'dark', dark: 'auto' };

export function initTheme(button, onChange) {
  let mode = 'auto';
  try {
    const saved = localStorage.getItem(KEY);
    if (Object.hasOwn(nextMode, saved)) mode = saved;
  } catch {}

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  button.replaceChildren(icon);

  const apply = () => {
    const theme = mode === 'auto' ? (mq.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = theme;
    button.dataset.mode = mode;
    icon.textContent = theme === 'dark' ? '☾' : '☀︎';
    const current = mode === 'auto' ? `System theme (${theme})` : `${theme === 'dark' ? 'Dark' : 'Light'} theme`;
    const label = `${current}. Switch to ${nextMode[mode] === 'auto' ? 'system' : nextMode[mode]} theme`;
    button.setAttribute('aria-label', label);
    button.title = label;
    onChange(theme);
  };

  button.onclick = () => {
    mode = nextMode[mode];
    try { localStorage.setItem(KEY, mode); } catch {}
    apply();
  };
  mq.addEventListener('change', apply);
  apply();
}
