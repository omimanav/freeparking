export const nativeMapsUrl = ([lat, lng], label) => /android/i.test(navigator.userAgent)
  ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
  : `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`;
