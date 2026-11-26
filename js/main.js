import { CONFIG, PORTABLE_BASEMAP } from './config.js';
import { fetchCity } from './sources/index.js';
import { classifyAt, COLORS, nzNow } from './engine/status.js';
import { geometryOf, boundsOf, isArea, hitsAt, distanceTo } from './engine/geometry.js';
import { startRefresh } from './engine/refresh.js';
import { createMap } from './map/index.js';
import { nativeMapsUrl } from './map/native.js';
import { initTheme } from './ui/theme.js';
import { initLocation } from './ui/location.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const locations = $('#list');
const locationsToggle = locations.querySelector('summary');
const hiddenLayers = new Set();
try { const saved = JSON.parse(localStorage.getItem('parking-hidden-layers') || '[]'); if (Array.isArray(saved)) saved.forEach(id => hiddenLayers.add(id)); } catch {}
const definitions = new Map(CONFIG.cities.map(c => [c.id, c.layers.map(layer => ({
  ...layer, id: `${c.id}-${layer.id}`, layerId: layer.id, bounds: c.bounds,
  preference: c.id === 'auckland' ? layer.id : `${c.id}-${layer.id}`,
}))]));
const state = new Map([...definitions.values()].flat().map(d => [d.id, { status: 'idle', items: [], error: '', skipped: 0 }]));
const lastAttempts = new Map();
let city = CONFIG.cities[0], map = null, me = null, current = [], selected = null, details = null, listLimit = 100;
let revision = 0, rendered = '', inFlight = null;
const cityLayers = () => definitions.get(city.id);
const isEnabled = layer => !hiddenLayers.has(layer.preference);
initTheme($('#theme'), t => map?.setTheme(t));

const basemapSelect = $('#basemap');
const portable = location.protocol === 'file:' || document.documentElement.hasAttribute('data-portable-preview');
const mapOptions = portable ? { ...CONFIG.map, defaultBasemap: PORTABLE_BASEMAP.id, basemaps: [PORTABLE_BASEMAP] } : CONFIG.map;
basemapSelect.innerHTML = mapOptions.basemaps.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
let basemapId = mapOptions.defaultBasemap;
try { const saved = localStorage.getItem('parking-basemap'); if (mapOptions.basemaps.some(b => b.id === saved)) basemapId = saved; } catch {}
basemapSelect.value = basemapId;
basemapSelect.onchange = () => { if (!map?.setBasemap(basemapSelect.value)) return; try { localStorage.setItem('parking-basemap', basemapSelect.value); } catch {} };

$('#overlay-options').onchange = event => {
  const input = event.target;
  if (input.type !== 'checkbox') return;
  if (input.checked) hiddenLayers.delete(input.value); else hiddenLayers.add(input.value);
  try { localStorage.setItem('parking-hidden-layers', JSON.stringify([...hiddenLayers])); } catch {}
  listLimit = 100; clearDetails(); paint();
};
const citySelect = $('#cities');
citySelect.replaceChildren(...CONFIG.cities.map(c => new Option(c.name, c.id)));
function markCity() {
  citySelect.value = city.id;
  $('#overlay-options').innerHTML = '<legend>Visible parking layers</legend>' + cityLayers().map(l =>
    `<label><input type="checkbox" value="${esc(l.preference)}" ${isEnabled(l) ? 'checked' : ''}><span class="layer-swatch" style="background:${l.color}"></span><span>${esc(l.name)}</span><small data-count="${l.layerId}"></small></label>`).join('');
  const credits = city.layers.filter((layer, i) => city.layers.findIndex(l => l.credit === layer.credit) === i);
  $('.map-data-credit').innerHTML = credits.map(l =>
    `<a href="${esc(l.sourceUrl)}" aria-label="Parking data: ${esc(l.credit)}">${esc(l.shortCredit || l.credit)}</a>`).join('<span aria-hidden="true"> · </span>');
}
citySelect.onchange = () => {
  const next = CONFIG.cities.find(c => c.id === citySelect.value);
  if (!next || next === city) return;
  inFlight?.controller.abort();
  inFlight = null;
  city = next;
  listLimit = 100;
  clearDetails();
  markCity();
  map?.setCity(city);
  map?.setUserLocation(locationInCity(), false);
  paint();
  const lastAttempt = lastAttempts.get(city.id);
  if (!lastAttempt || Date.now() - lastAttempt >= CONFIG.refreshMs || cityLayers().some(d => state.get(d.id).status === 'loading')) load();
};
markCity();

function locationInCity() {
  const [west, south, east, north] = city.bounds;
  return me && me.lng >= west && me.lng <= east && me.lat >= south && me.lat <= north ? me : null;
}

function clearDetails() {
  const tip = $('#tip');
  if (tip.contains(document.activeElement)) locationsToggle.focus();
  details = null; selected = null; tip.hidden = true; map?.setSelection(null);
  document.querySelectorAll('.row[aria-pressed=true]').forEach(r => r.setAttribute('aria-pressed', 'false'));
}
function showDetails(items) {
  if (!items.length) { clearDetails(); return; }
  details = items;
  selected = items[0].id; map?.setSelection(selected);
  const tip = $('#tip');
  const closeFocused = document.activeElement === tip.querySelector('[data-close-tip]');
  tip.innerHTML = `<div class="tip-heading"><span>${items.length > 1 ? `${items.length} mapped features here` : 'Parking details'}</span><button type="button" data-close-tip aria-label="Close parking details">×</button></div>` + items.map(item => {
    const point = item.geometry.type === 'Point';
    const schedule = item.scheduleUrl ? ` · <a href="${esc(item.scheduleUrl)}" target="_blank" rel="noopener">Published charging hours</a>` : '';
    return `<section class="tip-feature"><b>${esc(item.name)}</b><p class="feature-label"><i style="background:${item.color}" aria-hidden="true"></i>${esc(item.label)}</p><p>${esc(item.info)}</p><p class="feature-source">Source: <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">${esc(item.credit)}</a>${schedule}</p>${point ? `<a href="${esc(nativeMapsUrl([item.geometry.coordinates[1], item.geometry.coordinates[0]], item.name))}">Open in Maps</a>` : ''}</section>`;
  }).join('');
  tip.hidden = false;
  if (closeFocused) tip.querySelector('[data-close-tip]').focus();
}
$('#tip').onclick = event => { if (event.target.closest('[data-close-tip]')) clearDetails(); };
for (const panel of document.querySelectorAll('[data-dock-panel]')) {
  panel.addEventListener('toggle', () => {
    if (panel.open && details) clearDetails();
  });
}
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.key !== 'Escape') return;
  if (!$('#tip').hidden) clearDetails();
  else if (locations.open) { locations.open = false; locationsToggle.focus(); }
});
function selectItem(id, keyboard = false) {
  const item = current.find(f => f.id === id); if (!item) return;
  locations.open = false;
  map?.fitBounds(item.bounds);
  showDetails([item]);
  document.querySelectorAll('.row').forEach(row => row.setAttribute('aria-pressed', row.dataset.id === id));
  if (keyboard) $('#tip [data-close-tip]').focus();
}
$('#parking-rows').onclick = event => {
  const row = event.target.closest('[data-id]'); if (row) selectItem(row.dataset.id, event.detail === 0);
  if (event.target.closest('[data-more]')) { listLimit += 100; paintList(); }
};
$('#source-status').onclick = event => { if (event.target.closest('[data-retry]')) load(true); };
locations.addEventListener('toggle', paintList);

function paintList() {
  if (!locations.open) return;
  const position = locationInCity();
  const rows = current.map(item => ({ item, distance: position ? distanceTo(item, position.lat, position.lng) : 0 })).sort((a, b) => a.distance - b.distance || a.item.name.localeCompare(b.item.name)).map(r => r.item);
  $('#parking-rows').innerHTML = rows.slice(0, listLimit).map(item => `<button type="button" class="row" data-id="${esc(item.id)}" aria-pressed="${item.id === selected}"><i style="background:${item.color}" aria-hidden="true"></i><span><b>${esc(item.name)}</b><small>${esc(item.label)}. ${esc(item.info)}</small></span></button>`).join('')
    + (rows.length > listLimit ? `<button type="button" class="more-rows" data-more>Show ${Math.min(100, rows.length - listLimit)} more (${rows.length - listLimit} remaining)</button>` : '')
    || `<p class="empty">${!cityLayers().some(isEnabled) ? 'All parking layers are hidden. Enable a layer under Options.' : 'No features loaded for the selected layers yet.'}</p>`;
}
function paintStatus() {
  const relevant = cityLayers();
  const pending = relevant.filter(d => ['idle', 'loading'].includes(state.get(d.id).status));
  const failures = relevant.filter(d => state.get(d.id).status === 'failed');
  const counts = { locations: 0, segments: 0, areas: 0 };
  for (const item of current) counts[item.geometry.type === 'Point' ? 'locations' : isArea(item.geometry) ? 'areas' : 'segments']++;
  const count = Object.entries(counts).filter(([, n]) => n).map(([label, n]) => `${n.toLocaleString('en-NZ')} ${label}`).join(' · ') || '0 features';
  const lastAttempt = lastAttempts.get(city.id);
  const time = lastAttempt ? `Updated ${lastAttempt.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })} NZ time` : '';
  $('#updated').textContent = `${pending.length ? `Loading ${pending.length} layers… · ` : failures.length ? `${failures.length} source(s) failed · ` : ''}${count}${time ? ' · ' + time : ''}`;
  $('#updated').title = $('#updated').textContent;
  const warnings = relevant.filter(d => state.get(d.id).skipped > 0);
  $('#source-status').hidden = !failures.length && !warnings.length;
  $('#source-status').innerHTML = failures.map(d => `<p><b>${esc(d.name)}</b>: ${esc(state.get(d.id).error)}${state.get(d.id).items.length ? ' Showing earlier data.' : ''}</p>`).join('') + warnings.map(d => `<p>${esc(d.name)}: ${state.get(d.id).skipped} ${state.get(d.id).skipped === 1 ? 'record has' : 'records have'} no drawable geometry and ${state.get(d.id).skipped === 1 ? 'is' : 'are'} omitted.</p>`).join('') + (failures.length ? '<button type="button" data-retry>Retry failed sources</button>' : '');
  for (const layer of relevant) {
    const { items, status, skipped } = state.get(layer.id);
    const count = items.length.toLocaleString('en-NZ');
    document.querySelector(`[data-count="${layer.layerId}"]`).textContent = status === 'failed' ? `${count} · failed`
      : pending.includes(layer) ? 'Loading…' : `${count}${skipped ? ` · ${skipped} omitted` : ''}`;
  }
}
function paint() {
  const now = nzNow(new Date(), city.id);
  current = cityLayers().filter(isEnabled).flatMap(d => state.get(d.id).items).map(item => {
    if (!item.kind && !item.rules) return item;
    const status = classifyAt(item, now);
    return { ...item, color: COLORS[status.color], label: status.label };
  }).sort((a, b) => a.rank - b.rank);
  const signature = `${revision}|${current.map(i => `${i.id}:${i.color}`).join(',')}`;
  if (map && signature !== rendered) { map.render(current); rendered = signature; }
  if (details) {
    const previous = details;
    const items = previous.map(item => current.find(i => i.id === item.id));
    if (!items[0]) clearDetails();
    else if (items.some((item, i) => !item || ['color', 'label', 'name', 'info', 'scheduleUrl'].some(key => item[key] !== previous[i][key]))) {
      showDetails(items.filter(Boolean));
    }
  }
  paintList(); paintStatus();
}
function load(onlyFailed = false) {
  if (inFlight) return inFlight.promise;
  const requested = cityLayers().filter(d => !onlyFailed || state.get(d.id).status === 'failed');
  if (!requested.length) return;
  const target = city;
  const controller = new AbortController();
  requested.forEach(d => { state.get(d.id).status = 'loading'; });
  paintStatus();
  const promise = Promise.allSettled(requested.map(async definition => {
    const record = state.get(definition.id);
    try {
      const result = await fetchCity(definition, controller.signal);
      if (controller.signal.aborted) return;
      record.skipped = result.skippedCount;
      record.items = result.items.map(item => {
        const geometry = geometryOf(item);
        const { layerId, color, rank, sourceUrl, credit } = definition;
        return { ...item, geometry, bounds: boundsOf(geometry), layerId, color, rank, sourceUrl, credit };
      });
      record.status = 'ready'; record.error = ''; revision++;
    } catch (error) {
      if (controller.signal.aborted) return;
      record.status = 'failed'; record.error = error.message || 'Download failed';
    }
    paint();
  })).finally(() => {
    if (controller.signal.aborted) return;
    lastAttempts.set(target.id, new Date());
    inFlight = null;
    paintStatus();
  });
  inFlight = { controller, promise };
  return promise;
}
initLocation($('#locate'), p => { const first = !me && p; me = p; map?.setUserLocation(locationInCity(), first); paintList(); });
startRefresh(load, paint, CONFIG.refreshMs);
const initialCity = city;
map = await createMap({ ...mapOptions, defaultBasemap: basemapId }, $('#map'), initialCity).catch(() => null);
if (map) {
  if (city !== initialCity) map.setCity(city);
  basemapSelect.disabled = mapOptions.basemaps.length < 2;
  map.setTheme(document.documentElement.dataset.theme);
  map.setUserLocation(locationInCity(), Boolean(me));
  map.onPointer(({ lat, lng, tolM, activate }) => {
    if (!activate) return;
    showDetails(hitsAt(current, lat, lng, tolM));
  });
  paint();
} else { $('#map').innerHTML = '<p class="note">The map could not load. The parking list is still available.</p>'; $('#renderer').textContent = 'Map unavailable'; }
