// Hand off to the device's native maps app: geo: on Android, Apple Maps link elsewhere.
export const nativeMapsUrl = ([lat, lng], label) => /android/i.test(navigator.userAgent)
  ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
  : `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`;
