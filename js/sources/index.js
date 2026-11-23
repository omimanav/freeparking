import sample from './sample.js';
import arcgis from './arcgis.js';
import csv from './csv.js';
const adapters = { sample, arcgis, csv };
export const fetchCity = async (city, signal) => {
  const result = await adapters[city.source.type].fetch(city, signal);
  return Array.isArray(result) ? { items: result, downloadedCount: result.length, skippedCount: 0 } : result;
};
