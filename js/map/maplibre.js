import { collection } from '../engine/geometry.js';
const empty = () => ({ type: 'FeatureCollection', features: [] });
const lngLat = ([lat, lng]) => [lng, lat];
const toBounds = ([west, south, east, north]) => [[west, south], [east, north]];

async function load() {
  if (window.maplibregl) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('MapLibre download timed out')); }, 8000);
    script.src = 'https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js';
    script.integrity = 'sha256-FSX5cSI9gfFp8EnxzlAIPm8WQ6prDqBxZlOlUNLVf8I=';
    script.crossOrigin = 'anonymous';
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('MapLibre could not load')); };
    document.head.append(script);
  });
}

export default async function createMapLibre(el, options, city) {
  await load();
  const initialBasemap = options.basemaps.find(b => b.id === options.defaultBasemap);
  const map = new window.maplibregl.Map({
    container: el, center: lngLat(city.center), zoom: options.zoom - 1,
    maxBounds: toBounds(city.bounds), renderWorldCopies: false,
    style: initialBasemap.style || { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2f2f7' } }] },
    attributionControl: false, dragRotate: false, pitchWithRotate: false,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('MapLibre startup timed out')); }, 8000);
      const cleanup = () => { clearTimeout(timer); map.off('style.load', ready); map.off('error', error); };
      const ready = () => { cleanup(); resolve(); };
      const error = e => { cleanup(); reject(e.error || new Error('MapLibre startup failed')); };
      map.on('style.load', ready); map.on('error', error);
    });
  } catch (error) { map.remove(); throw error; }
  map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  map.addControl(new window.maplibregl.AttributionControl({ compact: false }), 'bottom-right');
  map.addSource('parking', { type: 'geojson', data: empty() });
  const polygons = ['==', '$type', 'Polygon'];
  map.addLayer({ id: 'parking-areas-fill', type: 'fill', source: 'parking', filter: polygons, layout: { 'fill-sort-key': ['get', 'rank'] }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });
  map.addLayer({ id: 'parking-areas-outline', type: 'line', source: 'parking', filter: polygons, layout: { 'line-sort-key': ['get', 'rank'] }, paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
  map.addLayer({ id: 'parking-lines', type: 'line', source: 'parking', filter: ['==', '$type', 'LineString'], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 7 } });
  map.addLayer({ id: 'parking-points', type: 'circle', source: 'parking', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addSource('selection', { type: 'geojson', data: empty() });
  map.addLayer({ id: 'selection-outline', type: 'line', source: 'selection', filter: ['!=', '$type', 'Point'], paint: { 'line-color': '#1765cf', 'line-width': 4 } });
  map.addLayer({ id: 'selection-point', type: 'circle', source: 'selection', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#1765cf', 'circle-stroke-width': 3 } });
  map.addSource('user-location', { type: 'geojson', data: empty() });
  map.addLayer({ id: 'user-location', type: 'circle', source: 'user-location', paint: { 'circle-radius': 7, 'circle-color': '#0a84ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  let failed = false, onFailure = () => {}, currentBasemap = null, theme = 'light';
  const lost = event => { event.preventDefault(); if (!failed) { failed = true; onFailure(); } };
  map.getCanvas().addEventListener('webglcontextlost', lost);
  const resize = new ResizeObserver(() => map.resize());
  resize.observe(el);
  const applyTheme = () => {
    if (!initialBasemap.style) map.setPaintProperty('background', 'background-color', theme === 'dark' ? '#2c2c2e' : '#f2f2f7');
    if (map.getLayer('basemap')) {
      const dark = theme === 'dark' && currentBasemap === 'osm';
      map.setPaintProperty('basemap', 'raster-saturation', dark ? -0.6 : 0);
      map.setPaintProperty('basemap', 'raster-brightness-max', dark ? 0.5 : 1);
    }
  };
  function setBasemap(id) {
    const def = options.basemaps.find(b => b.id === id);
    if (!def) return false;
    if (currentBasemap === id) return true;
    if (def.style) {
      currentBasemap = id;
      el.dataset.basemap = id;
      return true;
    }
    if (map.getLayer('basemap')) map.removeLayer('basemap');
    if (map.getSource('basemap')) map.removeSource('basemap');
    const tiles = def.url.includes('{s}') ? ['a', 'b', 'c'].map(s => def.url.replace('{s}', s)) : [def.url];
    map.setMinZoom(Math.max(0, (def.minZoom ?? 0) - 1)); map.setMaxZoom(def.maxZoom - 1);
    map.addSource('basemap', { type: 'raster', tiles, tileSize: 256, minzoom: def.minZoom ?? 0, maxzoom: def.maxNativeZoom ?? def.maxZoom, attribution: def.attribution });
    map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' }, 'parking-areas-fill');
    currentBasemap = id; el.dataset.basemap = id; applyTheme();
    return true;
  }
  setBasemap(options.defaultBasemap);
  let features = empty(), selected = null;
  const updateSelection = () => map.getSource('selection').setData({ type: 'FeatureCollection', features: features.features.filter(f => f.id === selected) });
  const pointerListeners = [];
  return {
    setBasemap,
    setTheme(t) { theme = t; el.dataset.theme = t; applyTheme(); },
    render(items) {
      features = collection(items);
      map.getSource('parking').setData(features);
      updateSelection();
    },
    setSelection(id) { if (selected === id) return; selected = id; updateSelection(); },
    fitBounds(bounds) { map.fitBounds(toBounds(bounds), { padding: 40, maxZoom: 17, duration: 450 }); },
    setCity(next) {
      map.stop();
      map.setMaxBounds(null);
      map.jumpTo({ center: lngLat(next.center), zoom: options.zoom - 1 });
      map.setMaxBounds(toBounds(next.bounds));
    },
    getView() { const c = map.getCenter(); return { center: [c.lat, c.lng], zoom: map.getZoom() + 1 }; },
    setUserLocation(p, recenter) {
      map.getSource('user-location').setData(p ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }] } : empty());
      if (p && recenter) map.easeTo({ center: [p.lng, p.lat] });
    },
    onPointer(callback) {
      const listener = mapEvent => {
        const event = mapEvent.originalEvent;
        if (event.target.closest('.maplibregl-control-container')) return;
        const rect = el.getBoundingClientRect();
        const point = [event.clientX - rect.left, event.clientY - rect.top];
        const location = map.unproject(point), edge = map.unproject([point[0] + 14, point[1]]);
        callback({ lat: location.lat, lng: location.lng, x: event.clientX, y: event.clientY, tolM: location.distanceTo(edge), activate: true });
      };
      map.on('click', listener); pointerListeners.push(['click', listener]);
    },
    onFailure(callback) { onFailure = callback; },
    destroy() { resize.disconnect(); for (const [type, listener] of pointerListeners) map.off(type, listener); map.getCanvas().removeEventListener('webglcontextlost', lost); map.remove(); },
  };
}
