/**
 * app.js — Orquestador principal de inicio.red.bo
 * ES Module
 */

import { SearchEngine } from './modules/search.js';
import { Directory } from './modules/directory.js';
import { AuthModule } from './modules/auth.js';

// ── Instancias globales ──────────────────────────────────────
const auth = new AuthModule();
const directory = new Directory();
let searchEngine = null;

// ── Interstitial state ──────────────────────────────────────
let interstitialTimer = null;
let interstitialUrl = '';

// ── DOM helpers ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Tema ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('redbo-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeBtn(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('redbo-theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = $('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
}

// ── Sidebar ──────────────────────────────────────────────────
function openSidebar() {
  const sidebar = $('sidebar-nav') || $('sidebar');
  const overlay = $('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
  }
  if (overlay) {
    overlay.classList.add('active');
    overlay.removeAttribute('aria-hidden');
  }
  const trigger = $('bento-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  const sidebar = $('sidebar-nav') || $('sidebar');
  const overlay = $('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
  }
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
  const trigger = $('bento-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function initSidebar() {
  const trigger = $('bento-trigger');
  const overlay = $('sidebar-overlay');
  const closeBtn = document.querySelector('.sidebar-close');

  trigger?.addEventListener('click', openSidebar);
  overlay?.addEventListener('click', closeSidebar);
  closeBtn?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });
}

// ── Search / Directory toggle ────────────────────────────────
function showSearchResults() {
  const searchSection = $('search-results');
  const dirSection = $('directory-section');
  if (searchSection) searchSection.hidden = false;
  if (dirSection) dirSection.style.display = 'none';
}

function showDirectory() {
  const searchSection = $('search-results');
  const dirSection = $('directory-section');
  if (searchSection) searchSection.hidden = true;
  if (dirSection) dirSection.style.display = '';
}

// ── Interstitial ─────────────────────────────────────────────
function showInterstitial(finalUrl, secs = 5) {
  const overlay = $('interstitial-overlay');
  const countEl = $('interstitial-count');
  const bar = $('interstitial-bar');
  const skipBtn = $('interstitial-skip');

  if (!overlay) { window.open(finalUrl, '_blank', 'noopener'); return; }

  interstitialUrl = finalUrl;
  overlay.hidden = false;
  if (countEl) countEl.textContent = secs;
  if (bar) bar.style.width = '100%';

  let remaining = secs;
  clearInterval(interstitialTimer);

  interstitialTimer = setInterval(() => {
    remaining--;
    if (countEl) countEl.textContent = remaining;
    if (bar) bar.style.width = `${(remaining / secs) * 100}%`;

    if (remaining <= secs - 3 && skipBtn) skipBtn.hidden = false;

    if (remaining <= 0) {
      clearInterval(interstitialTimer);
      overlay.hidden = true;
      window.open(finalUrl, '_blank', 'noopener');
    }
  }, 1000);
}

function initInterstitial() {
  const skipBtn = $('interstitial-skip');
  skipBtn?.addEventListener('click', () => {
    clearInterval(interstitialTimer);
    const overlay = $('interstitial-overlay');
    if (overlay) overlay.hidden = true;
    if (interstitialUrl) window.open(interstitialUrl, '_blank', 'noopener');
  });

  const overlay = $('interstitial-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      clearInterval(interstitialTimer);
      overlay.hidden = true;
    }
  });
}

// ── Marquee ──────────────────────────────────────────────────
async function initMarquee() {
  const track = $('marquee-track');
  if (!track) return;

  try {
    const res = await fetch('/api/categories?page=0&limit=20');
    const data = await res.json();
    const cats = data.categories || [];

    if (cats.length) {
      const items = cats.map(c => `<span>${c.icon_default || '🔗'} ${c.name_es}</span>`).join('<span>·</span>');
      track.innerHTML = items + '<span aria-hidden="true"> ' + items + '</span>';
    }
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSidebar();
  initInterstitial();

  // Tema toggle
  $('theme-toggle')?.addEventListener('click', toggleTheme);

  // Auth
  await auth.init();

  // Search engine
  searchEngine = new SearchEngine({
    onResults(items, query) {
      showSearchResults();
      const grid = $('search-results-grid');
      if (grid) searchEngine.renderResults(items, query, grid);
    },
    onClear() {
      showDirectory();
    }
  });
  await searchEngine.init();

  // Directory
  await directory.init();

  // Marquee
  initMarquee();
});

// ── PWA Service Worker ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Failed:', err));
  });
}
