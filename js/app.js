/* app.js - Bootstrap y orquestador principal - inicio.red.bo */
'use strict';

// ═══════════════════════════════════════════════
// CONFIG & CONSTANTS
// ═══════════════════════════════════════════════
const CONFIG = {
  PAGE_SIZE: 5,
  FIRST_ROW: 5,
  API_BASE: '/api',
  TOAST_DURATION: 3000,
  SEARCH_DEBOUNCE: 300,
  TOOLTIP_DELAY: 400
};

// Estado global
const STATE = {
  currentPage: 1,
  currentCategory: 'all',
  currentSearch: '',
  isLoading: false,
  hasMore: true,
  links: [],
  categories: []
};

// ═══════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════
const DOM = {
  linksGrid: null,
  searchInput: null,
  categoryTabs: null,
  loadMoreBtn: null,
  bentoBtn: null,
  sidebar: null,
  sidebarOverlay: null,
  sidebarClose: null,
  marqueeTrack: null,
  toastContainer: null
};

function initDOM() {
  DOM.linksGrid = document.getElementById('links-grid');
  DOM.searchInput = document.getElementById('search-input');
  DOM.categoryTabs = document.getElementById('category-tabs');
  DOM.loadMoreBtn = document.getElementById('load-more-btn');
  DOM.bentoBtn = document.getElementById('bento-btn');
  DOM.sidebar = document.getElementById('sidebar');
  DOM.sidebarOverlay = document.getElementById('sidebar-overlay');
  DOM.sidebarClose = document.getElementById('sidebar-close');
  DOM.marqueeTrack = document.getElementById('marquee-track');
  DOM.toastContainer = document.getElementById('toast-container');
}

// ═══════════════════════════════════════════════
// API LAYER
// ═══════════════════════════════════════════════
async function fetchLinks({ category = 'all', search = '', page = 1, limit = CONFIG.PAGE_SIZE } = {}) {
  const params = new URLSearchParams({ category, search, page, limit });
  try {
    const res = await fetch(CONFIG.API_BASE + '/links?' + params);
    if (!res.ok) throw new Error('API error ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('[app] fetchLinks error, using mock data:', err.message);
    return getMockData(category, search, page, limit);
  }
}

async function fetchCategories() {
  try {
    const res = await fetch(CONFIG.API_BASE + '/categories');
    if (!res.ok) throw new Error('API error ' + res.status);
    return await res.json();
  } catch {
    return getMockCategories();
  }
}

// ═══════════════════════════════════════════════
// MOCK DATA (fallback when API not available)
// ═══════════════════════════════════════════════
function getMockCategories() {
  return [
    { id: 'all', name: 'Todos', emoji: '🌎' },
    { id: 'noticias', name: 'Noticias', emoji: '📰' },
    { id: 'gobierno', name: 'Gobierno', emoji: '🏛' },
    { id: 'educacion', name: 'Educacion', emoji: '🎓' },
    { id: 'salud', name: 'Salud', emoji: '🩺' },
    { id: 'tecnologia', name: 'Tecnologia', emoji: '💻' },
    { id: 'negocios', name: 'Negocios', emoji: '💼' },
    { id: 'deportes', name: 'Deportes', emoji: '⚽' },
    { id: 'entretenimiento', name: 'Entertainment', emoji: '🎬' }
  ];
}

function getMockData(category, search, page, limit) {
  const base = [
    { id: 1, title: 'El Deber', domain: 'eldeber.com.bo', url: 'https://eldeber.com.bo', category: 'noticias', description: 'Noticias de Bolivia y el mundo', clicks: 1250 },
    { id: 2, title: 'Los Tiempos', domain: 'lostiempos.com', url: 'https://lostiempos.com', category: 'noticias', description: 'Periodico de Cochabamba', clicks: 980 },
    { id: 3, title: 'Pagina Siete', domain: 'paginasiete.bo', url: 'https://paginasiete.bo', category: 'noticias', description: 'Periodico nacional independiente', clicks: 870 },
    { id: 4, title: 'Bolivia.gob.bo', domain: 'bolivia.gob.bo', url: 'https://bolivia.gob.bo', category: 'gobierno', description: 'Portal del Estado Plurinacional', clicks: 650 },
    { id: 5, title: 'UMSA', domain: 'umsa.bo', url: 'https://umsa.bo', category: 'educacion', description: 'Universidad Mayor de San Andres', clicks: 540 },
    { id: 6, title: 'Red Uno', domain: 'reduno.com.bo', url: 'https://reduno.com.bo', category: 'noticias', description: 'Television y noticias', clicks: 430 },
    { id: 7, title: 'YPFB', domain: 'ypfb.gob.bo', url: 'https://ypfb.gob.bo', category: 'gobierno', description: 'Yacimientos Petroliferos Fiscales', clicks: 320 },
    { id: 8, title: 'Banco Union', domain: 'bancounion.com.bo', url: 'https://bancounion.com.bo', category: 'negocios', description: 'Banco estatal boliviano', clicks: 290 },
    { id: 9, title: 'BCB', domain: 'bcb.gob.bo', url: 'https://bcb.gob.bo', category: 'gobierno', description: 'Banco Central de Bolivia', clicks: 270 },
    { id: 10, title: 'Entel', domain: 'entel.bo', url: 'https://entel.bo', category: 'tecnologia', description: 'Empresa Nacional de Telecomunicaciones', clicks: 250 }
  ];
  let filtered = base;
  if (category !== 'all') filtered = filtered.filter(l => l.category === category);
  if (search) filtered = filtered.filter(l => l.title.toLowerCase().includes(search.toLowerCase()) || l.description.toLowerCase().includes(search.toLowerCase()));
  const start = (page - 1) * limit;
  return { links: filtered.slice(start, start + limit), total: filtered.length, hasMore: start + limit < filtered.length };
}

// ═══════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════
let searchTimer = null;
function onSearch(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    STATE.currentSearch = e.target.value.trim();
    STATE.currentPage = 1;
    STATE.links = [];
    loadLinks(true);
  }, CONFIG.SEARCH_DEBOUNCE);
}

// ═══════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════
async function initCategories() {
  const cats = await fetchCategories();
  STATE.categories = cats;
  if (!DOM.categoryTabs) return;
  DOM.categoryTabs.innerHTML = cats.map(c =>
    '<button class="cat-tab' + (c.id === 'all' ? ' active' : '') + '" data-cat="' + c.id + '">' +
    c.emoji + ' ' + c.name + '</button>'
  ).join('');
  DOM.categoryTabs.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    DOM.categoryTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.currentCategory = btn.dataset.cat;
    STATE.currentPage = 1;
    STATE.links = [];
    loadLinks(true);
  });
}

// ═══════════════════════════════════════════════
// LOAD LINKS
// ═══════════════════════════════════════════════
async function loadLinks(reset = false) {
  if (STATE.isLoading) return;
  STATE.isLoading = true;
  if (DOM.loadMoreBtn) DOM.loadMoreBtn.disabled = true;
  if (reset && DOM.linksGrid) {
    DOM.linksGrid.innerHTML = window.renderLoadingCards ? window.renderLoadingCards(CONFIG.FIRST_ROW) : '';
  }
  try {
    const data = await fetchLinks({
      category: STATE.currentCategory,
      search: STATE.currentSearch,
      page: STATE.currentPage,
      limit: CONFIG.PAGE_SIZE
    });
    if (reset) STATE.links = data.links;
    else STATE.links = [...STATE.links, ...data.links];
    STATE.hasMore = data.hasMore;
    STATE.currentPage++;
    if (window.renderLinks) window.renderLinks(STATE.links, DOM.linksGrid, reset);
  } catch (err) {
    console.error('[app] loadLinks error:', err);
    showToast('Error al cargar enlaces', 'error');
  } finally {
    STATE.isLoading = false;
    if (DOM.loadMoreBtn) {
      DOM.loadMoreBtn.disabled = false;
      DOM.loadMoreBtn.closest('.load-more-container').style.display = STATE.hasMore ? 'flex' : 'none';
    }
  }
}

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════
function showToast(msg, type = 'info') {
  if (!DOM.toastContainer) return;
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), CONFIG.TOAST_DURATION);
}
window.showToast = showToast;

// ═══════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] registered:', reg.scope);
    } catch (e) {
      console.warn('[SW] registration failed:', e);
    }
  }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
  initDOM();
  await Promise.all([initCategories(), loadLinks(true)]);
  if (DOM.searchInput) DOM.searchInput.addEventListener('input', onSearch);
  if (DOM.loadMoreBtn) DOM.loadMoreBtn.addEventListener('click', () => loadLinks(false));
  if (window.initSidebar) window.initSidebar();
  registerSW();
  console.log('[inicio.red.bo] App initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
