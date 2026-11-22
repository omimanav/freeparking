import { CONFIG, PORTABLE_BASEMAP } from './config.js';
import { fetchCity } from './sources/index.js';
import { AREA_SOURCES } from './sources/areas.js';
import { classifyAt, COLORS, nzNow } from './engine/status.js';
import { geometryOf, boundsOf, isArea, hitsAt, distanceTo } from './engine/geometry.js';
import { startRefresh } from './engine/refresh.js';
import { createMap } from './map/index.js';
import { nativeMapsUrl } from './map/native.js';
import { initTheme } from './ui/theme.js';
import { initLocation } from './ui/location.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const layers = [{ id: 'locations', name: 'Parking location points', color: '#1a73e8', rank: 3 }, ...AREA_SOURCES];
const enabled = new Set(layers.map(l => l.id));
try { const hidden = JSON.parse(localStorage.getItem('parking-hidden-layers') || '[]'); if (Array.isArray(hidden)) hidden.forEach(id => enabled.delete(id)); } catch {}
const definitions = CONFIG.cities.flatMap(c => [
  { id: `${c.id}-locations`, cityId: c.id, layerId: 'locations', name: 'AT parking locations', source: c.source, credit: 'Auckland Transport', sourceUrl: c.source.url },
  ...(c.id === 'auckland' ? AREA_SOURCES.map(a => ({ ...a, id: `${c.id}-${a.id}`, cityId: c.id, layerId: a.id })) : []),
]);
const state = new Map(definitions.map(d => [d.id, { status: 'loading', items: [], error: '', skipped: 0, updated: null }]));
let city = CONFIG.cities[0], map = null, me = null, current = [], selected = null, details = null, listLimit = 100;
let revision = 0, rendered = '', inFlight = null, lastAttempt = null;
initTheme($('#theme'), t => map?.setTheme(t));

const basemapSelect = $('#basemap');
const portable = location.protocol === 'file:' || document.documentElement.hasAttribute('data-portable-preview');
const mapOptions = portable ? { ...CONFIG.map, defaultBasemap: PORTABLE_BASEMAP.id, basemaps: [PORTABLE_BASEMAP] } : CONFIG.map;
basemapSelect.innerHTML = mapOptions.basemaps.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
let basemapId = mapOptions.defaultBasemap;
try { const saved = localStorage.getItem('parking-basemap'); if (mapOptions.basemaps.some(b => b.id === saved)) basemapId = saved; } catch {}
basemapSelect.value = basemapId;
basemapSelect.onchange = () => { if (!map?.setBasemap(basemapSelect.value)) return; try { localStorage.setItem('parking-basemap', basemapSelect.value); } catch {} };

$('#overlay-options').innerHTML = layers.map(l => `<label><input type="checkbox" value="${l.id}" ${enabled.has(l.id) ? 'checked' : ''}><span class="layer-swatch" style="background:${l.color}"></span><span>${esc(l.name)}</span><small data-count="${l.id}">Loading…</small></label>`).join('');
$('#overlay-options').onchange = event => {
  const input = event.target;
  if (input.type !== 'checkbox') return;
  if (input.checked) enabled.add(input.value); else enabled.delete(input.value);
  try { localStorage.setItem('parking-hidden-layers', JSON.stringify(layers.filter(l => !enabled.has(l.id)).map(l => l.id))); } catch {}
  listLimit = 100; clearDetails(); paint();
};
$('#cities').innerHTML = CONFIG.cities.map(c => `<button data-id="${c.id}">${esc(c.name)}</button>`).join('');
const markCity = () => document.querySelectorAll('#cities button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === city.id));
$('#cities').onclick = event => { const next = CONFIG.cities.find(c => c.id === event.target.dataset.id); if (!next) return; city = next; listLimit = 100; clearDetails(); markCity(); map?.flyTo(city.center); paint(); };
markCity();

function clearDetails() { details = null; selected = null; $('#tip').hidden = true; map?.setSelection(null); document.querySelectorAll('.row[aria-pressed=true]').forEach(r => r.setAttribute('aria-pressed', 'false')); }
function showDetails(items, x, y) {
  if (!items.length) { clearDetails(); return; }
  details = { items, x, y };
  selected = items[0].id; map?.setSelection(selected);
  const tip = $('#tip');
  const closeFocused = document.activeElement === tip.querySelector('[data-close-tip]');
  tip.innerHTML = `<div class="tip-heading"><span>${items.length > 1 ? `${items.length} mapped features here` : 'Parking details'}</span><button type="button" data-close-tip aria-label="Close parking details">×</button></div>` + items.map(item => {
    const point = item.geometry.type === 'Point';
    const schedule = item.scheduleUrl ? ` · <a href="${esc(item.scheduleUrl)}" target="_blank" rel="noopener">Published charging hours</a>` : '';
    return `<section class="tip-feature"><b>${esc(item.name)}</b><p class="feature-label"><i style="background:${item.color}" aria-hidden="true"></i>${esc(item.label)}</p><p>${esc(item.info)}</p><p class="feature-source">Source: <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">${esc(item.credit)}</a>${schedule}</p>${point ? `<a href="${esc(nativeMapsUrl([item.geometry.coordinates[1], item.geometry.coordinates[0]], item.name))}">Open in Maps</a>` : ''}</section>`;
  }).join('');
  tip.hidden = false;
  const width = tip.offsetWidth, height = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - width - 8))}px`;
  tip.style.top = `${Math.max(8, Math.min(y + 14, innerHeight - height - 8))}px`;
  if (closeFocused) tip.querySelector('[data-close-tip]').focus();
}
$('#tip').onclick = event => { if (event.target.closest('[data-close-tip]')) clearDetails(); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#tip').hidden) clearDetails(); });
function selectItem(id, keyboard = false) {
  const item = current.find(f => f.id === id); if (!item) return;
  map?.fitBounds(item.bounds);
  const rect = $('#map').getBoundingClientRect();
  showDetails([item], rect.left + rect.width / 2, rect.top + 20);
  document.querySelectorAll('.row').forEach(row => row.setAttribute('aria-pressed', row.dataset.id === id));
  if (keyboard) $('#tip [data-close-tip]').focus();
}
$('#parking-rows').onclick = event => {
  const row = event.target.closest('[data-id]'); if (row) selectItem(row.dataset.id, event.detail === 0);
  if (event.target.closest('[data-more]')) { listLimit += 100; paintList(); }
};
$('#source-status').onclick = event => { if (event.target.closest('[data-retry]')) load(true); };

function paintList() {
  const rows = [...current].map(item => ({ item, distance: me ? distanceTo(item, me.lat, me.lng) : 0 })).sort((a, b) => a.distance - b.distance || a.item.name.localeCompare(b.item.name)).map(r => r.item);
  $('#parking-rows').innerHTML = rows.slice(0, listLimit).map(item => `<button type="button" class="row" data-id="${esc(item.id)}" aria-pressed="${item.id === selected}"><i style="background:${item.color}" aria-hidden="true"></i><span><b>${esc(item.name)}</b><small>${esc(item.label)}. ${esc(item.info)}</small></span></button>`).join('')
    + (rows.length > listLimit ? `<button type="button" class="more-rows" data-more>Show ${Math.min(100, rows.length - listLimit)} more (${rows.length - listLimit} remaining)</button>` : '')
    || `<p class="empty">${!enabled.size ? 'All parking layers are hidden. Enable a layer in Map options.' : 'No features loaded for the selected layers yet.'}</p>`;
}
function paintStatus() {
  const relevant = definitions.filter(d => d.cityId === city.id);
  const pending = relevant.filter(d => state.get(d.id).status === 'loading');
  const failures = relevant.filter(d => state.get(d.id).status === 'failed');
  const areas = current.filter(i => isArea(i.geometry)).length;
  const count = `${current.length - areas} locations · ${areas.toLocaleString('en-NZ')} areas`;
  const time = lastAttempt ? `Updated ${lastAttempt.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })} NZ time` : '';
  $('#updated').textContent = `${pending.length ? `Loading ${pending.length} layers… · ` : failures.length ? `${failures.length} source(s) failed · ` : ''}${count}${time ? ' · ' + time : ''}`;
  $('#updated').title = $('#updated').textContent;
  const warnings = relevant.filter(d => state.get(d.id).skipped > 0);
  $('#source-status').hidden = !failures.length && !warnings.length;
  $('#source-status').innerHTML = failures.map(d => `<p><b>${esc(d.name)}</b>: ${esc(state.get(d.id).error)}${state.get(d.id).items.length ? ' Showing earlier data.' : ''}</p>`).join('') + warnings.map(d => `<p>${esc(d.name)}: ${state.get(d.id).skipped} ${state.get(d.id).skipped === 1 ? 'record has' : 'records have'} no drawable geometry and ${state.get(d.id).skipped === 1 ? 'is' : 'are'} omitted.</p>`).join('') + (failures.length ? '<button type="button" data-retry>Retry failed sources</button>' : '');
  for (const layer of layers) {
    const defs = relevant.filter(d => d.layerId === layer.id);
    const count = defs.reduce((n, d) => n + state.get(d.id).items.length, 0);
    const failed = defs.some(d => state.get(d.id).status === 'failed');
    const loading = defs.some(d => state.get(d.id).status === 'loading');
    const skipped = defs.reduce((n, d) => n + state.get(d.id).skipped, 0);
    document.querySelector(`[data-count="${layer.id}"]`).textContent = loading ? 'Loading…' : failed ? `${count} · failed` : `${count.toLocaleString('en-NZ')}${skipped ? ` · ${skipped} omitted` : ''}`;
  }
}
function paint() {
  const now = nzNow();
  current = definitions.filter(d => d.cityId === city.id && enabled.has(d.layerId)).flatMap(d => state.get(d.id).items).map(item => {
    if (!item.kind && item.layerId !== 'locations') return item;
    const status = classifyAt(item, now);
    return { ...item, color: COLORS[status.color], label: status.label };
  }).sort((a, b) => a.rank - b.rank);
  const signature = `${revision}|${current.map(i => `${i.id}:${i.color}`).join(',')}`;
  if (map && signature !== rendered) { map.render(current); rendered = signature; }
  if (details) {
    const previous = details.items;
    const items = previous.map(item => current.find(i => i.id === item.id));
    if (!items[0]) clearDetails();
    else if (items.some((item, i) => !item || ['color', 'label', 'name', 'info', 'scheduleUrl'].some(key => item[key] !== previous[i][key]))) {
      showDetails(items.filter(Boolean), details.x, details.y);
    }
  }
  paintList(); paintStatus();
}
function load(onlyFailed = false) {
  if (inFlight) return inFlight;
  const requested = definitions.filter(d => !onlyFailed || state.get(d.id).status === 'failed');
  requested.forEach(d => { state.get(d.id).status = 'loading'; });
  paintStatus();
  inFlight = Promise.allSettled(requested.map(async definition => {
    const record = state.get(definition.id);
    try {
      const result = await fetchCity(definition);
      const items = result.items;
      record.skipped = result.skippedCount;
      const layer = layers.find(l => l.id === definition.layerId);
      record.items = items.map(item => {
        const geometry = geometryOf(item);
        return { ...item, geometry, bounds: boundsOf(geometry), layerId: layer.id, color: layer.color, rank: layer.rank, sourceUrl: definition.sourceUrl, credit: definition.credit };
      });
      record.status = 'ready'; record.error = ''; record.updated = new Date(); revision++;
    } catch (error) { record.status = 'failed'; record.error = error.message || 'Download failed'; }
    paint();
  })).finally(() => { lastAttempt = new Date(); inFlight = null; paintStatus(); });
  return inFlight;
}
initLocation($('#locate'), p => { const first = !me && p; me = p; map?.setUserLocation(p, first); paintList(); });
startRefresh(load, paint, CONFIG.refreshMs);
map = await createMap({ ...mapOptions, defaultBasemap: basemapId }, $('#map'), city.center).catch(() => null);
if (map) {
  basemapSelect.disabled = mapOptions.basemaps.length < 2;
  map.setTheme(document.documentElement.dataset.theme);
  map.setUserLocation(me, Boolean(me));
  map.onPointer(({ lat, lng, x, y, tolM, activate }) => {
    if (!activate) return;
    showDetails(hitsAt(current, lat, lng, tolM), x, y);
  });
  paint();
} else { $('#map').innerHTML = '<p class="note">The map could not load. The parking list is still available.</p>'; $('#renderer').textContent = 'Map unavailable'; }
