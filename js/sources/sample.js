const W = (days, from, to) => ({ days, from, to });
const WK = [1, 2, 3, 4, 5], ALL = [1, 2, 3, 4, 5, 6, 7];
const proto = [
  { name: 'Loading zone', kind: 'restricted', info: 'Loading zone, all times' },
  { name: 'Unrestricted street', kind: 'free', info: 'No restrictions' },
  { name: 'Paid parking', kind: 'paid', when: [W(WK, '08:00', '18:00')], info: 'Paid Mon-Fri 08:00-18:00, free otherwise' },
  { name: 'P60, free untimed overnight', kind: 'limit', limitMin: 60, freeWhen: [W(ALL, '18:00', '08:00')], info: 'P60 08:00-18:00, untimed free 18:00-08:00' },
  { name: 'P30', kind: 'limit', limitMin: 30, info: 'P30 at all times' },
  { name: 'Bus lane', kind: 'restricted', when: [W(WK, '07:00', '09:00'), W(WK, '16:00', '18:00')], info: 'Bus lane Mon-Fri 07:00-09:00 and 16:00-18:00' },
];
export default {
  async fetch({ id, center: [la, lo] }) {
    return proto.map((p, i) => ({ ...p, id: `${id}-${i}`, city: id, name: `Demo: ${p.name}`,
      coords: [[la + (i - 3) * 0.0013, lo - 0.0008], [la + (i - 3) * 0.0013 + 0.0008, lo + 0.0008]] }));
  },
};
