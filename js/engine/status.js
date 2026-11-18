// Pure rules engine. Segment shape:
// { kind:'free'|'paid'|'restricted'|'limit', when?:[window], freeWhen?:[window], limitMin?:number }
// window = { days:[1..7 Mon=1], from:'HH:MM', to:'HH:MM' } (from > to spans midnight)
export const COLORS = { green: '#1fa24a', red: '#d93025', blue: '#1a73e8', grey: '#8e8e93' };
const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const m = s => { const [h, n] = s.split(':'); return h * 60 + +n; };

export function nzNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Pacific/Auckland', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(x => [x.type, x.value]));
  return { day: D.indexOf(p.weekday) + 1, min: +p.hour * 60 + +p.minute };
}

function inWindow(w, t) {
  const f = m(w.from), e = m(w.to), prev = t.day === 1 ? 7 : t.day - 1;
  if (f < e) return w.days.includes(t.day) && t.min >= f && t.min < e;
  return (w.days.includes(t.day) && t.min >= f) || (w.days.includes(prev) && t.min < e);
}

export function classify(s, date = new Date()) {
  const t = nzNow(date), on = ws => (ws || []).some(w => inWindow(w, t));
  const out = (color, label) => ({ color, label });
  switch (s.kind) {
    case 'free': return out('green', 'Free');
    case 'paid': return !s.when || on(s.when) ? out('red', 'Paid now') : out('green', 'Free now');
    case 'restricted': return !s.when || on(s.when) ? out('red', 'Restricted now') : out('green', 'Not restricted now');
    case 'limit': return on(s.freeWhen) ? out('green', 'Free, untimed now') : out('blue', `P${s.limitMin} limit`);
    default: return out('grey', 'Rules unknown, check signage');
  }
}
