// Fetches live GitHub stats for a curated repo list and writes them to a JSON file.
//
//   node scripts/fetch-stats.mjs <list-file> <out-file> [array-key]
//
//   node scripts/fetch-stats.mjs repos.txt data.json frameworks
//   node scripts/fetch-stats.mjs agents-repos.txt agents-data.json items
//
// List lines are "owner/repo [tag1,tag2]" (# comments and blank lines ignored).
// Env: GITHUB_TOKEN (required), STALENESS_HOURS (default 20: repos fresher than this are carried forward).
// Extracted from the inline script that used to live in .github/workflows/fetch-stats.yml, so every
// index page shares one copy.
import fs from 'fs';
import https from 'https';

const [LIST_FILE, OUT_FILE, ARRAY_KEY = 'frameworks'] = process.argv.slice(2);
if (!LIST_FILE || !OUT_FILE) {
  console.error('usage: node scripts/fetch-stats.mjs <list-file> <out-file> [array-key]');
  process.exit(2);
}

// ── helpers ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch a GitHub API URL, following up to `maxRedirects` 301/302s.
 * Returns { ok: true, data, resolvedUrl } on success.
 * Returns { ok: false, status, reason, rateLimit?, redirectedTo? } on errors.
 *
 * Rate-limit responses (403/429) are returned immediately WITHOUT
 * retrying, so the caller can decide to save progress and stop.
 * Network errors and 5xx responses still retry up to `retries` times.
 */
async function get(url, retries = 3, maxRedirects = 5) {
  const options = {
    headers: {
      'Authorization':        `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':           'buildaharness-observatory'
    }
  };

  let currentUrl = url;

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await new Promise((resolve, reject) => {
          const req = https.get(currentUrl, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({
              statusCode: res.statusCode,
              headers:    res.headers,
              body
            }));
          });
          req.on('error', reject);
        });

        const { statusCode, headers, body } = result;

        if (statusCode === 200) {
          try {
            return { ok: true, data: JSON.parse(body), resolvedUrl: currentUrl };
          } catch (e) {
            return { ok: false, status: statusCode, reason: `JSON parse error: ${e.message}` };
          }
        }

        // ── Redirect: follow Location header ──────────────────
        if (statusCode === 301 || statusCode === 302) {
          const location = headers && headers['location'];
          if (!location) {
            return { ok: false, status: statusCode, reason: `Redirect (${statusCode}) with no Location header` };
          }
          if (redirect === maxRedirects) {
            return { ok: false, status: statusCode, reason: `Too many redirects (>${maxRedirects}) — final location: ${location}` };
          }
          // Log the redirect so repos.txt can be updated later
          console.warn(`  ↪ ${statusCode} redirect: ${currentUrl} → ${location}`);
          currentUrl = location;
          break; // break the retry loop, re-enter redirect loop with new URL
        }

        if (statusCode === 404) {
          return { ok: false, status: 404, reason: 'Not found — repo may have been deleted, renamed, or made private' };
        }

        // ── Rate limit: return immediately, no retry ──────────
        if (statusCode === 403 || statusCode === 429) {
          const resetEpoch = headers && headers['x-ratelimit-reset'];
          const resetAt    = resetEpoch
            ? new Date(parseInt(resetEpoch) * 1000).toISOString()
            : 'unknown';
          return {
            ok:        false,
            status:    statusCode,
            reason:    `Rate limited — limit resets at ${resetAt}`,
            rateLimit: true,
            resetAt
          };
        }

        if (statusCode >= 500) {
          if (attempt < retries) {
            const wait = attempt * 3000;
            console.warn(`  ⚠ HTTP ${statusCode} (attempt ${attempt}/${retries}). Retrying in ${wait / 1000}s…`);
            await sleep(wait);
            continue;
          }
          return { ok: false, status: statusCode, reason: `GitHub server error (${statusCode}) after ${retries} attempts` };
        }

        return { ok: false, status: statusCode, reason: `Unexpected HTTP status ${statusCode}` };

      } catch (networkErr) {
        if (attempt < retries) {
          const wait = attempt * 2000;
          console.warn(`  ⚠ Network error (attempt ${attempt}/${retries}): ${networkErr.message}. Retrying in ${wait / 1000}s…`);
          await sleep(wait);
        } else {
          return { ok: false, status: 0, reason: `Network error after ${retries} attempts: ${networkErr.message}` };
        }
      }
    }
    // If we broke out of the retry loop due to a redirect, continue
    // the redirect loop with the new currentUrl.
  }

  // Should never reach here, but just in case
  return { ok: false, status: 0, reason: 'Unexpected exit from fetch loop' };
}

// ── validate slug ──────────────────────────────────────────────

function validateSlug(slug) {
  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return `Invalid format — expected owner/repo (e.g. langchain-ai/langchain), got "${slug}"`;
  }
  if (/[^a-zA-Z0-9._-]/.test(parts[0]) || /[^a-zA-Z0-9._-]/.test(parts[1])) {
    return `Invalid characters in "${slug}" — only letters, numbers, hyphens, dots, and underscores are allowed`;
  }
  return null;
}

// ── validate manual tags ───────────────────────────────────────

function parseAndValidateTags(rawTagStr, slug) {
  if (!rawTagStr) return [];
  const tags    = rawTagStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const valid   = [];
  const invalid = [];
  for (const tag of tags) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
      valid.push(tag);
    } else {
      invalid.push(tag);
    }
  }
  if (invalid.length > 0) {
    console.warn(`  ⚠ ${slug}: dropping invalid manual tag(s): ${invalid.join(', ')} (use lowercase letters, numbers, hyphens only)`);
  }
  return valid;
}

// ── merge tags: manual + github topics, deduped ───────────────

function mergeTags(manualTags, githubTopics) {
  const seen   = new Set();
  const merged = [];
  for (const t of [...manualTags, ...githubTopics]) {
    if (!seen.has(t)) { seen.add(t); merged.push(t); }
  }
  return merged;
}

// ── load previous data.json ────────────────────────────────────

const STALENESS_MS = (parseInt(process.env.STALENESS_HOURS || '20', 10)) * 60 * 60 * 1000;

let previousMeta = null;
const existingMap = {};

try {
  const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  if (prev[ARRAY_KEY] && prev[ARRAY_KEY].length > 0) {
    previousMeta = { fetchedAt: prev.fetchedAt, count: prev.count };
    for (const fw of prev[ARRAY_KEY]) {
      existingMap[fw.fullName.toLowerCase()] = fw;
    }
    console.log(`Loaded previous ${OUT_FILE} — ${prev[ARRAY_KEY].length} entries from ${prev.fetchedAt}`);
  }
} catch (_) {
  console.log('No usable previous ${OUT_FILE} — starting fresh');
}

// ── parse repos.txt ────────────────────────────────────────────

const rawFile = fs.readFileSync(LIST_FILE, 'utf8');
const lines   = rawFile
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

const invalidEntries = [];
const entries        = [];

for (const line of lines) {
  const parts      = line.split(/\s+/);
  const slug       = parts[0];
  const rawTags    = parts[1] || '';
  const slugError  = validateSlug(slug);

  if (slugError) {
    invalidEntries.push({ slug, reason: slugError, status: 'invalid-format' });
    console.error(`  ✗ Skipping bad entry: ${slugError}`);
    continue;
  }

  const manualTags = parseAndValidateTags(rawTags, slug);
  entries.push({ slug, manualTags });
}

// Deduplicate slugs
const seenSlugs = new Set();
const dupeSkip  = [];
const unique    = entries.filter(({ slug }) => {
  const key = slug.toLowerCase();
  if (seenSlugs.has(key)) { dupeSkip.push(slug); return false; }
  seenSlugs.add(key);
  return true;
});
if (dupeSkip.length > 0) {
  console.warn(`  ⚠ Skipping ${dupeSkip.length} duplicate(s): ${dupeSkip.join(', ')}`);
}

// ── decide which repos need fetching ───────────────────────────

const now      = Date.now();
const toFetch  = [];
const carried  = [];

for (const entry of unique) {
  const existing = existingMap[entry.slug.toLowerCase()];
  if (existing && existing.lastFetchedAt) {
    const age = now - new Date(existing.lastFetchedAt).getTime();
    if (age < STALENESS_MS) {
      carried.push(existing);
      continue;
    }
  }
  toFetch.push(entry);
}

console.log(`\nParsed ${unique.length} repos from ${LIST_FILE}`);
console.log(`  ✓ Fresh (skipping)  : ${carried.length}`);
console.log(`  ↻ Stale (fetching)  : ${toFetch.length}`);
if (toFetch.length === 0) {
  console.log('\nAll repos are fresh — nothing to fetch.');
} else {
  const withTags = toFetch.filter(e => e.manualTags.length > 0);
  if (withTags.length > 0) {
    console.log(`  ${withTags.length} repo(s) have manual tags:`);
    withTags.forEach(e => console.log(`    ${e.slug}  →  ${e.manualTags.join(', ')}`));
  }
  console.log(`\nFetching…\n`);
}

// ── fetch ──────────────────────────────────────────────────────

const freshlyFetched = [];
const failures       = [...invalidEntries];
// Track redirected slugs so we can surface them in the summary
const redirectedSlugs = [];
let   rateLimitedAt  = null;

for (const { slug, manualTags } of toFetch) {
  // ── already hit the rate limit: carry forward or skip ────────
  if (rateLimitedAt !== null) {
    const existing = existingMap[slug.toLowerCase()];
    if (existing) {
      freshlyFetched.push(existing);
      failures.push({
        slug,
        reason: `Skipped — rate limited before this repo was reached (limit hit at ${rateLimitedAt})`,
        status: 'skipped-rate-limit'
      });
    } else {
      failures.push({
        slug,
        reason: `Not fetched — rate limited before this repo was reached and no previous data exists`,
        status: 'skipped-rate-limit'
      });
    }
    continue;
  }

  process.stdout.write(`  ${slug} … `);

  const repoRes = await get(`https://api.github.com/repos/${slug}`);

  // ── rate limit hit ───────────────────────────────────────────
  if (repoRes.rateLimit) {
    rateLimitedAt = new Date().toISOString();
    console.log(`⚠ RATE LIMITED — stopping fetch loop`);
    const existing = existingMap[slug.toLowerCase()];
    if (existing) {
      freshlyFetched.push(existing);
      failures.push({ slug, reason: repoRes.reason, status: repoRes.status });
    } else {
      failures.push({ slug, reason: repoRes.reason, status: repoRes.status });
    }
    await sleep(300);
    continue;
  }

  // ── other error ──────────────────────────────────────────────
  if (!repoRes.ok) {
    console.log(`✗ ${repoRes.reason}`);
    const existing = existingMap[slug.toLowerCase()];
    if (existing) {
      console.log(`    ↩ Keeping previous data for ${slug} (last fetched ${existing.lastFetchedAt ?? 'unknown'})`);
      freshlyFetched.push(existing);
    }
    failures.push({ slug, reason: repoRes.reason, status: repoRes.status });
    await sleep(300);
    continue;
  }

  // ── detect if the slug was renamed ───────────────────────────
  // GitHub redirects a renamed repo to /repositories/<id>, so the resolved URL says nothing useful;
  // the response's own full_name is the canonical owner/repo.
  const resolvedSlug = repoRes.data.full_name;
  if (resolvedSlug && resolvedSlug.toLowerCase() !== slug.toLowerCase()) {
    redirectedSlugs.push({ old: slug, new: resolvedSlug });
    console.warn(`\n  ⚠ ${LIST_FILE} needs updating: ${slug} → ${resolvedSlug}`);
  }

  // ── topics (non-fatal) ───────────────────────────────────────
  const topicsRes    = await get(`https://api.github.com/repos/${slug}/topics`);
  const githubTopics = topicsRes.ok ? (topicsRes.data.names || []) : [];
  if (!topicsRes.ok) {
    if (topicsRes.rateLimit) {
      rateLimitedAt = new Date().toISOString();
      console.log(`⚠ RATE LIMITED on topics — stopping fetch loop`);
    } else {
      console.log(`⚠ fetched repo (topics unavailable: ${topicsRes.reason})`);
    }
  } else {
    console.log(`✓ ${repoRes.data.stargazers_count.toLocaleString()} ★`);
  }

  const allTags = mergeTags(manualTags, githubTopics);
  const d       = repoRes.data;

  freshlyFetched.push({
    name:           d.name,
    fullName:       d.full_name,
    description:    d.description  || '',
    url:            d.html_url,
    stars:          d.stargazers_count,
    forks:          d.forks_count,
    openIssues:     d.open_issues_count,
    watchers:       d.watchers_count,
    language:       d.language      || 'Unknown',
    license:        d.license       ? d.license.spdx_id : 'None',
    manualTags,
    githubTopics,
    topics:         allTags,
    updatedAt:      d.updated_at,
    pushedAt:       d.pushed_at,
    archived:       d.archived      || false,
    homepage:       d.homepage      || '',
    lastFetchedAt:  new Date().toISOString()
  });

  await sleep(250);
}

// ── merge results ──────────────────────────────────────────────

const allResults   = [...carried, ...freshlyFetched];
const seenFullName = new Set();
const results      = allResults.filter(fw => {
  const key = fw.fullName.toLowerCase();
  if (seenFullName.has(key)) return false;
  seenFullName.add(key);
  return true;
});

// ── summary ────────────────────────────────────────────────────

const hardFailures  = failures.filter(f => f.status !== 'invalid-format' && f.status !== 'skipped-rate-limit');

console.log('\n── Fetch Summary ──────────────────────────────────────────');
console.log(`  ✓ Freshly fetched : ${toFetch.length - failures.filter(f => f.status !== 'skipped-rate-limit').length}`);
console.log(`  ↩ Carried forward : ${carried.length + freshlyFetched.filter(fw => existingMap[fw.fullName.toLowerCase()] === fw).length}`);
console.log(`  ✗ Hard failures   : ${hardFailures.length}`);
if (rateLimitedAt) {
  const skipped = failures.filter(f => f.status === 'skipped-rate-limit').length;
  console.log(`  ⚠ Rate limited    : yes (hit at ${rateLimitedAt}) — ${skipped} repo(s) deferred to next run`);
}
if (hardFailures.length > 0) {
  hardFailures.forEach(f => console.log(`      • ${f.slug}  →  ${f.reason}`));
}
// ── print repos.txt update hints for any redirected slugs ──────
if (redirectedSlugs.length > 0) {
  console.log(`\n  ↪ ${LIST_FILE} slug(s) that should be updated (${redirectedSlugs.length}):`);
  redirectedSlugs.forEach(r => console.log(`      • ${r.old}  →  ${r.new}`));
}
console.log(`  ━ Total in output : ${results.length}`);

// ── guard: never overwrite good data with zero results ─────────

if (results.length === 0) {
  console.error('\n✗ CRITICAL: Zero repos in output — refusing to overwrite ${OUT_FILE}');
  process.exit(1);
}

// ── warn if hard-failure rate is high ──────────────────────────

const hardFailRate = hardFailures.length / Math.max(unique.length, 1);
if (hardFailRate > 0.25) {
  console.warn(`\n⚠ WARNING: ${Math.round(hardFailRate * 100)}% of repos had hard failures — check stale ${LIST_FILE} entries`);
}

// ── write data.json ────────────────────────────────────────────

const isPartial = rateLimitedAt !== null;

const output = {
  fetchedAt:  new Date().toISOString(),
  count:      results.length,
  ...(isPartial && {
    partial:       true,
    partialReason: `Rate limited at ${rateLimitedAt} — remaining repos deferred to next run`
  }),
  [ARRAY_KEY]: results,
  ...(failures.length > 0 && { fetchErrors: failures }),
  // Surface redirect hints in data.json so tooling can pick them up
  ...(redirectedSlugs.length > 0 && { slugRedirects: redirectedSlugs })
};

fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n✓ Wrote ${OUT_FILE} with ${results.length} entries${isPartial ? ' (partial run)' : ''}`);

// ── exit codes ─────────────────────────────────────────────────
//
//   0 — full success, partial run (rate limited), or some hard failures
//       (data was still written — commit step must always run)
//   1 — zero results (catastrophic, don't overwrite)

if (isPartial) {
  console.log('\n⚠ Run ended early due to rate limiting. Re-run manually or wait for the next schedule to fetch the remaining repos.');
  process.exit(0);
}

if (hardFailures.length > 0) {
  console.error(`\n⚠ ${hardFailures.length} repo(s) could not be fetched (see above). Fix ${LIST_FILE} and re-run.`);
  // Exit 0 so the commit step still runs — data was written for all repos that succeeded.
  process.exit(0);
}
