import { validGeometry } from '../engine/geometry.js';

async function request(url, params, id) {
  const encoded = new URLSearchParams(params);
  // Feature ID batches can exceed proxy URL limits; form POST is supported by ArcGIS and needs no CORS preflight.
  const response = await fetch(params.objectIds ? `${url}/query` : `${url}/query?${encoded}`, {
    signal: AbortSignal.timeout(25000),
    ...(params.objectIds ? { method: 'POST', body: encoded } : {}),
  });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`${id}: ${data.error.message || 'Parking service error'}`);
  return data;
}
export default {
  async fetch({ id, source }) {
    const where = source.where || '1=1';
    const result = await request(source.url, { where, returnIdsOnly: 'true', f: 'json' }, id);
    if (!Array.isArray(result.objectIds)) throw new Error(`${id}: Invalid record ID response`);
    const ids = [...new Set(result.objectIds)].sort((a, b) => a - b);
    const batches = [];
    for (let offset = 0; offset < ids.length; offset += 400) batches.push(ids.slice(offset, offset + 400));
    const pages = new Array(batches.length);
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const index = next++, batch = batches[index];
        const data = await request(source.url, { where, objectIds: batch.join(','), outFields: '*', outSR: '4326', f: 'geojson' }, id);
        if (!Array.isArray(data.features)) throw new Error(`${id}: Invalid parking data response`);
        const received = new Set(data.features.map(f => String(f.properties?.[result.objectIdFieldName] ?? f.id)));
        if (data.exceededTransferLimit || data.properties?.exceededTransferLimit || batch.some(key => !received.has(String(key)))) throw new Error(`${id}: Incomplete parking response`);
        pages[index] = data.features;
      }
    };
    await Promise.all([worker(), worker()]);
    const seen = new Set();
    let skippedCount = 0;
    const items = pages.flat().flatMap(feature => {
      const key = feature.properties?.[result.objectIdFieldName] ?? feature.id;
      if (seen.has(key)) return [];
      seen.add(key);
      const item = source.map(feature.properties || {});
      if (!item) return [];
      if (!validGeometry(feature.geometry)) { skippedCount++; return []; }
      return [{ id: `${id}-${key}`, city: id, ...item, geometry: feature.geometry }];
    });
    return { items, downloadedCount: ids.length, skippedCount };
  },
};
