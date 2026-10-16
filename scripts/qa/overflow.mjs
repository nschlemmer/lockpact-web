/** Sideways-overflow check at phone and tablet widths: node scripts/qa/overflow.mjs <baseUrl> <slug>... */
import puppeteer from 'puppeteer-core';
const [base, ...slugs] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
let bad = 0;
for (const s of slugs) for (const w of [375, 390, 768, 820]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 800 });
  await p.goto(`${base}/blog/${s}/`, { waitUntil: 'networkidle0' });
  const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (sw > cw) { bad++; console.log('OVERFLOW', s, w, sw, cw); }
  await p.close();
}
await b.close();
console.log(bad ? `${bad} overflowing` : `no sideways overflow on ${slugs.length} pages at 375/390/768/820`);
