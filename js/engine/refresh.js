export function startRefresh(load, repaint, ms) {
  let last = 0;
  const run = async () => { last = Date.now(); await load(); };
  run();
  setInterval(run, ms);
  setInterval(repaint, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    repaint();
    if (Date.now() - last > ms) run();
  });
}
