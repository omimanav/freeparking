// Pure rules engine. Segment shape:
// { kind:'free'|'paid'|'restricted'|'loading'|'limit', when?:[window], freeWhen?:[window], limitMin?:number }
// window = { days:[1..7 Mon=1], from:'HH:MM', to:'HH:MM', holidays?:'include'|'exclude' }
// An overnight window belongs to the day it starts. Use 00:00–24:00 for a full day.
export const COLORS = { green: '#1fa24a', red: '#d93025', blue: '#1a73e8', grey: '#8e8e93', orange: '#b76a00' };
const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const m = s => { const [h, n] = s.split(':'); return h * 60 + +n; };
const aucklandClock = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Employment New Zealand's published dates, including observed dates and provincial anniversaries.
// https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates
const holidays = {
  2026: new Set(['01-01', '01-02', '02-06', '04-03', '04-06', '04-25', '04-27', '06-01', '07-10', '10-26', '12-25', '12-26', '12-28']),
  2027: new Set(['01-01', '01-02', '01-04', '02-06', '02-08', '03-26', '03-29', '04-25', '04-26', '06-07', '06-25', '10-25', '12-25', '12-26', '12-27', '12-28']),
};
const anniversaryDays = {
  auckland: { 2026: '01-26', 2027: '02-01' },
  christchurch: { 2026: '11-13', 2027: '11-12' },
  wellington: { 2026: '01-19', 2027: '01-25' },
};

export function nzNow(date = new Date(), city = 'auckland') {
  const p = Object.fromEntries(aucklandClock.formatToParts(date).map(x => [x.type, x.value]));
  return { day: D.indexOf(p.weekday) + 1, min: +p.hour * 60 + +p.minute, date: `${p.year}-${p.month}-${p.day}`, city };
}

function scheduledDay(w, t, yesterday) {
  const day = yesterday ? (t.day === 1 ? 7 : t.day - 1) : t.day;
  const listed = w.days.includes(day);
  if (!w.holidays || (w.holidays === 'include' && listed) || (w.holidays === 'exclude' && !listed)) return listed;
  const date = yesterday ? new Date(Date.parse(t.date) - 86400000).toISOString().slice(0, 10) : t.date;
  const year = date.slice(0, 4), dayOfYear = date.slice(5);
  const calendar = holidays[year];
  if (!calendar) return null;
  const holiday = calendar.has(dayOfYear) || anniversaryDays[t.city]?.[year] === dayOfYear;
  return w.holidays === 'exclude' ? !holiday : holiday;
}

function inWindow(w, t) {
  const start = m(w.from), end = m(w.to);
  if (start < end) return t.min >= start && t.min < end && scheduledDay(w, t, false);
  if (t.min >= start) return scheduledDay(w, t, false);
  return t.min < end && scheduledDay(w, t, true);
}

export function classify(s, date = new Date()) {
  return classifyAt(s, nzNow(date));
}

function activeAt(windows, t) {
  if (!windows) return true;
  const matches = windows.map(w => inWindow(w, t));
  if (matches.includes(true)) return true;
  return matches.includes(null) ? null : false;
}

const rulePriority = ['restricted', 'loading', 'paid', 'limit', 'free'];

export function classifyAt(s, t) {
  const out = (color, label) => ({ color, label });
  if (s.rules) {
    const rules = s.rules.map(rule => ({ rule, active: activeAt(rule.when, t) }));
    if (rules.some(({ active }) => active === null)) return out('grey', 'Public holiday hours unverified');
    for (const kind of rulePriority) {
      const match = rules.find(({ rule, active }) => rule.kind === kind && active);
      if (match) return classifyAt(match.rule, t);
    }
    return out('grey', 'Outside published restrictions · check signs');
  }
  const active = activeAt(s.when, t);
  if (active === null) return out('grey', 'Public holiday hours unverified');
  switch (s.kind) {
    case 'free': return out('green', 'Free');
    case 'paid': return active ? out('red', s.activeLabel || 'Paid now') : out('green', s.outsideHours || 'Free now');
    case 'restricted': return active ? out('red', s.activeLabel || 'Restricted now')
      : s.outsideHours ? out('grey', s.outsideHours) : out('green', 'Not restricted now');
    case 'loading': return active ? out('orange', 'Loading restriction active') : out('grey', 'Outside published loading hours');
    case 'limit':
      if (!active) return out('grey', 'Outside published time limit · check signs');
      return s.freeWhen?.some(w => inWindow(w, t)) ? out('green', 'Free, untimed now') : out('blue', `P${s.limitMin} limit`);
    default: return out('grey', s.label || 'Rules unknown, check signage');
  }
}
