/**
 * IndexNow ping — manually notify Bing (and other IndexNow-participating engines; the
 * aggregator below propagates to all of them within ~10 seconds) that specific URLs
 * changed. Bing's index is what ChatGPT/Copilot retrieval draws from, which is the
 * actual reason this exists — it is not an SEO ranking play.
 *
 * NOT wired into build or deploy. Run manually after each content deploy:
 *
 *   node scripts/indexnow-ping.mjs https://lockpact.app/blog/some-post/ https://lockpact.app/blog/other-post/
 *   node scripts/indexnow-ping.mjs --all
 *     (reads every <loc> out of dist/sitemap-0.xml from the most recent `npm run build`
 *      — run the build first, this does not build for you)
 *
 * Endpoint: https://api.indexnow.org/indexnow — the Microsoft-run aggregator. Per the
 * IndexNow protocol this is the only endpoint you need to POST to; it fans out to every
 * other participating engine itself.
 *
 * Google does NOT participate in IndexNow at all. This will never move Google Search
 * Console impressions or rankings — don't expect GSC movement from running this. Its
 * value is entirely Bing (and whatever Bing feeds downstream).
 *
 * Requires the key file at public/<key>.txt (self-hosted verification, per the IndexNow
 * spec) to already be deployed and reachable at https://lockpact.app/<key>.txt. This
 * script reads the key from that file locally — it does not create or deploy it.
 *
 * Expected response: 200 or 202 (success). Known failure codes per the spec: 400
 * (invalid request params), 403 (key mismatch), 422 (URL/host mismatch), 429 (rate
 * limited). Max 10,000 URLs per POST.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const HOST = 'lockpact.app';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function findKey() {
  const match = readdirSync(publicDir).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!match) {
    throw new Error(`No IndexNow key file found in ${publicDir} (expected a 32-char hex "<key>.txt" file).`);
  }
  return match.replace(/\.txt$/, '');
}

function urlsFromSitemap() {
  const sitemapPath = path.join(rootDir, 'dist', 'sitemap-0.xml');
  if (!existsSync(sitemapPath)) {
    throw new Error(`${sitemapPath} not found — run "npm run build" first, or pass explicit URLs instead of --all.`);
  }
  const xml = readFileSync(sitemapPath, 'utf-8');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0) {
    throw new Error(`No <loc> entries found in ${sitemapPath}.`);
  }
  return urls;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/indexnow-ping.mjs <url> [url...]');
    console.error('       node scripts/indexnow-ping.mjs --all   (reads dist/sitemap-0.xml from the last build)');
    process.exit(1);
  }

  const urlList = args[0] === '--all' ? urlsFromSitemap() : args;

  for (const url of urlList) {
    if (!url.startsWith(`https://${HOST}`)) {
      throw new Error(`URL "${url}" is not on host "${HOST}" — IndexNow requires every urlList entry to match "host".`);
    }
  }

  const key = findKey();
  const keyLocation = `https://${HOST}/${key}.txt`;

  const body = { host: HOST, key, keyLocation, urlList };

  console.log(`Pinging IndexNow (${ENDPOINT}) with ${urlList.length} URL(s):`);
  for (const url of urlList) console.log(`  - ${url}`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`\nHTTP ${res.status} ${res.statusText}`);
  if (text) console.log(text);

  if (res.status !== 200 && res.status !== 202) {
    console.error('\nNon-success response. Status code meanings: 400 invalid request params, 403 key mismatch, 422 URL/host mismatch, 429 rate limited.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
