import { CONFIG } from './config.js';
import { initTheme } from './ui/theme.js';

initTheme(document.querySelector('#theme'), () => {});
document.querySelector('#refresh-minutes').textContent = String(CONFIG.refreshMs / 60000);
document.querySelector('[data-parking-source]').href = CONFIG.cities[0].layers[0].source.url;
