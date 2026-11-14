// Writes public/data/sizes.json: the byte size of every file in public/textures and public/data, so the
// opening's progress bar knows the real total from its first frame (a slow HTTP/1.1 link otherwise
// learns each size only when that file's turn comes). Runs before every build (npm "prebuild").
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const OUT = 'data/sizes.json';
const sizes = {};
for (const dir of ['textures', 'data']) {
  for (const name of readdirSync(join(PUBLIC, dir)).sort()) {
    const path = `${dir}/${name}`;
    const stat = statSync(join(PUBLIC, path));
    if (stat.isFile() && path !== OUT) sizes[path] = stat.size;
  }
}
writeFileSync(join(PUBLIC, OUT), `${JSON.stringify(sizes, null, 1)}\n`);
