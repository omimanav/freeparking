import { paidHours } from './paid-hours.js';

const AT = 'https://services2.arcgis.com/JkPEgZJGxhSjYOo0/arcgis/rest/services';
const allDays = [1, 2, 3, 4, 5, 6, 7];
const loadingDays = {
  'monday to friday': { days: allDays.slice(0, 5), holidays: 'exclude' },
  'monday to saturday': { days: allDays.slice(0, 6), holidays: 'exclude' },
  'monday to sunday': { days: allDays, holidays: 'exclude' },
  'monday to sunday inc public holidays': { days: allDays },
  'weekend and public holidays': { days: [6, 7], holidays: 'include' },
  'at all times': { days: allDays },
};

function loadingHours(r) {
  const day = r.OperationDay?.trim().toLowerCase();
  const schedule = Object.hasOwn(loadingDays, day) ? loadingDays[day] : null;
  if (!schedule) return null;
  const start = r.OperationStartTime, end = r.OperationEndTime;
  const text = r.OperationTime?.trim().toLowerCase();
  if (day === 'at all times' && start == null && end == null && text === day) {
    return { kind: 'loading', hours: 'At all times' };
  }
  const valid = n => Number.isInteger(n) && n >= 0 && n <= 2359 && n % 100 < 60;
  if (!valid(start) || !valid(end) || start === end || (text && text !== day && text !== `${day}: ${start} - ${end}`)) return null;
  const fullDay = start === 0 && end === 2359;
  if (day === 'at all times' && !fullDay) return null;
  const clock = n => String(n).padStart(4, '0').replace(/(..)(..)$/, '$1:$2');
  const from = clock(start), to = fullDay ? '24:00' : clock(end);
  const exception = schedule.holidays === 'exclude' ? ', excluding public holidays' : '';
  return { kind: 'loading', when: [{ ...schedule, from, to }], hours: `${r.OperationDay}, ${from}–${to}${exception}` };
}

export const AREA_SOURCES = [
  {
    id: 'paid', name: 'AT paid zones', color: '#d93025', rank: 1,
    credit: 'Auckland Transport', sourceUrl: `${AT}/ParkingZone/FeatureServer/3`,
    source: { type: 'arcgis', url: `${AT}/ParkingZone/FeatureServer/3`, map: r => ({
      name: `Paid parking zone ${r.ZONEID ?? r.OBJECTID}`,
      kind: 'unknown',
      label: 'Charging hours unverified',
      info: 'The official GIS layer shows the payment zone. Check the signs or payment machine for charging hours.',
      ...paidHours(r.ZONEID),
    }) },
  },
  {
    id: 'loading', name: 'AT loading zones', color: '#b76a00', rank: 2,
    credit: 'Auckland Transport', sourceUrl: `${AT}/ParkingZone/FeatureServer/1`,
    source: { type: 'arcgis', url: `${AT}/ParkingZone/FeatureServer/1`, map: r => {
      const schedule = loadingHours(r);
      const sourceHours = [
        r.OperationDay,
        r.OperationTime !== r.OperationDay && r.OperationTime,
        r.OperationStartTime != null && `Source start: ${r.OperationStartTime}`,
        r.OperationEndTime != null && `Source end: ${r.OperationEndTime}`,
      ].filter(Boolean).join(' · ');
      return {
        name: `${r.Type ? r.Type + ' ' : ''}Loading zone ${r.OBJECTID}`,
        kind: schedule?.kind ?? 'unknown',
        when: schedule?.when,
        label: 'Loading hours unverified',
        info: [
          /^P\d+$/.test(r.TimeRestriction) && `Time limit: ${r.TimeRestriction}`,
          schedule?.hours || sourceHours,
          'Check signage for vehicle eligibility and other restrictions.',
        ].filter(Boolean).join(' | '),
      };
    } },
  },
  {
    id: 'council', name: 'Council car-park footprints', color: '#687b8a', rank: 0,
    credit: 'Auckland Council', sourceUrl: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Park_Structure_Hard_Surface/FeatureServer/0',
    source: {
      type: 'arcgis', url: 'https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services/Park_Structure_Hard_Surface/FeatureServer/0',
      where: "AssetGroup = 'Carpark' AND VALIDATIONSTATE = 3",
      map: r => ({ name: r.SITEDESCRIPTION ? (/car\s*park/i.test(r.SITEDESCRIPTION) ? r.SITEDESCRIPTION : `${r.SITEDESCRIPTION} car park`) : r.DESCRIPTION || 'Council car-park footprint', label: 'Car-park footprint · access and rules unverified',
        info: [r.DESCRIPTION, [r.STREETNUMBER, r.STREETNAME, r.CITY].filter(Boolean).join(' '), r.LOCALBOARD, 'Physical surface asset; may be one part of a car park. Does not establish public access, fees, or time limits.'].filter(Boolean).join(' | '),
      }),
    },
  },
];
