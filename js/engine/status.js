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

// Employment New Zealand's published dates, including Auckland Anniversary and observed dates.
// https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates
const holidays = {
  2026: new Set(['01-01', '01-02', '01-26', '02-06', '04-03', '04-06', '04-25', '04-27', '06-01', '07-10', '10-26', '12-25', '12-26', '12-28']),
  2027: new Set(['01-01', '01-02', '01-04', '02-01', '02-06', '02-08', '03-26', '03-29', '04-25', '04-26', '06-07', '06-25', '10-25', '12-25', '12-26', '12-27', '12-28']),
};

export function nzNow(date = new Date()) {
  const p = Object.fromEntries(aucklandClock.formatToParts(date).map(x => [x.type, x.value]));
  return { day: D.indexOf(p.weekday) + 1, min: +p.hour * 60 + +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}

function scheduledDay(w, t, yesterday) {
  const day = yesterday ? (t.day === 1 ? 7 : t.day - 1) : t.day;
  const listed = w.days.includes(day);
  if (!w.holidays || (w.holidays === 'include' && listed) || (w.holidays === 'exclude' && !listed)) return listed;
  const date = yesterday ? new Date(Date.parse(t.date) - 86400000).toISOString().slice(0, 10) : t.date;
  const calendar = holidays[date.slice(0, 4)];
  if (!calendar) return null;
  const holiday = calendar.has(date.slice(5));
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

export function classifyAt(s, t) {
  const matches = s.when?.map(w => inWindow(w, t));
  const active = !matches || matches.includes(true);
  const out = (color, label) => ({ color, label });
  if (!active && matches.includes(null)) return out('grey', 'Public holiday hours unverified');
  switch (s.kind) {
    case 'free': return out('green', 'Free');
    case 'paid': return active ? out('red', 'Paid now') : out('green', s.outsideHours || 'Free now');
    case 'restricted': return active ? out('red', 'Restricted now') : out('green', 'Not restricted now');
    case 'loading': return active ? out('orange', 'Loading restriction active') : out('grey', 'Outside published loading hours');
    case 'limit': return s.freeWhen?.some(w => inWindow(w, t)) ? out('green', 'Free, untimed now') : out('blue', `P${s.limitMin} limit`);
    default: return out('grey', s.label || 'Rules unknown, check signage');
  }
}
