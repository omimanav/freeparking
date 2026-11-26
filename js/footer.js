const openPanel = () => document.querySelector('[data-dock-panel][open]');

document.addEventListener('pointerdown', event => {
  const panel = openPanel();
  if (panel && !panel.contains(event.target)) panel.open = false;
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const panel = openPanel();
  if (!panel) return;
  const inner = panel.querySelector('details[open]');
  const toClose = inner || panel;
  toClose.open = false;
  toClose.querySelector('summary').focus();
  event.preventDefault();
});

document.querySelector('.about-toc')?.addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  event.currentTarget.closest('details').open = false;
});
