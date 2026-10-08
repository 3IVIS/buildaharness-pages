// Writes _data/versions.json with the latest published versions of the Build A Harness
// packages, so pages and llms.txt can use {{ site.data.versions.<key> }} instead of hardcoded numbers.
//
//   node scripts/fetch-versions.mjs
//
// Sources: npm registry (published packages) and GitHub releases (desktop-v* tags).
// Env: GITHUB_TOKEN (optional; avoids the unauthenticated rate limit).
// On failure the existing file is left untouched and the script exits non-zero.
import fs from 'fs';

const OUT = '_data/versions.json';
const PACKAGES = ['aielia', 'harness', 'runtime', 'react', 'canvas'];
const REPO = '3IVIS/buildaharness';
const SEMVER = /^\d+\.\d+\.\d+$/;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'buildaharness-site-versions', ...headers } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const versions = {};
for (const pkg of PACKAGES) {
  const { version } = await getJson(`https://registry.npmjs.org/@buildaharness/${pkg}/latest`);
  if (!SEMVER.test(version)) throw new Error(`unexpected version for ${pkg}: ${version}`);
  versions[pkg] = version;
}

const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
const releases = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=50`, auth);
const desktop = releases
  .filter(r => !r.draft && !r.prerelease && /^desktop-v\d+\.\d+\.\d+$/.test(r.tag_name))
  .map(r => r.tag_name.slice('desktop-v'.length))
  .sort((a, b) => a.split('.').map(Number).reduce((d, n, i) => d || n - b.split('.')[i], 0))
  .pop();

let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
// Desktop releases are created as drafts by the build workflow; only a published one is downloadable.
// With none published, carry the last known version forward rather than break the download links.
if (desktop) versions.desktop = desktop;
else if (prev.desktop) {
  console.warn(`WARNING: no published desktop-v* release found; keeping desktop ${prev.desktop}`);
  versions.desktop = prev.desktop;
} else throw new Error('no published desktop-v* release found and no previous value');
const { fetchedAt, ...prevVersions } = prev;
if (JSON.stringify(prevVersions) === JSON.stringify(versions)) {
  console.log('versions unchanged:', JSON.stringify(versions));
} else {
  fs.mkdirSync('_data', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), ...versions }, null, 2) + '\n');
  console.log('versions updated:', JSON.stringify(versions));
}
