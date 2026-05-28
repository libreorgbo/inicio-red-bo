/* modules.js - Sistema de módulos dinámicos - inicio.red.bo */
'use strict';

// ── Module Registry ──────────────────────────────
const ModuleRegistry = {
  _modules: new Map(),

  register(name, { render, init, destroy }) {
    this._modules.set(name, { name, render, init, destroy, instance: null });
  },

  get(name) { return this._modules.get(name); },
  all() { return [...this._modules.values()]; }
};

// ── Module: TopLinks ─────────────────────────────
ModuleRegistry.register('TopLinks', {
  render(links) {
    const top = [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);
    return `<section class="dyn-module" data-module="TopLinks">
      <h2 class="module-title">🔥 Más visitados esta semana</h2>
      <ol class="module-list">
        ${top.map((l, i) => `
          <li class="module-item" data-url="${l.url}" tabindex="0" role="link">
            <span class="rank">${i + 1}</span>
            <div class="item-info">
              <span class="item-title">${escHtml(l.title)}</span>
              <span class="item-domain">${escHtml(l.domain)}</span>
            </div>
            <span class="item-clicks">${formatNum(l.clicks || 0)}</span>
          </li>`).join('')}
      </ol>
    </section>`;
  },
  init(el) { bindModuleItems(el); },
  destroy() {}
});

// ── Module: NewLinks ─────────────────────────────
ModuleRegistry.register('NewLinks', {
  render(links) {
    const recent = [...links]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10);
    return `<section class="dyn-module" data-module="NewLinks">
      <h2 class="module-title">✨ Recién agregados</h2>
      <div class="module-grid">
        ${recent.map(l => `
          <div class="module-card" data-url="${l.url}" tabindex="0" role="link">
            <span class="item-title">${escHtml(l.title)}</span>
            <span class="item-domain">${escHtml(l.domain)}</span>
            <span class="cat-badge">${escHtml(l.category)}</span>
          </div>`).join('')}
      </div>
    </section>`;
  },
  init(el) { bindModuleItems(el); },
  destroy() {}
});

// ── Module: RandomPick ───────────────────────────
ModuleRegistry.register('RandomPick', {
  render(links) {
    const cats = [...new Set(links.map(l => l.category))].filter(Boolean);
    const picks = [];
    cats.slice(0, 5).forEach(cat => {
      const pool = links.filter(l => l.category === cat);
      if (pool.length) picks.push(pool[Math.floor(Math.random() * pool.length)]);
    });
    return `<section class="dyn-module" data-module="RandomPick">
      <h2 class="module-title">🎲 Descubrí algo nuevo</h2>
      <div class="module-grid module-grid--wide">
        ${picks.map(l => `
          <div class="module-card module-card--featured" data-url="${l.url}" tabindex="0" role="link">
            <span class="cat-badge">${escHtml(l.category)}</span>
            <span class="item-title">${escHtml(l.title)}</span>
            <span class="item-desc">${escHtml(l.description || '')}</span>
          </div>`).join('')}
      </div>
    </section>`;
  },
  init(el) { bindModuleItems(el); },
  destroy() {}
});

// ── Module: TrendingSearch ───────────────────────
ModuleRegistry.register('TrendingSearch', {
  render(links, meta) {
    const trending = (meta && meta.trending) || [
      'noticias Bolivia', 'salud pública', 'gobierno digital',
      'tecnología BO', 'educación online', 'fútbol boliviano'
    ];
    return `<section class="dyn-module" data-module="TrendingSearch">
      <h2 class="module-title">📈 Búsquedas populares</h2>
      <div class="trending-tags">
        ${trending.map(t => `
          <button class="trending-tag" data-query="${escHtml(t)}">${escHtml(t)}</button>
        `).join('')}
      </div>
    </section>`;
  },
  init(el) {
    el.querySelectorAll('.trending-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.query;
        const inp = document.getElementById('search-input');
        if (inp) { inp.value = q; inp.dispatchEvent(new Event('input')); }
        if (window.performSearch) window.performSearch(q);
      });
    });
  },
  destroy() {}
});

// ── Lazy render with IntersectionObserver ────────
function createPlaceholder(moduleName) {
  const el = document.createElement('div');
  el.className = 'module-placeholder';
  el.dataset.module = moduleName;
  el.style.cssText = 'min-height:200px;display:flex;align-items:center;justify-content:center';
  el.innerHTML = `<div class="loading-spinner" aria-label="Cargando ${moduleName}"></div>`;
  return el;
}

async function renderModule(name, container, links, meta) {
  const mod = ModuleRegistry.get(name);
  if (!mod) return;
  try {
    const html = mod.render(links, meta);
    container.innerHTML = html;
    const el = container.firstElementChild;
    if (el && mod.init) mod.init(el);
  } catch (e) {
    console.warn('[Modules]', name, 'render error:', e);
    container.innerHTML = '';
  }
}

function observeModule(placeholder, links, meta) {
  const name = placeholder.dataset.module;
  const io = new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      obs.disconnect();
      renderModule(name, placeholder, links, meta);
    }
  }, { rootMargin: '200px' });
  io.observe(placeholder);
}

// ── Fetch module config from API ─────────────────
async function fetchModuleConfig() {
  try {
    const r = await fetch('/api/modules/config');
    if (r.ok) return await r.json();
  } catch {}
  return {
    order: ['TopLinks', 'NewLinks', 'RandomPick', 'TrendingSearch'],
    visible: { TopLinks: true, NewLinks: true, RandomPick: true, TrendingSearch: true }
  };
}

// ── Mount modules after main grid ───────────────
async function initModules() {
  const grid = document.getElementById('links-grid');
  if (!grid) return;

  const [config, linksData] = await Promise.all([
    fetchModuleConfig(),
    Promise.resolve({ links: (window.STATE && window.STATE.links) || [], meta: {} })
  ]);

  const { order, visible } = config;
  const links = linksData.links;

  const container = document.createElement('div');
  container.id = 'dynamic-modules';
  container.style.cssText = 'padding:0 var(--space-6);max-width:1600px;margin:0 auto;display:grid;gap:var(--space-8)';
  grid.closest('main').appendChild(container);

  order.filter(name => visible[name] !== false).forEach(name => {
    const placeholder = createPlaceholder(name);
    container.appendChild(placeholder);
    observeModule(placeholder, links, config.meta);
  });

  // Re-render when links update
  window.addEventListener('linksUpdated', e => {
    const updated = (e.detail && e.detail.links) || [];
    container.querySelectorAll('.module-placeholder, .dyn-module').forEach(el => {
      const name = el.dataset.module;
      if (name) renderModule(name, el, updated, config.meta);
    });
  });

  console.log('[Modules] initialized:', order);
}

// ── Utils ────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function bindModuleItems(el) {
  el.querySelectorAll('[data-url]').forEach(item => {
    const open = () => window.open(item.dataset.url, '_blank', 'noopener,noreferrer');
    item.addEventListener('click', open);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
  });
}

window.ModuleRegistry = ModuleRegistry;
window.initModules = initModules;
