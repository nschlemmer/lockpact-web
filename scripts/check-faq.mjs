/**
 * FAQ integrity check: for every built blog post, each FAQPage JSON-LD question AND answer must also
 * appear as visible text on the page (schema must never promise content the reader can't see), and
 * visible FAQ items must all be in the schema (exactly one FAQ per post).
 *   npm run build && node scripts/check-faq.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const root = new URL('../dist/client/blog/', import.meta.url);
const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ');
const norm = (s) => decode(s).replace(/\s+/g, ' ').trim();

let posts = 0, failures = 0;
const rows = [];
for (const slug of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const file = new URL(`${slug}/index.html`, root);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  posts++;
  let schemaQs = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    const d = JSON.parse(m[1]);
    for (const n of Array.isArray(d) ? d : [d]) {
      if (n['@type'] === 'FAQPage') schemaQs = n.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));
    }
  }
  const visible = norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<\/?(a|strong|em|b|i|code|span)(\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' '));
  const missing = schemaQs.filter((x) => !visible.includes(norm(x.q)) || !visible.includes(norm(x.a)));
  const visibleH3 = (html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/) || [''])[0].match(/<h3/g)?.length ?? 0;
  const ok = missing.length === 0 && visibleH3 === schemaQs.length;
  if (!ok) failures++;
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${slug}: schema=${schemaQs.length} visible=${visibleH3}${missing.length ? ` missing=${missing.map((m) => JSON.stringify(m.q)).join('|')}` : ''}`);
}
console.log(rows.join('\n'));
console.log(`\n${posts} posts checked, ${failures} failing`);
process.exit(failures ? 1 : 0);
