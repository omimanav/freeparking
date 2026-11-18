export function startRefresh(load, repaint, ms) {
  let last = 0;
  const run = async () => { last = Date.now(); await load(); };
  run();
  setInterval(run, ms);        // re-fetch source every 15 min
  setInterval(repaint, 60000); // re-colour every minute as free/paid windows change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    repaint();
    if (Date.now() - last > ms) run();
  });
}
