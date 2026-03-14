import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const cheerio = require('../node_modules/cheerio');

const files = [
  ['history-middle-eastern-studies-minor.html', 'Middle Eastern Studies'],
  ['jewish-studies-jewish-studies-minor.html', 'Jewish Studies'],
  ['philosophy-philosophy-minor.html', 'Philosophy'],
];

for (const [file, name] of files) {
  const html = readFileSync('site/src/lib/scraper/fixtures/' + file, 'utf8');
  const $ = cheerio.load(html);

  const req = $('#requirementstextcontainer').first();
  console.log('=== ' + name + ' - #requirementstextcontainer children ===');
  if (!req.length) {
    console.log('  (no #requirementstextcontainer)');
    continue;
  }
  // Dump inner HTML, truncated
  const inner = req.html() || '';
  console.log(inner.slice(0, 3000));
  console.log('');
}
