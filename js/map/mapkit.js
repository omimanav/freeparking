const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = no; document.head.append(s); });
const SPAN = () => new mapkit.CoordinateSpan(0.02, 0.02);

export default async function createMapKit(el, token, center) {
  await load('https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js');
  mapkit.init({ authorizationCallback: done => done(token) });
  const C = ([la, lo]) => new mapkit.Coordinate(la, lo);
  const map = new mapkit.Map(el);
  map.region = new mapkit.CoordinateRegion(C(center), SPAN());
  let pin = null;
  return {
    setTheme: t => { map.colorScheme = t === 'dark' ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light; },
    render(segs) {
      map.removeOverlays(map.overlays);
      map.addOverlays(segs.map(s => new mapkit.PolylineOverlay(s.coords.map(C),
        { style: new mapkit.Style({ lineWidth: 7, lineCap: 'round', strokeColor: s.color }) })));
    },
    flyTo: c => map.setRegionAnimated(new mapkit.CoordinateRegion(C(c), SPAN())),
    setUserLocation(p, recenter) {
      if (pin) { map.removeAnnotation(pin); pin = null; }
      if (!p) return;
      pin = new mapkit.MarkerAnnotation(C([p.lat, p.lng]), { color: '#0a84ff' });
      map.addAnnotation(pin);
      if (recenter) map.setCenterAnimated(C([p.lat, p.lng]));
    },
    onPointer(cb) {
      const f = e => {
        const c = map.convertPointOnPageToCoordinate(new DOMPoint(e.pageX, e.pageY));
        const tolM = map.region.span.latitudeDelta * 111320 / el.clientHeight * 14;
        cb({ lat: c.latitude, lng: c.longitude, x: e.clientX, y: e.clientY, tolM });
      };
      el.addEventListener('pointermove', f);
      el.addEventListener('pointerdown', f);
    },
  };
}
