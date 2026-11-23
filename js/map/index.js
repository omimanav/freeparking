export async function createMap(options, el, city) {
  let active = null, switching = null, segments = [], position = null, pointer = null, selected = null, pendingBounds = null;
  let theme = document.documentElement.dataset.theme || 'light', basemap = options.defaultBasemap;
  const status = document.querySelector('#renderer');
  const mark = name => {
    el.dataset.renderer = name;
    if (status) status.textContent = name === 'maplibre' ? 'MapLibre' : el.dataset.basemap ? 'Leaflet backup' : 'Leaflet backup · street map unavailable';
  };
  async function fallback() {
    const previousCity = city;
    const view = active?.getView?.() || { center: city.center, zoom: options.zoom };
    active?.destroy(); active = null; el.replaceChildren(); delete el.dataset.basemap;
    const createLeaflet = (await import('./openstreetmap.js')).default;
    active = await createLeaflet(el, { ...options, viewZoom: view.zoom, viewCenter: view.center, defaultBasemap: basemap }, previousCity);
    if (city !== previousCity) active.setCity(city);
    active.setTheme(theme); active.render(segments); active.setSelection(selected); active.setUserLocation(position, false);
    if (pendingBounds) { active.fitBounds(pendingBounds); pendingBounds = null; }
    if (pointer) active.onPointer(pointer);
    mark('leaflet');
  }
  try {
    active = await (await import('./maplibre.js')).default(el, options, city);
    mark('maplibre');
    active.onFailure(() => {
      if (switching) return;
      switching = fallback().catch(() => {
        el.dataset.renderer = 'unavailable';
        if (status) status.textContent = 'Map unavailable';
        el.innerHTML = '<p class="note">The map could not load. The parking list is still available.</p>';
      });
    });
  } catch (error) {
    console.warn('MapLibre could not start; using Leaflet.', error);
    await fallback();
  }
  return {
    setBasemap(id) { if (!options.basemaps.some(b => b.id === id)) return false; basemap = id; return active?.setBasemap(id) ?? true; },
    setTheme(t) { theme = t; active?.setTheme(t); },
    render(data) { segments = data; active?.render(data); },
    setSelection(id) { selected = id; active?.setSelection(id); },
    fitBounds(bounds) { if (active) active.fitBounds(bounds); else pendingBounds = bounds; },
    setUserLocation(p, recenter) { position = p; active?.setUserLocation(p, recenter); },
    setCity(next) { city = next; pendingBounds = null; active?.setCity(next); },
    onPointer(callback) { pointer = callback; active?.onPointer(callback); },
  };
}
