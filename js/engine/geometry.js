import { distM } from './hit.js';

export function geometryOf(item) {
  if (item.geometry) return item.geometry;
  const coords = item.coords || [];
  if (!coords.length) return null;
  const point = coords.every(c => c[0] === coords[0][0] && c[1] === coords[0][1]);
  return { type: point ? 'Point' : 'LineString', coordinates: point ? [coords[0][1], coords[0][0]] : coords.map(([lat, lng]) => [lng, lat]) };
}
export const isArea = geometry => geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
export function positions(geometry) {
  switch (geometry.type) {
    case 'Point': return [geometry.coordinates];
    case 'MultiPoint': case 'LineString': return geometry.coordinates;
    case 'Polygon': case 'MultiLineString': return geometry.coordinates.flat();
    case 'MultiPolygon': return geometry.coordinates.flat(2);
    default: return [];
  }
}
export function validGeometry(g) {
  if (!g || !Array.isArray(g.coordinates)) return false;
  const validPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const line = v => Array.isArray(v) && v.length >= 2 && v.every(validPoint);
  const ring = v => line(v) && v.length >= 4 && v[0][0] === v.at(-1)[0] && v[0][1] === v.at(-1)[1];
  const polygon = v => Array.isArray(v) && v.length > 0 && v.every(ring);
  if (g.type === 'Point') return validPoint(g.coordinates);
  if (g.type === 'LineString') return line(g.coordinates);
  if (g.type === 'MultiLineString') return g.coordinates.length > 0 && g.coordinates.every(line);
  if (g.type === 'Polygon') return polygon(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.length > 0 && g.coordinates.every(polygon);
  return false;
}
export function boundsOf(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of positions(geometry)) {
    bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat);
  }
  return bounds;
}
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function contains(geometry, point) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}
function distanceToLine(line, lat, lng) {
  let distance = Infinity;
  const k = 111320, c = Math.cos(lat * Math.PI / 180);
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const px = (lng - a[0]) * k * c, py = (lat - a[1]) * k;
    const dx = (b[0] - a[0]) * k * c, dy = (b[1] - a[1]) * k;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(px - t * dx, py - t * dy));
  }
  return distance;
}
export function distanceTo(item, lat, lng) {
  const g = item.geometry;
  if (g.type === 'Point') return distM(lat, lng, g.coordinates[1], g.coordinates[0]);
  if (isArea(g) && contains(g, [lng, lat])) return 0;
  const lines = g.type === 'Polygon' || g.type === 'MultiLineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [g.coordinates];
  return Math.min(...lines.map(line => distanceToLine(line, lat, lng)));
}
export function hitsAt(items, lat, lng, tolerance) {
  const dy = tolerance / 111320, dx = dy / Math.max(0.01, Math.cos(lat * Math.PI / 180));
  return items.filter(item => {
    const [west, south, east, north] = item.bounds;
    return lng >= west - dx && lng <= east + dx && lat >= south - dy && lat <= north + dy && distanceTo(item, lat, lng) <= tolerance;
  }).sort((a, b) => b.rank - a.rank || distanceTo(a, lat, lng) - distanceTo(b, lat, lng));
}
export function collection(items) {
  return { type: 'FeatureCollection', features: items.map(item => ({ type: 'Feature', id: item.id, properties: { color: item.color, layerId: item.layerId, id: item.id }, geometry: item.geometry })) };
}
