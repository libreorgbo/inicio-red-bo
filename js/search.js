/* search.js - Motor de búsqueda multi-tab - inicio.red.bo */
'use strict';

const SEARCH_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const TAB_CONFIG = {
  web: { fields: ['title', 'domain', 'description', 'tags'], category: null, external: null },
  videos: { fields: ['title', 'description'], category: null, external: 'https://www.youtube.com/results?search_query={q}+Bolivia' },
  noticias: { fields: ['title', 'description'], category: 'noticias', external: null },
  torrents: { fields: ['title'], category: null, external: 'https://1337x.to/search/{q}/1/' },
  subtitulos: { fields: ['title'], category: null, external: 'https://www.opensubtitles.org/es/search/query-{q}' }
};

let activeTab = 'web';
let debounceTimer = null;

// ── Cache helpers ────────────────────────────────
function cacheGet(key) {
  const e = SEARCH_CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { SEARCH_CACHE.delete(key); return null; }
  return e.data;
}

function cacheSet(key, data) {
  SEARCH_CACHE.set(key, { data, ts: Date.now() });
  if (SEARCH_CACHE.size > 200) {
    const oldest = [...SEARCH_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
    oldest.forEach(([k]) => SEARCH_CACHE.delete(k));
  }
}

// ── Fuzzy match (tolerance 1 char) ──────────────
function fuzzyMatch(text, query) {
  if (!text || !query) return false;
  text = text.toLowerCase();
  query = query.toLowerCase();
  if (text.includes(query)) return true;
  if (query.length <= 2) return false;
  for (let i = 0; i <= text.length - query.length + 1; i++) {
    let bad = 0;
    for (let j = 0; j < query.length && i + j < text.length; j++) {
      if (text[i + j] !== query[j]) bad++;
      if (bad > 1) break;
    }
    if (bad <= 1) return true;
  }
  return false;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const safe = escHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return safe.replace(re, '<mark class="search-highlight">$1</mark>');
}

// ── Filter in-memory links ───────────────────────
function filterLinks(links, query, cfg) {
  return links.filter(link => {
    if (cfg.category && link.category !== cfg.category) return false;
    return cfg.fields.some(f => {
      const val = Array.isArray(link[f]) ? link[f].join(' ') : (link[f] || '');
      return fuzzyMatch(val, query);
    });
  });
}

// ── Apply / clear highlights in DOM ─────────────
function applyHighlights(query) {
  document.querySelectorAll('.link-card').forEach(card => {
    ['card-title', 'card-description', 'card-domain'].forEach(cls => {
      const el = card.querySelector('.' + cls);
      if (!el) return;
      if (!el.dataset.orig) el.dataset.orig = el.textContent;
      el.innerHTML = highlight(el.dataset.orig, query);
    });
  });
}

function clearHighlights() {
  document.querySelectorAll('.link-card').forEach(card => {
    ['card-title', 'card-description', 'card-domain'].forEach(cls => {
      const el = card.querySelector('.' + cls);
      if (el && el.dataset.orig) el.textContent = el.dataset.orig;
    });
  });
}

// ── URL param sync ───────────────────────────────
function syncURL(q, tab) {
  const u = new URL(window.location.href);
  q ? u.searchParams.set('q', q) : u.searchParams.delete('q');
  (tab && tab !== 'web') ? u.searchParams.set('tab', tab) : u.searchParams.delete('tab');
  window.history.pushState({ q, tab }, '', u.toString());
}

// ── External search redirect banner ─────────────
function showExternalBanner(label, url) {
  let banner = document.getElementById('external-search-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'external-search-banner';
    banner.style.cssText = 'padding:12px 24px;background:var(--color-bg-tertiary);border-bottom:1px solid var(--color-glass-border);display:flex;align-items:center;gap:12px;font-size:var(--text-sm)';
    const main = document.querySelector('main') || document.body;
    main.prepend(banner);
  }
  banner.innerHTML = `<span>Buscar en ${escHtml(label)}:</span>
    <a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer"
       style="color:var(--color-accent-primary);text-decoration:underline">${escHtml(url)}</a>`;
  banner.style.display = 'flex';
}

function hideExternalBanner() {
  const b = document.getElementById('external-search-banner');
  if (b) b.style.display = 'none';
}

// ── Core search ──────────────────────────────────
async function performSearch(query, tab) {
  tab = tab || activeTab;
  const cfg = TAB_CONFIG[tab] || TAB_CONFIG.web;

  if (!query || query.length < 2) {
    clearHighlights();
    hideExternalBanner();
    return;
  }

  if (cfg.external) {
    const url = cfg.external.replace('{q}', encodeURIComponent(query));
    showExternalBanner(tab.charAt(0).toUpperCase() + tab.slice(1), url);
    clearHighlights();
    return;
  }

  hideExternalBanner();
  const key = `${tab}:${query.toLowerCase()}`;
  let results = cacheGet(key);

  if (!results) {
    const allLinks = (window.STATE && window.STATE.links) || [];
    results = filterLinks(allLinks, query, cfg);
    cacheSet(key, results);
  }

  applyHighlights(query);

  // Notify app to filter grid if hook defined
  if (typeof window.onSearchResults === 'function') {
    window.onSearchResults(results, query, tab);
  }
}

// ── Tab switch ───────────────────────────────────
function switchTab(tabId) {
  if (!TAB_CONFIG[tabId]) return;
  activeTab = tabId;
  document.querySelectorAll('[role="tab"], .search-tab-btn').forEach(t => {
    t.setAttribute('aria-selected', String(t.dataset.tab === tabId));
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  const q = (document.getElementById('search-input') || {}).value || '';
  syncURL(q.trim(), tabId);
  performSearch(q.trim(), tabId);
}

// ── Store originals on new cards ─────────────────
function storeOriginals() {
  document.querySelectorAll('.link-card').forEach(card => {
    ['card-title', 'card-description', 'card-domain'].forEach(cls => {
      const el = card.querySelector('.' + cls);
      if (el && !el.dataset.orig) el.dataset.orig = el.textContent;
    });
  });
}

// ── Init ─────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  const grid = document.getElementById('links-grid');
  if (grid) new MutationObserver(storeOriginals).observe(grid, { childList: true, subtree: false });

  input.addEventListener('input', e => {
    clearTimeout(debounceTimer);
    const q = e.target.value.trim();
    debounceTimer = setTimeout(() => {
      syncURL(q, activeTab);
      performSearch(q, activeTab);
    }, 300);
  });

  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearHighlights();
      hideExternalBanner();
      syncURL('', activeTab);
    });
  }

  document.querySelectorAll('[role="tab"], .search-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    tab.dataset.tab = tab.dataset.tab || tab.textContent.toLowerCase().trim();
  });

  window.addEventListener('popstate', e => {
    const { q = '', tab = 'web' } = e.state || {};
    if (input) input.value = q;
    switchTab(tab);
    performSearch(q, tab);
  });

  const params = new URLSearchParams(window.location.search);
  const urlQ = params.get('q');
  const urlTab = params.get('tab');
  if (urlTab && TAB_CONFIG[urlTab]) switchTab(urlTab);
  if (urlQ) {
    input.value = urlQ;
    performSearch(urlQ, urlTab || 'web');
  }

  console.log('[Search] initialized');
}

window.initSearch = initSearch;
window.performSearch = performSearch;
window.switchSearchTab = switchTab;
