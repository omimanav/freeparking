import sample from './sample.js';
import arcgis from './arcgis.js';
import csv from './csv.js';
const adapters = { sample, arcgis, csv }; // add new adapters here
export const fetchCity = city => adapters[city.source.type].fetch(city);
