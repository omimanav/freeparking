const CCC = 'https://gis.ccc.govt.nz/server/rest/services/OpenData/Road/FeatureServer';
const WCC = 'https://gis.wcc.govt.nz/arcgis/rest/services/Transportation/Parking_Spaces/MapServer';
const daysOfWeek = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const everyDay = [1, 2, 3, 4, 5, 6, 7];

function daysBetween(start, end = start) {
  const first = daysOfWeek.indexOf(start?.slice(0, 3).toLowerCase());
  const last = daysOfWeek.indexOf(end?.slice(0, 3).toLowerCase());
  if (first < 0 || last < 0) return null;
  return Array.from({ length: (last - first + 7) % 7 + 1 }, (_, i) => (first + i) % 7 + 1);
}

function clock(value) {
  const parts = /^(1[0-2]|0?[1-9])(?:[.:]([0-5]\d))?\s*(am|pm)$/i.exec(value?.trim());
  if (!parts) return null;
  const hour = +parts[1] % 12 + (parts[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${parts[2] || '00'}`;
}

function christchurchHours(value, holidays) {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (text === '24 hours') return [{ days: everyDay, from: '00:00', to: '24:00', holidays }];
  let days = everyDay;
  const windows = [];
  for (const part of text.split(',')) {
    // Subsequent time ranges can share the days at the start of the entry.
    const match = /^\s*(?:(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)(?:\s*[-–]\s*(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun))?\s*)?(.*?)\s*$/.exec(part);
    const [, first, last, times] = match;
    if (first) days = daysBetween(first, last);
    const [start, end, extra] = times.split(/[-–]/);
    const from = !times && first ? '08:00' : clock(start);
    const to = !times && first ? '18:00' : clock(end);
    if (!days || !from || !to || from === to || extra !== undefined) return null;
    windows.push({ days, from, to, holidays });
  }
  return windows;
}

function christchurchParking(r) {
  const { VehicleClass: vehicle, Control: control, HoursOfRestriction: hours, TimeLimit: limit, ServiceStatus: status, Clearway: clearway } = r;
  const paymentArea = r.PayMyParkAreaCode?.trim();
  const info = [
    control, limit, hours && `Hours: ${hours}`, clearway === 'Yes' && 'Clearway recorded',
    r.ParkingSpaces > 0 && `${r.ParkingSpaces} spaces`, paymentArea && `PayMyPark area ${paymentArea}`, r.AdditionalInformation,
  ].filter(Boolean).join(' | ');
  const name = vehicle ? `${vehicle} parking` : control === 'Unrestricted' ? 'Unrestricted on-street parking'
    : control === 'Metered' ? `Metered on-street parking${paymentArea ? ` · ${paymentArea}` : ''}` : `${limit || 'Time-limited'} on-street parking`;
  const base = { name, info };
  if (status === 'Temporarily unavailable') return { ...base, kind: 'restricted', activeLabel: 'Temporarily unavailable' };
  if (status !== 'Active' || clearway !== 'No') return { ...base, kind: 'unknown', label: clearway === 'Yes' ? 'Clearway recorded · check signs' : 'Availability unverified' };
  if (!vehicle && control === 'Unrestricted' && limit === 'No time limit' && !hours && !paymentArea) return { ...base, kind: 'free' };

  const metered = control === 'Metered' && !vehicle;
  const when = christchurchHours(hours, metered || !vehicle ? 'exclude' : undefined);
  if (!when) return { ...base, kind: 'unknown', label: metered ? 'Metered · hours unverified' : `${vehicle || limit || 'Parking'} · hours unverified` };
  if (vehicle) return { ...base, kind: 'restricted', when, activeLabel: `${vehicle} only`, outsideHours: 'Outside listed hours · check signs' };
  if (metered) return { ...base, kind: 'paid', when, outsideHours: 'No charge under published hours' };
  const minutes = /^P(\d+)$/.exec(limit)?.[1];
  return minutes && control === 'Time Restricted' ? { ...base, kind: 'limit', when, limitMin: +minutes } : { ...base, kind: 'unknown' };
}

const ruleNumbers = [1, 2, 3, 4, 5, 6, 7];
const wellingtonRuleFields = ['class', 'time_restriction', 'start_time', 'end_time', 'start_day', 'end_day'];

function wellingtonRule(rule, allTimes, metered) {
  const { type, limit, start, end, firstDay, lastDay } = rule;
  let when;
  if (!(allTimes && !start && !end && !firstDay && !lastDay)) {
    const days = daysBetween(firstDay, lastDay);
    const from = clock(start), to = clock(end);
    if (!days || !firstDay || !lastDay || !from || !to || from === to) return null;
    const defaultHolidayRule = ['Time Restricted', 'Loading Zone', 'Metered Parking'].includes(type);
    when = [{
      days, from, to: from === '00:00' && to === '23:59' ? '24:00' : to,
      holidays: defaultHolidayRule && !allTimes ? 'exclude' : undefined,
    }];
  }
  if (type === 'Metered Parking') return { kind: 'paid', when, activeLabel: 'Metered hours · check machine' };
  const minutes = /^P(\d+) Park$/i.exec(limit)?.[1];
  if (type === 'Time Restricted') return minutes ? { kind: 'limit', limitMin: +minutes, when } : null;
  if (type === 'Regular') return !metered && limit === 'No Time Limit' ? { kind: 'free', when } : null;
  if (type === 'Loading Zone') return { kind: 'loading', when };
  return { kind: 'restricted', when, activeLabel: `${type} restriction active` };
}

function wellingtonParking(r) {
  const name = r.road_id?.trim() || 'On-street parking';
  const listed = ruleNumbers.flatMap(n => r[`class_${n}`] ? [{
    type: r[`class_${n}`], limit: r[`time_restriction_${n}`], start: r[`start_time_${n}`], end: r[`end_time_${n}`],
    firstDay: r[`start_day_${n}`], lastDay: r[`end_day_${n}`],
  }] : []);
  const other = r.class_other_times;
  const otherDays = [r.start_day_other_times, r.end_day_other_times].filter(Boolean).join('–');
  const otherHours = [r.start_time_other_times, r.end_time_other_times].filter(Boolean).join('–');
  const info = [
    r.Location_description, r.notes, r.number_of_cars > 0 && `${r.number_of_cars} spaces`,
    r.parking_area && r.parking_area !== 'Not Allocated' && `Parking area ${r.parking_area}`,
    ...listed.map(({ type, limit, start, end, firstDay, lastDay }) =>
      [type, limit, [firstDay, lastDay].filter(Boolean).join('–'), [start, end].filter(Boolean).join('–')].filter(Boolean).join(' · ')),
    other && `Other times: ${[other, r.time_restriction_other_time, otherDays, otherHours].filter(Boolean).join(' · ')}`,
    r.school_terms === 'Yes' && 'School-term rules apply',
  ].filter(Boolean).join(' | ');
  if (/unavailable/i.test(r.parking_status || '')) return { name, info, kind: 'restricted', activeLabel: 'Temporarily unavailable' };

  const metered = r.meter === 'Yes';
  const [first] = listed;
  const regularDays = first && (daysBetween(first.firstDay, first.lastDay)?.length === 7 || (!first.firstDay && !first.lastDay));
  const plainRegular = !metered && listed.length === 1 && first.type === 'Regular' && first.limit === 'No Time Limit'
    && !first.start && !first.end && regularDays;
  const singleAllTimes = listed.length === 1 && r.applies_at_all_times === 'Yes';
  const rules = plainRegular ? [{ kind: 'free' }] : listed.map(rule => wellingtonRule(rule, singleAllTimes, metered));
  if (r.school_terms !== 'Yes' && !other && r.at_other_times_stated !== 'Yes'
    && r.number_of_restrictions === listed.length && rules.length && rules.every(Boolean)) return { name, info, rules };

  const classes = [...new Set(listed.map(rule => rule.type))].join(' / ');
  return { name, info, kind: 'unknown', label: classes ? `${classes} · check signs` : 'Rules unknown, check signage' };
}

const christchurchLayers = [
  { id: 'street', name: 'Casual on-street parking', color: '#1fa24a', rank: 1, layer: 10 },
  { id: 'reserved', name: 'Reserved on-street parking', color: '#d93025', rank: 2, layer: 11 },
].map(({ layer, ...definition }) => {
  const url = `${CCC}/${layer}`;
  return { ...definition, credit: 'Christchurch City Council', shortCredit: 'CCC', sourceUrl: url, source: { type: 'arcgis', url, map: christchurchParking } };
});

const wellingtonUrl = `${WCC}/0`;
const wellingtonFields = [
  'OBJECTID', 'road_id', 'meter', 'school_terms', 'number_of_cars', 'parking_status', 'notes', 'parking_area',
  'Location_description', 'number_of_restrictions', 'applies_at_all_times', 'class_other_times',
  'time_restriction_other_time', 'start_time_other_times', 'end_time_other_times', 'start_day_other_times', 'end_day_other_times',
  'at_other_times_stated', ...ruleNumbers.flatMap(n => wellingtonRuleFields.map(field => `${field}_${n}`)),
];
const wellingtonLayers = [{
  id: 'street', name: 'On-street parking areas', color: '#1a73e8', rank: 1,
  credit: 'Wellington City Council', shortCredit: 'WCC', sourceUrl: wellingtonUrl,
  source: { type: 'arcgis', url: wellingtonUrl, fields: wellingtonFields, map: wellingtonParking },
}];

export const COUNCIL_CITIES = [
  { id: 'christchurch', name: 'Christchurch', center: [-43.532, 172.636], bounds: [172.42, -43.65, 172.80, -43.40], layers: christchurchLayers },
  { id: 'wellington', name: 'Wellington', center: [-41.288, 174.776], bounds: [174.62, -41.37, 174.88, -41.13], layers: wellingtonLayers },
];
