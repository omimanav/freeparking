import { CONFIG } from './config.js';
import { fetchCity } from './sources/index.js';
import { classify, COLORS } from './engine/status.js';
import { nearest, distM } from './engine/hit.js';
import { startRefresh } from './engine/refresh.js';
import { createMap } from './map/index.js';
import { nativeMapsUrl } from './map/native.js';
import { initTheme } from './ui/theme.js';
import { initLocation } from './ui/location.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const data = {};
let city = CONFIG.cities[0], map = null, me = null, current = [], lastError = '';

initTheme($('#theme'), t => map?.setTheme(t));

$('#cities').innerHTML = CONFIG.cities.map(c => `<button data-id="${c.id}">${esc(c.name)}</button>`).join('');
const mark = () => document.querySelectorAll('#cities button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === city.id));
$('#cities').onclick = e => {
  const c = CONFIG.cities.find(c => c.id === e.target.dataset.id);
  if (!c) return;
  city = c; mark(); map?.flyTo(c.center); paint();
};
mark();

function tip(s, x, y) {
  const t = $('#tip');
  if (!s) { t.hidden = true; return; }
  t.innerHTML = `<b>${esc(s.name)}</b><br><span style="color:${COLORS[s.st.color]}">&#9679; ${esc(s.st.label)}</span><br>${esc(s.info)}<br><a href="${nativeMapsUrl(s.coords[0], s.name)}">Open in Maps</a>`;
  t.hidden = false;
  t.style.left = Math.max(8, Math.min(x + 14, innerWidth - 262)) + 'px';
  t.style.top = Math.max(8, Math.min(y + 14, innerHeight - 140)) + 'px';
}

function paint() {
  const now = new Date();
  current = (data[city.id] || []).map(s => ({ ...s, st: classify(s, now) }));
  map?.render(current.map(s => ({ coords: s.coords, color: COLORS[s.st.color] })));
  const rows = [...current].sort((a, b) => me
    ? distM(me.lat, me.lng, ...a.coords[0]) - distM(me.lat, me.lng, ...b.coords[0])
    : a.name.localeCompare(b.name));
  $('#list').innerHTML = rows.map(s => `<a class="row" href="${nativeMapsUrl(s.coords[0], s.name)}"><i style="background:${COLORS[s.st.color]}"></i><span><b>${esc(s.name)}</b><small>${esc(s.st.label)}. ${esc(s.info)}</small></span></a>`).join('')
    || `<p class="empty">${esc(lastError || 'No parking data loaded yet.')}</p>`;
}

async function load() {
  const res = await Promise.allSettled(CONFIG.cities.map(async c => { data[c.id] = await fetchCity(c); }));
  const bad = res.filter(r => r.status === 'rejected'), failed = bad.length;
  lastError = bad[0]?.reason?.message || '';
  $('#updated').textContent = (failed ? `${failed} source(s) failed. ` : '') + 'Updated ' + new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  paint();
}

initLocation($('#locate'), p => { const first = !me && p; me = p; map?.setUserLocation(p, first); paint(); });

map = await createMap(CONFIG.mapkitToken, $('#map'), city.center).catch(() => null);
if (map) {
  map.setTheme(document.documentElement.dataset.theme);
  map.onPointer(({ lat, lng, x, y, tolM }) => tip(nearest(current, lat, lng, tolM), x, y));
} else {
  $('#map').innerHTML = '<p class="note">Add an Apple MapKit JS token in js/config.js to show the embedded map. The list and "Open in Maps" links work without it.</p>';
}

startRefresh(load, paint, CONFIG.refreshMs);
