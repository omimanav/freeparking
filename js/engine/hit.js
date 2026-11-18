// Map-agnostic hit testing so hover works with any map provider.
export function distM(la1, lo1, la2, lo2) {
  const k = 111320, c = Math.cos(la1 * Math.PI / 180);
  return Math.hypot((lo2 - lo1) * k * c, (la2 - la1) * k);
}
export function nearest(segs, lat, lng, maxM = 20) {
  const k = 111320, c = Math.cos(lat * Math.PI / 180);
  let best = null, bd = maxM;
  for (const s of segs) for (let i = 1; i < s.coords.length; i++) {
    const [a, b] = [s.coords[i - 1], s.coords[i]];
    const px = (lng - a[1]) * k * c, py = (lat - a[0]) * k, dx = (b[1] - a[1]) * k * c, dy = (b[0] - a[0]) * k;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(px - t * dx, py - t * dy);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
