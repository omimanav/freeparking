const AT = 'https://services2.arcgis.com/JkPEgZJGxhSjYOo0/arcgis/rest/services';
export const AREA_SOURCES = [
  {
    id: 'paid', name: 'AT paid zones', color: '#c0392b', rank: 1,
    credit: 'Auckland Transport', sourceUrl: `${AT}/ParkingZone/FeatureServer/3`,
    source: { type: 'arcgis', url: `${AT}/ParkingZone/FeatureServer/3`, map: r => ({
      name: `Paid parking zone ${r.ZONEID ?? r.OBJECTID}`,
      label: 'Paid zone · rates and hours unverified',
      info: 'Official payment-zone boundary. This feed does not include tariffs or charging hours. A zone does not establish that every location inside it is a legal parking space.',
    }) },
  },
  {
    id: 'loading', name: 'AT loading zones', color: '#b76a00', rank: 2,
    credit: 'Auckland Transport', sourceUrl: `${AT}/ParkingZone/FeatureServer/1`,
    source: { type: 'arcgis', url: `${AT}/ParkingZone/FeatureServer/1`, map: r => ({
      name: `${r.Type ? r.Type + ' ' : ''}Loading zone ${r.OBJECTID}`,
      label: 'Loading zone · check posted restrictions',
      info: [r.TimeRestriction && `Time restriction: ${r.TimeRestriction}`, r.OperationDay && `Days: ${r.OperationDay}`, r.OperationTime && `Operating times: ${r.OperationTime}`, r.OperationStartTime != null && `Start (source value): ${r.OperationStartTime}`, r.OperationEndTime != null && `End (source value): ${r.OperationEndTime}`, 'Source schedules may be incomplete or refer to other restrictions. Check signage.'].filter(Boolean).join(' | '),
    }) },
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
