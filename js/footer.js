const details = document.querySelector('#map-info');
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
    document.querySelector('#map-settings').open = false;
  }
});
document.addEventListener('pointerdown', event => {
  if (mobile.matches && details.open && !details.contains(event.target)) details.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobile.matches && details.open) {
    details.open = false;
    summary.focus();
  }
});
