function parse(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...r] = rows;
  return { headers: h, rows: r.map(v => Object.fromEntries(h.map((k, i) => [k, v[i]]))) };
}

const wkt = s => [...s.matchAll(/\(([^()]+)\)/g)]
  .map(m => m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)).map(([x, y]) => [y, x]))
  .filter(l => l.length > 1 && l.every(([la, lo]) => Math.abs(la) <= 90 && Math.abs(lo) <= 180));
function guess(r) {
  const k = Object.keys(r), find = re => k.find(x => re.test(x));
  const w = find(/^(wkt|the_geom|geometry|shape)$/i);
  if (w && /LINESTRING|POLYGON/i.test(r[w] || '')) return wkt(r[w]);
  const la = +r[find(/^(lat|latitude|y)$/i)], lo = +r[find(/^(lon|lng|long|longitude|x)$/i)];
  return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 ? [[[la, lo], [la, lo]]] : null;
}

export default {
  async fetch({ id, source }) {
    let text;
    try {
      const r = await fetch(source.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      text = await r.text();
    } catch (e) { throw new Error(`Could not download ${id} CSV (${e.message}; may be blocked by CORS).`); }
    const { headers, rows } = parse(text);
    if (!source.map) throw new Error(`Set source.map in js/config.js. Columns: ${headers.join(', ')}. First row: ${JSON.stringify(rows[0])}`);
    return rows.flatMap((row, i) => {
      const seg = source.map(row), lines = (source.geom || guess)(row);
      return seg && lines ? lines.map((coords, j) => ({ id: `${id}-${i}-${j}`, city: id, ...seg, coords })) : [];
    });
  },
};
