// Button only appears if the device has geolocation. Needs HTTPS (or localhost).
export function initLocation(btn, onFix) {
  if (!('geolocation' in navigator)) return;
  btn.hidden = false;
  let id = null;
  btn.onclick = () => {
    if (id !== null) { navigator.geolocation.clearWatch(id); id = null; btn.classList.remove('on'); onFix(null); return; }
    btn.classList.add('on');
    id = navigator.geolocation.watchPosition(p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { id = null; btn.classList.remove('on'); btn.textContent = 'Location blocked'; },
      { enableHighAccuracy: true });
  };
}
