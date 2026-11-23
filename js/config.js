import { AREA_SOURCES } from './sources/areas.js';
import { COUNCIL_CITIES } from './sources/council-parking.js';

const aucklandLocations = 'https://services2.arcgis.com/JkPEgZJGxhSjYOo0/arcgis/rest/services/ParkingService/FeatureServer/1';

export const PORTABLE_BASEMAP = {
  id: 'versatiles', name: 'VersaTiles Streets',
  style: 'https://tiles.versatiles.org/assets/styles/colorful/style.json', maxZoom: 19,
};

export const CONFIG = {
  refreshMs: 15 * 60 * 1000,
  map: {
    zoom: 15,
    defaultBasemap: 'osm',
    basemaps: [
      {
        id: 'osm', name: 'OpenStreetMap Streets',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
      {
        id: 'humanitarian', name: 'Humanitarian',
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        minZoom: 1, maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Style: <a href="https://www.hotosm.org/">HOT</a> | Tiles: <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>',
      },
      {
        id: 'terrain', name: 'Terrain (OpenTopoMap)',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        maxNativeZoom: 17, maxZoom: 19,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>)',
      },
    ],
  },
  cities: [
    {
      id: 'auckland', name: 'Auckland', center: [-36.8485, 174.7633], bounds: [174.52, -37.03, 174.96, -36.69],
      layers: [{
        id: 'locations', name: 'Parking location points', color: '#1a73e8', rank: 3,
        credit: 'Auckland Transport', shortCredit: 'AT', sourceUrl: aucklandLocations,
        source: {
          type: 'arcgis',
          url: aucklandLocations,
          map: r => {
            if (/clos/i.test(r.STATUS || '')) return null;
            const text = `${r.SHORTDESCRIPTION || ''} ${r.LONGDESCRIPTION || ''}`;
            const limit = text.match(/\bP\s?(\d{1,3})\b/i);
            const paid = /\b(pay|paid|charge[sd]?|fee|tariff)\b|\$\s?\d/i.test(text);
            const free = /\bfree\b/i.test(text) && !/\b(not|non)[- ]free\b|\d|hour|min|after|before|until|weekend/i.test(text);
            const has = v => v && v !== '0';
            return {
              name: r.SHORTDESCRIPTION || [r.STREETNUMBER, r.STREET].filter(Boolean).join(' ') || 'Car park',
              kind: paid ? 'unknown' : limit ? 'limit' : free ? 'free' : 'unknown',
              label: paid ? 'Payment indicated · hours unverified' : undefined,
              limitMin: limit ? +limit[1] : undefined,
              info: [r.DATATYPE, r.LONGDESCRIPTION, has(r.TOTALSPACES) && `${r.TOTALSPACES} spaces`,
                r.AVAILABLESPACES && `${r.AVAILABLESPACES} available`, has(r.MOBILITYSPACES) && `${r.MOBILITYSPACES} mobility`,
                has(r.CLEARANCEMETERS) && `${r.CLEARANCEMETERS} m clearance`, [r.STREETNUMBER, r.STREET, r.SUBURB].filter(Boolean).join(' ')]
                .filter(Boolean).join(' | '),
            };
          },
        },
      }, ...AREA_SOURCES],
    },
    ...COUNCIL_CITIES,
  ],
};
