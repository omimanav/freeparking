// Map provider contract: { setTheme(t), render([{coords,color}]), flyTo([lat,lng]),
//   setUserLocation({lat,lng}|null, recenter), onPointer(cb({lat,lng,x,y,tolM})) }
// A web page cannot embed a device's native map, so embedded view = Apple MapKit JS.
// To add another provider (Leaflet, Google...), implement the contract and return it here.
export async function createMap(token, el, center) {
  if (!token) return null;
  return (await import('./mapkit.js')).default(el, token, center);
}
