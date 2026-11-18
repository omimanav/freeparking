const details = document.querySelector('#map-settings');
const summary = details.querySelector('summary');
const mobile = matchMedia('(max-width: 700px)');
const syncLayout = () => {
  details.open = !mobile.matches;
  details.dataset.ready = 'true';
};
syncLayout();
mobile.addEventListener('change', syncLayout);
details.addEventListener('toggle', () => {
  if (mobile.matches && details.open) {
    document.querySelector('#tip').hidden = true;
    document.querySelector('#map-info').open = false;
  }
});
document.addEventListener('pointerdown', event => {
  const overlays = document.querySelector('#overlay-control');
  if (overlays.open && !overlays.contains(event.target)) overlays.open = false;
  if (mobile.matches && details.open && !details.contains(event.target)) details.open = false;
});
document.addEventListener('keydown', event => {
  const overlays = document.querySelector('#overlay-control');
  if (event.key === 'Escape' && overlays.open) { overlays.open = false; overlays.querySelector('summary').focus(); return; }
  if (event.key === 'Escape' && mobile.matches && details.open) {
    details.open = false;
    summary.focus();
  }
});
