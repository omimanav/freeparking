// Generic ArcGIS FeatureServer adapter. `source.map(properties)` converts a council's fields
// into the segment shape (name, kind, limitMin, when, freeWhen, info), or null to skip.
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : [];
export default {
  async fetch({ id, source }) {
    const r = await fetch(`${source.url}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=${source.max || 2000}`);
    if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
    const { features } = await r.json();
    return features.flatMap((f, i) => lines(f.geometry || {}).map((ring, j) => {
      const seg = source.map(f.properties);
      return seg && { id: `${id}-${f.id ?? i}-${j}`, city: id, ...seg, coords: ring.map(([lo, la]) => [la, lo]) };
    })).filter(Boolean);
  },
};
