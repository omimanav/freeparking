const CITY_HOURS = 'https://at.govt.nz/driving-and-parking/find-parking/parking-in-central-auckland/open-air-car-parks';
const TAKAPUNA_HOURS = 'https://at.govt.nz/driving-and-parking/find-parking/parking-in-north-auckland/paid-parking-takapuna';

// Matched to the coloured on-street sections of AT's published maps using AT Road Centrelines
// (RoadingService/FeatureServer/3) on 2026-11-21. These are payment IDs, not tariff zone numbers.
// Only use IDs whose mapped sections could be matched to one charging schedule.
const cityLate = new Set([
  100102, 100103, 100105, 100107, 100109, 100203, 100204, 100209, 100300, 100301,
  100302, 100304, 100306, 100307, 100308, 100310, 100314, 100400, 100402, 100403,
]);
const cityDaytime = new Set([
  100311, 100501, 100502, 100503, 100603, 100604, 100606, 100609, 100700, 100701,
  100703, 100802, 100803, 100804, 100805, 100806, 100901, 100902, 100903, 100905,
  100907, 100910, 100911, 100912, 100916, 101001, 101004, 101100, 101101, 101102,
  101103, 101105, 101106, 101107, 101201, 101202, 101203, 101204, 101206, 101400,
  101401, 101402, 101403, 101404, 101406, 101407, 101408, 101409, 101411, 101501,
  101502, 101503, 101504, 101505, 101506, 101507, 101510, 101511, 101512, 101513,
  101514, 101515, 101517, 101600, 101601, 101602, 101603, 101604, 101605, 101608,
  101609, 101700, 101701, 101703, 101705, 101706, 101707, 101807, 101808,
]);
const takapuna = new Set([
  211001, 211002, 211003, 211004, 211005, 211007, 211008, 211010, 211018, 211019,
  211021, 211023,
]);
const daily = [1, 2, 3, 4, 5, 6, 7];
const schedules = [
  { ids: cityLate, url: CITY_HOURS, when: [{ days: daily, from: '08:00', to: '22:00' }], hours: 'City centre tariff zone 1 charges daily, 08:00–22:00, including public holidays.' },
  { ids: cityDaytime, url: CITY_HOURS, when: [{ days: daily, from: '08:00', to: '18:00' }], hours: 'City centre tariff zones 2–5 charge daily, 08:00–18:00, including public holidays.' },
  { ids: takapuna, url: TAKAPUNA_HOURS, when: [{ days: daily.slice(0, 6), from: '08:00', to: '18:00', holidays: 'exclude' }], hours: 'Takapuna on-street parking charges Monday to Saturday, 08:00–18:00, excluding public holidays.' },
];

export function paidHours(zoneId) {
  const schedule = schedules.find(({ ids }) => ids.has(zoneId));
  if (!schedule) return null;
  return {
    kind: 'paid', when: schedule.when, scheduleUrl: schedule.url,
    outsideHours: 'No charge under published hours',
    info: `${schedule.hours} Other parking restrictions may apply. Check the signs at the space.`,
  };
}
