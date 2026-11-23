import { collection, isArea } from '../engine/geometry.js';
const toBounds = ([west, south, east, north]) => [[south, west], [north, east]];
const load = () => new Promise((resolve, reject) => {
  if (window.L) { resolve(); return; }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  script.crossOrigin = 'anonymous';
  const timer = setTimeout(() => { script.remove(); reject(new Error('Leaflet download timed out')); }, 8000);
  script.onload = () => { clearTimeout(timer); resolve(); };
  script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Could not load the map library.')); };
  document.head.append(script);
});

export default async function createOpenStreetMap(el, options, city) {
  await load();
  const L = window.L;
  const map = L.map(el, { maxBoundsViscosity: 1 });
  let basemap = null, cityBounds = L.latLngBounds(toBounds(city.bounds));
  let basemapId = options.defaultBasemap;
  function setZoomLimit() {
    const definition = options.basemaps.find(b => b.id === basemapId);
    map.setMinZoom(Math.max(definition?.minZoom ?? 0, map.getBoundsZoom(cityBounds, true)));
  }
  map.setMaxBounds(cityBounds);
  setZoomLimit();
  map.setView(options.viewCenter ?? city.center, options.viewZoom ?? options.zoom);
  function setBasemap(id, force = false) {
    const definition = options.basemaps.find(b => b.id === id);
    if (!definition?.url) return false;
    if (!force && el.dataset.basemap === id) return true;
    basemapId = id;
    const { url, name, ...tileOptions } = definition;
    const next = L.tileLayer(url, { ...tileOptions, bounds: cityBounds, noWrap: true });
    setZoomLimit();
    map.setMaxZoom(definition.maxZoom);
    if (basemap) map.removeLayer(basemap);
    basemap = next.addTo(map);
    el.dataset.basemap = id;
    return true;
  }
  setBasemap(options.defaultBasemap);
  const parking = L.layerGroup().addTo(map);
  const layers = new Map();
  let selected = null;
  const style = item => ({ color: item.id === selected ? '#1765cf' : item.color, weight: item.id === selected ? 4 : isArea(item.geometry) ? 2 : 7, fillColor: item.color, fillOpacity: 0.2 });
  let pin = null;
  const resize = new ResizeObserver(() => { map.invalidateSize({ pan: false }); setZoomLimit(); });
  resize.observe(el);

  const pointerListeners = [];
  return {
    setBasemap,
    getView() { const c = map.getCenter(); return { center: [c.lat, c.lng], zoom: map.getZoom() }; },
    destroy() { resize.disconnect(); for (const [type, listener] of pointerListeners) map.off(type, listener); map.remove(); },
    setTheme: theme => { el.dataset.theme = theme; },
    render(items) {
      const wanted = new Set(items.map(item => item.id));
      for (const [id, entry] of layers) if (!wanted.has(id)) { parking.removeLayer(entry.layer); layers.delete(id); }
      for (const item of items) {
        let entry = layers.get(item.id);
        if (!entry || entry.geometry !== item.geometry) {
          if (entry) parking.removeLayer(entry.layer);
          const layer = L.geoJSON(collection([item]), {
            style: () => style(item),
            pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 2, fillColor: item.color, fillOpacity: 1 }),
          }).addTo(parking);
          entry = { layer, geometry: item.geometry }; layers.set(item.id, entry);
        }
        entry.item = item;
        if (item.geometry.type === 'Point') entry.layer.setStyle({ color: item.id === selected ? '#1765cf' : '#fff', weight: item.id === selected ? 4 : 2, fillColor: item.color });
        else entry.layer.setStyle(style(item));
        entry.layer.bringToFront();
      }
      pin?.bringToFront();
    },
    setSelection(id) {
      if (selected === id) return;
      const changed = [selected, id];
      selected = id;
      for (const key of changed) {
        const entry = layers.get(key); if (!entry) continue;
        if (entry.item.geometry.type === 'Point') entry.layer.setStyle({ color: entry.item.id === id ? '#1765cf' : '#fff', weight: entry.item.id === id ? 4 : 2 });
        else entry.layer.setStyle(style(entry.item));
      }
    },
    fitBounds(bounds) { map.fitBounds(toBounds(bounds), { padding: [40, 40], maxZoom: 18 }); },
    setCity(next) {
      map.stop();
      if (basemap) { map.removeLayer(basemap); basemap = null; }
      cityBounds = L.latLngBounds(toBounds(next.bounds));
      map.setMaxBounds(null);
      setZoomLimit();
      map.setView(next.center, options.zoom, { animate: false });
      map.setMaxBounds(cityBounds);
      setBasemap(basemapId, true);
    },
    setUserLocation(position, recenter) {
      if (pin) { map.removeLayer(pin); pin = null; }
      if (!position) return;
      const coords = [position.lat, position.lng];
      pin = L.circleMarker(coords, {
        radius: 7, color: '#fff', weight: 3, fillColor: '#0a84ff', fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      if (recenter) map.panTo(coords);
    },
    onPointer(callback) {
      const onPointer = mapEvent => {
        const event = mapEvent.originalEvent;
        if (event.target.closest('.leaflet-control')) return;
        const point = map.mouseEventToContainerPoint(event);
        const location = map.containerPointToLatLng(point);
        const edge = map.containerPointToLatLng(point.add([14, 0]));
        callback({
          lat: location.lat, lng: location.lng,
          x: event.clientX, y: event.clientY,
          tolM: map.distance(location, edge), activate: true,
        });
      };
      map.on('click', onPointer); pointerListeners.push(['click', onPointer]);
    },
  };
}
