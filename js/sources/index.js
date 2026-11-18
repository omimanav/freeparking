import sample from './sample.js';
import arcgis from './arcgis.js';
import csv from './csv.js';
const adapters = { sample, arcgis, csv }; // add new adapters here
export const fetchCity = async city => {
  const result = await adapters[city.source.type].fetch(city);
  return Array.isArray(result) ? { items: result, downloadedCount: result.length, skippedCount: 0 } : result;
};
