import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public');
const output = resolve(root, 'dist');
if (resolve(output, '..') !== root) throw new Error('Unsafe build output directory');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const index = await readFile(resolve(output, 'index.html'), 'utf8');
for (const required of ['app.js', 'styles.css']) {
  if (!index.includes(required)) {
    throw new Error(`index.html does not reference ${required}`);
  }
}
await access(resolve(output, 'matcher.js'));
await access(resolve(output, 'review-engine.js'));

console.log('Static Cloudflare Free build created in dist/.');
