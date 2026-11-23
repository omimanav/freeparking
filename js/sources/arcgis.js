import { validGeometry } from '../engine/geometry.js';

async function request(url, params, id, signal) {
  const encoded = new URLSearchParams(params);
  const timeout = AbortSignal.timeout(25000);
  const response = await fetch(params.objectIds ? `${url}/query` : `${url}/query?${encoded}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(params.objectIds ? { method: 'POST', body: encoded } : {}),
  });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) {
    const error = new Error(`${id}: ${data.error.message || data.error.details?.[0] || 'Parking service error'}`);
    error.arcgisCode = data.error.code;
    throw error;
  }
  return data;
}
export default {
  async fetch({ id, source, bounds }, signal) {
    const where = source.where || '1=1';
    const extent = bounds ? {
      geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    } : {};
    const filter = { where, ...extent, f: 'json' };
    let result;
    try {
      result = await request(source.url, { ...filter, returnIdsOnly: 'true' }, id, signal);
    } catch (error) {
      if (!bounds || error.arcgisCode !== 400) throw error;
      const count = await request(source.url, { ...filter, returnCountOnly: 'true' }, id, signal);
      if (count.count === 0) return { items: [], downloadedCount: 0, skippedCount: 0 };
      throw error;
    }
    if (!Array.isArray(result.objectIds)) throw new Error(`${id}: Invalid record ID response`);
    const ids = [...new Set(result.objectIds)].sort((a, b) => a - b);
    const batches = [];
    for (let offset = 0; offset < ids.length; offset += 400) batches.push(ids.slice(offset, offset + 400));
    const pages = new Array(batches.length);
    let next = 0;
    const outFields = source.fields?.join(',') || '*';
    const worker = async () => {
      while (next < batches.length) {
        const index = next++, batch = batches[index];
        const data = await request(source.url, { where, objectIds: batch.join(','), outFields, outSR: '4326', f: 'geojson' }, id, signal);
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
