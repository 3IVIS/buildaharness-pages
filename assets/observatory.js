/*
 * Observatory: the shared engine behind every index page (frameworks, agents, MCP servers, agent
 * skills, memory, harnesses). A page supplies its editorial content and a small config; this file
 * loads the data, renders the hero stats, filters and table, and handles sorting, search, shareable
 * URLs and the nav menu.
 *
 *   Observatory.init({
 *     data:     [{ file: 'data.json', key: 'frameworks', kind: 'Framework' }],   // one or more sources, merged
 *     noun:     { name: 'Framework', plural: 'frameworks' },
 *     columns:  ['stars', 'forks', 'language', 'license', 'updated', 'topics'],  // 'name' is always first
 *     filters:  ['language', 'topics'],
 *     stats:    [{ stat: 'count', label: 'Frameworks' }, { stat: 'stars', label: 'Total Stars' }, ...],
 *     search:   ['name', 'description', 'language', 'topics'],                    // fields the search box covers
 *     sort:     { col: 'stars', dir: 'desc' },                                    // optional
 *     wide:     false,                                                            // wider minimum table width
 *   });
 *
 * The page provides these elements: #loading-screen (#loader-bar, #loader-status), #pulse-dot,
 * #freshness-text, #error-banner (#error-msg), #obs-tabs (rendered here), #hero-stats, #search, #filters, #thead-row,
 * #table-body, #shown-count, #total-shown, #clear-filters.
 *
 * Repo names, descriptions, topics, languages and licenses are third-party text: every value that
 * reaches markup goes through esc(), and no handlers are inlined (clicks are delegated).
 */
(function () {
  'use strict';

  // ── helpers ────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => HTML_ESC[c]);
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
  const fmtBig = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  const DAY = 864e5;

  function ago(iso) {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso)) / DAY);
    if (d < 1) return 'today';
    if (d < 60) return d + 'd ago';
    if (d < 730) return Math.round(d / 30) + 'mo ago';
    return Math.round(d / 365) + 'y ago';
  }
  const isStale = iso => !!iso && (Date.now() - new Date(iso)) / DAY > 180;
  const uniq = (rows, key) => [...new Set(rows.map(r => r[key]).filter(Boolean))];

  const MAX_CHIPS = 6;
  const MATURITY_ORDER = { Production: 0, Emerging: 1, Research: 2, Experimental: 3 };
  const KNOWN_LANGS = ['Python', 'TypeScript', 'JavaScript', 'Go', 'Rust'];
  const langClass = l => KNOWN_LANGS.includes(l) ? 'lang-' + l : 'lang-fallback';

  // ── column registry ────────────────────────────────────────────────────
  // sort: 'num' | 'str' | 'date' | 'order' | null.  first: sort direction on first click.
  const COLUMNS = {
    stars: {
      label: 'Stars', sort: 'num', first: 'desc',
      cell: (f, x) => `<td><div class="stars-val"><span class="star-glyph">★</span>${fmt(f.stars || 0)}</div>` +
        `<div class="stars-bar-wrap"><div class="stars-bar" style="width:${Math.round(((f.stars || 0) / x.maxStars) * 100)}%"></div></div></td>`,
    },
    forks: { label: 'Forks', sort: 'num', first: 'desc', cell: f => `<td><span class="forks-val">${fmt(f.forks || 0)}</span></td>` },
    language: {
      label: 'Language', sort: 'str', first: 'asc',
      cell: f => `<td><span class="lang-badge ${langClass(f.language)}"><span class="lang-dot"></span>${esc(f.language || 'Unknown')}</span></td>`,
    },
    license: { label: 'License', sort: 'str', first: 'asc', cell: f => `<td><span class="license-badge">${esc(f.license || '—')}</span></td>` },
    updated: {
      label: 'Updated', sort: 'date', key: 'pushedAt', first: 'desc',
      cell: f => `<td><span class="upd-val${isStale(f.pushedAt) ? ' stale' : ''}">${ago(f.pushedAt)}</span></td>`,
    },
    role: { label: 'Role', sort: 'str', first: 'asc', cell: f => `<td><span class="kind-badge">${esc(f.role || '—')}</span></td>` },
    kind: { label: 'Type', sort: 'str', first: 'asc', cell: f => `<td><span class="kind-badge">${esc(f.kind || '—')}</span></td>` },
    layer: { label: 'Layer', sort: 'str', first: 'asc', cell: f => `<td><span class="layer-badge layer-${esc(f.layer)}">${esc(f.layer)}</span></td>` },
    memoryClass: { label: 'Memory Class', sort: 'str', first: 'asc', cell: f => `<td><div class="mem-class">${esc(f.memoryClass || '—')}</div></td>` },
    architecture: { label: 'Architecture', sort: 'str', first: 'asc', cell: f => `<td><div class="arch-val">${esc(f.architecture || '—')}</div></td>` },
    maturity: {
      label: 'Maturity', sort: 'order', first: 'asc',
      cell: f => `<td><span class="maturity-badge mat-${esc(f.maturity)}">${esc(f.maturity || '—')}</span></td>`,
    },
    topics: {
      label: 'Topics', sort: null,
      cell: (f, x) => {
        const all = f.topics || [];
        const chip = t => {
          const manual = (f.manualTags || []).includes(t);
          const cls = ['chip', manual ? 'manual' : '', x.sel.topics.has(t) ? 'active' : ''].filter(Boolean).join(' ');
          return `<span class="${cls}" data-filter="topics" data-v="${esc(t)}">${esc(t)}</span>`;
        };
        // Long topic lists make rows very tall: show the first few, tuck the rest behind "+N".
        const shown = all.slice(0, MAX_CHIPS).map(chip).join('');
        const rest = all.slice(MAX_CHIPS);
        const more = rest.length
          ? rest.map(t => chip(t).replace('class="chip', 'class="chip extra')).join('') +
            `<button type="button" class="chip more" data-more aria-expanded="false" title="Show all topics">+${rest.length}</button>`
          : '';
        return `<td><div class="chip-list">${shown + more || '<span class="no-topics">no topics</span>'}</div></td>`;
      },
    },
  };

  // ── filter registry ────────────────────────────────────────────────────
  // values(rows) -> the options to offer; match(row, selectedSet) -> boolean
  const scalar = (label, field, extra = {}) => ({
    label, field, values: rows => uniq(rows, field).sort(), match: (r, s) => s.has(r[field]), ...extra,
  });
  const FILTERS = {
    language: scalar('Lang', 'language', { dot: true }),
    layer: scalar('Layer', 'layer', { dot: true }),
    kind: scalar('Type', 'kind'),
    role: scalar('Role', 'role'),
    maturity: scalar('Maturity', 'maturity', {
      values: rows => Object.keys(MATURITY_ORDER).filter(m => rows.some(r => r.maturity === m)),
    }),
    topics: {
      label: 'Topic', field: 'topics',
      values: rows => {
        const c = {};
        rows.forEach(r => (r.topics || []).forEach(t => { c[t] = (c[t] || 0) + 1; }));
        return Object.entries(c).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 22).map(([t]) => t);
      },
      match: (r, s) => (r.topics || []).some(t => s.has(t)),
    },
  };

  // ── hero stat registry ─────────────────────────────────────────────────
  const STATS = {
    count: rows => rows.length,
    stars: rows => fmtBig(rows.reduce((s, r) => s + (r.stars || 0), 0)),
    languages: rows => uniq(rows, 'language').length,
    layers: rows => uniq(rows, 'layer').length,
    archs: rows => uniq(rows, 'architecture').length,
    production: rows => rows.filter(r => r.maturity === 'Production').length,
    kinds: rows => uniq(rows, 'kind').length,
    roles: rows => uniq(rows, 'role').length,
    topics: rows => new Set(rows.flatMap(r => r.topics || [])).size,
    active: rows => rows.filter(r => r.pushedAt && (Date.now() - new Date(r.pushedAt)) / DAY <= 30).length,
  };

  // ── engine ─────────────────────────────────────────────────────────────
  function init(cfg) {
    const noun = cfg.noun || { name: 'Item', plural: 'items' };
    const cols = cfg.columns || ['stars', 'forks', 'language', 'license', 'updated', 'topics'];
    const filterNames = cfg.filters || ['language', 'topics'];
    const searchFields = cfg.search || ['name', 'description', 'language', 'topics'];
    const state = { rows: [], maxStars: 1, search: '', sort: { ...(cfg.sort || { col: 'stars', dir: 'desc' }) }, sel: {} };
    filterNames.forEach(n => { state.sel[n] = new Set(); });
    if (!state.sel.topics) state.sel.topics = new Set(); // topic chips in rows are always clickable
    const colspan = cols.length + 1;

    // shareable state: ?q=&topic=&lang=&layer=&kind=&maturity=&sort=col:dir
    const URL_KEYS = { topics: 'topic', language: 'lang', layer: 'layer', kind: 'kind', role: 'role', maturity: 'maturity' };
    function readUrl() {
      const p = new URLSearchParams(location.search);
      if (p.get('q')) state.search = p.get('q');
      Object.entries(URL_KEYS).forEach(([name, key]) => {
        if (state.sel[name] && p.get(key)) p.get(key).split(',').filter(Boolean).forEach(v => state.sel[name].add(v));
      });
      const s = (p.get('sort') || '').split(':');
      if (s[0] && (COLUMNS[s[0]] || s[0] === 'name') && (s[1] === 'asc' || s[1] === 'desc')) state.sort = { col: s[0], dir: s[1] };
    }
    function writeUrl() {
      const p = new URLSearchParams();
      if (state.search) p.set('q', state.search);
      Object.entries(URL_KEYS).forEach(([name, key]) => { if (state.sel[name] && state.sel[name].size) p.set(key, [...state.sel[name]].join(',')); });
      const def = cfg.sort || { col: 'stars', dir: 'desc' };
      if (state.sort.col !== def.col || state.sort.dir !== def.dir) p.set('sort', state.sort.col + ':' + state.sort.dir);
      const qs = p.toString();
      try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (_) { /* file:// etc. */ }
    }

    const colKey = c => c === 'name' ? 'name' : (COLUMNS[c].key || c);
    const searchText = f => searchFields.map(k => Array.isArray(f[k]) ? f[k].join(' ') : (f[k] ?? '')).join(' ').toLowerCase();

    function filtered() {
      const q = state.search.toLowerCase();
      return state.rows.filter(f => {
        if (q && !searchText(f).includes(q)) return false;
        return Object.entries(state.sel).every(([name, set]) => !set.size || FILTERS[name].match(f, set));
      });
    }

    function sorted(rows) {
      const { col, dir } = state.sort, spec = col === 'name' ? { sort: 'str' } : COLUMNS[col], key = colKey(col);
      const sign = dir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        let r;
        if (spec.sort === 'num') r = (a[key] ?? 0) - (b[key] ?? 0);
        else if (spec.sort === 'order') r = (MATURITY_ORDER[a[key]] ?? 9) - (MATURITY_ORDER[b[key]] ?? 9);
        else r = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
        return r * sign;
      });
    }

    function renderHead() {
      const th = (c, label, spec) => {
        const on = state.sort.col === c;
        const icon = on ? state.sort.dir : 'none';
        return spec.sort
          ? `<th data-col="${c}" class="${on ? 'sorted' : ''}"><div class="th-inner">${esc(label)} <span class="sort-icon ${icon}"></span></div></th>`
          : `<th>${esc(label)}</th>`;
      };
      $('thead-row').innerHTML = th('name', noun.name, { sort: 'str' }) + cols.map(c => th(c, COLUMNS[c].label, COLUMNS[c])).join('');
    }

    function renderFilters() {
      const groups = filterNames.map(name => {
        const F = FILTERS[name], vals = F.values(state.rows);
        if (!vals.length) return '';
        const pills = vals.map(v => {
          const on = state.sel[name].has(v) ? ' active' : '';
          return `<span class="tag-pill${on}" data-filter="${name}" data-v="${esc(v)}">${F.dot ? '<span class="dot"></span>' : ''}${esc(v)}</span>`;
        }).join('');
        return `<div class="filter-group"><span class="filter-label">${esc(F.label)}</span><div>${pills}</div></div>`;
      });
      $('filters').innerHTML = groups.join('');
    }

    function renderTable() {
      const rows = sorted(filtered());
      $('shown-count').textContent = rows.length;
      $('total-shown').textContent = state.rows.length;
      const tbody = $('table-body');
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><span class="icon">— ∅ —</span>` +
          `<p>No ${esc(noun.plural)} match your filters</p><small>Try broadening your search or clearing active filters</small></div></td></tr>`;
        return;
      }
      const x = { maxStars: state.maxStars, sel: state.sel };
      tbody.innerHTML = rows.map((f, i) => {
        const arch = f.archived ? '<span class="archived-badge">archived</span>' : '';
        return `<tr style="animation-delay:${i * .016}s"><td>` +
          `<a class="fw-name-link" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name || f.slug)}${arch}<span class="fw-link-icon">↗</span></a>` +
          (f.description ? `<div class="fw-desc" title="${esc(f.description)}">${esc(f.description)}</div>` : '') + '</td>' +
          cols.map(c => COLUMNS[c].cell(f, x)).join('') + '</tr>';
      }).join('');
    }

    // Only let the table scroll sideways when it really overflows, so wide-enough screens keep the sticky header.
    function fitScroll() {
      const wrap = $('table-body').closest('.table-wrap'), table = wrap && wrap.querySelector('table');
      if (!wrap || !table) return;
      const over = table.offsetWidth > wrap.clientWidth + 1;
      wrap.classList.toggle('scrollable', over);
      if (over) wrap.setAttribute('tabindex', '0'); else wrap.removeAttribute('tabindex');
    }

    function render() { renderHead(); renderFilters(); renderTable(); writeUrl(); fitScroll(); }

    function renderStats() {
      const cells = (cfg.stats || []).map(s =>
        `<div class="hero-stat"><span class="hero-stat-val">${esc(STATS[s.stat](state.rows))}</span><span class="hero-stat-lbl">${esc(s.label)}</span></div>`);
      $('hero-stats').innerHTML = cells.join('<div class="stat-divider"></div>');
    }

    function setFreshness(iso) {
      const dot = $('pulse-dot'), text = $('freshness-text');
      if (!dot || !text) return;
      if (!iso) { dot.className = 'pulse-dot unknown'; text.textContent = 'unknown data age'; return; }
      const d = new Date(iso), h = (Date.now() - d) / 36e5;
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      if (h < 26) { dot.className = 'pulse-dot'; text.textContent = `fresh · ${label}`; }
      else { dot.className = 'pulse-dot stale'; text.textContent = `${Math.floor(h / 24)}d old · ${label}`; }
    }

    const setProgress = (pct, msg) => { $('loader-bar').style.width = pct + '%'; $('loader-status').textContent = msg; };
    function hideLoader() { const el = $('loading-screen'); if (!el) return; el.classList.add('hidden'); setTimeout(() => el.remove(), 450); }

    // ── events (delegated: no inline handlers) ──
    function toggle(name, v) {
      const s = state.sel[name]; if (!s) return;
      s.has(v) ? s.delete(v) : s.add(v);
      render();
    }
    $('filters').addEventListener('click', e => { const t = e.target.closest('[data-filter]'); if (t) toggle(t.dataset.filter, t.dataset.v); });
    $('table-body').addEventListener('click', e => {
      const more = e.target.closest('[data-more]');
      if (more) {
        const list = more.closest('.chip-list'), open = list.classList.toggle('expanded');
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
        more.textContent = open ? 'less' : '+' + list.querySelectorAll('.chip.extra').length;
        return;
      }
      const t = e.target.closest('.chip[data-filter]'); if (t) toggle(t.dataset.filter, t.dataset.v);
    });
    $('thead-row').addEventListener('click', e => {
      const th = e.target.closest('th[data-col]'); if (!th) return;
      const col = th.dataset.col, spec = col === 'name' ? { first: 'asc' } : COLUMNS[col];
      state.sort = state.sort.col === col ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: spec.first || 'asc' };
      render();
    });
    $('search').addEventListener('input', e => { state.search = e.target.value; render(); });
    $('clear-filters').addEventListener('click', () => {
      state.search = ''; $('search').value = '';
      Object.values(state.sel).forEach(s => s.clear());
      render();
    });

    // ── load ──
    async function load() {
      const sources = cfg.data;
      setProgress(20, `Fetching ${sources.map(s => s.file).join(', ')}…`);
      try {
        const v = new Date().toISOString().slice(0, 10);
        const jsons = await Promise.all(sources.map(async s => {
          const res = await fetch(`${s.file}?v=${v}`);
          if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
          return res.json();
        }));
        setProgress(70, 'Parsing…');
        const rows = [];
        jsons.forEach((j, i) => {
          const list = j[sources[i].key];
          if (!list || !list.length) throw new Error(`${sources[i].file} is empty — trigger the GitHub Actions workflow from the Actions tab first`);
          list.forEach(item => rows.push(sources[i].kind ? { ...item, kind: sources[i].kind } : item));
        });
        // an entry's role is its first curated tag (the harness list puts it first on every line)
        rows.forEach(r => { if (r.role === undefined && r.manualTags && r.manualTags.length) r.role = r.manualTags[0]; });
        state.rows = rows;
        state.maxStars = Math.max(...rows.map(f => f.stars || 0), 1);
        // the page is only as fresh as its oldest source
        setFreshness(jsons.map(j => j.fetchedAt).filter(Boolean).sort()[0]);
        setProgress(100, `Loaded ${rows.length} ${noun.plural}`);
        readUrl();
        $('search').value = state.search;
        renderStats();
        render();
        setTimeout(hideLoader, 350);
      } catch (err) {
        setProgress(100, 'Error loading data');
        setTimeout(() => {
          hideLoader();
          $('error-msg').textContent = err.message;
          $('error-banner').style.display = 'block';
          $('table-body').innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><span class="icon">— ⚠ —</span>` +
            `<p>Could not load ${esc(noun.plural)} data</p><small>${esc(err.message)}</small></div></td></tr>`;
        }, 300);
      }
    }

    const tableEl = $('table-body').closest('table');
    if (tableEl && cfg.wide) { tableEl.classList.add('wide'); document.body.classList.add('wide-page'); }
    window.addEventListener('resize', fitScroll);
    load();
  }

  // ── tab strip: one registry for every index page ──
  const TABS = [
    ['Frameworks', 'ai_agent_frameworks.html'],
    ['Agents', 'ai_agents.html'],
    ['Harnesses', 'agent_harnesses.html'],
    ['MCP servers', 'mcp_servers.html'],
    ['Agent skills', 'agent_skills.html'],
    ['Memory', 'ai_agent_memory_frameworks.html'],
  ];
  function initTabs() {
    const el = $('obs-tabs'); if (!el) return;
    const bare = p => p.split('/').pop().replace(/\.html$/, '');
    const here = bare(location.pathname);
    el.setAttribute('aria-label', 'Observatory indexes');
    el.innerHTML = '<div class="obs-tabs-inner">' + TABS.map(([label, href]) => {
      const on = bare(href) === here;
      return `<a class="obs-tab${on ? ' active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
    }).join('') + '</div>';
  }

  // ── nav menu (every page) ──
  function initNav() {
    const toggle = $('navToggle'), nav = $('navLinks') || $('siteNav');
    if (!toggle || !nav) return;
    const close = () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      toggle.setAttribute('aria-expanded', nav.classList.toggle('open') ? 'true' : 'false');
    });
    nav.addEventListener('click', e => { if (e.target.tagName === 'A') close(); });
    document.addEventListener('click', e => { if (!nav.contains(e.target) && !toggle.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  const boot = () => { initNav(); initTabs(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.Observatory = { init };
})();
