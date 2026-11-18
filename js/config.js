// All tunables live here. Swap a city's `source` to change its data without touching anything else.
export const CONFIG = {
  refreshMs: 15 * 60 * 1000,
  mapkitToken: '', // Apple MapKit JS token (JWT). Empty = list-only mode with "Open in Maps" links.
  cities: [
    { id: 'auckland', name: 'Auckland', center: [-36.8485, 174.7633], source: {
      type: 'csv',
      url: 'https://data-atgis.opendata.arcgis.com/api/download/v1/items/4da9854830184c698dc38ca8d4a63927/csv?layers=1',
      // Points come from the X (lng) / Y (lat) columns automatically.
      // This dataset has no price/hours fields, so rules are read conservatively from the description text.
      // Anything ambiguous stays grey ("rules unknown") rather than risk showing a wrong "free".
      map: r => {
        if (/clos/i.test(r.STATUS || '')) return null;
        const text = `${r.SHORTDESCRIPTION || ''} ${r.LONGDESCRIPTION || ''}`;
        const limit = text.match(/\bP\s?(\d{1,3})\b/i);
        const paid = /\b(pay|paid|charge[sd]?|fee|tariff)\b|\$\s?\d/i.test(text);
        const free = /\bfree\b/i.test(text) && !/\b(not|non)[- ]free\b|\d|hour|min|after|before|until|weekend/i.test(text);
        const has = v => v && v !== '0';
        return {
          name: r.SHORTDESCRIPTION || [r.STREETNUMBER, r.STREET].filter(Boolean).join(' ') || 'Car park',
          kind: paid ? 'paid' : limit ? 'limit' : free ? 'free' : 'unknown',
          limitMin: limit ? +limit[1] : undefined,
          info: [r.LONGDESCRIPTION, has(r.TOTALSPACES) && `${r.TOTALSPACES} spaces`,
            r.AVAILABLESPACES && `${r.AVAILABLESPACES} available`, has(r.MOBILITYSPACES) && `${r.MOBILITYSPACES} mobility`,
            has(r.CLEARANCEMETERS) && `${r.CLEARANCEMETERS} m clearance`, [r.STREETNUMBER, r.STREET, r.SUBURB].filter(Boolean).join(' ')]
            .filter(Boolean).join(' | '),
        };
      },
    } },
  ],
};
