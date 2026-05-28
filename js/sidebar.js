/* sidebar.js - Bento menu, sidebar y tooltip - inicio.red.bo */
'use strict';

// ═══════════════════════════════════════════════
// SIDEBAR MODULE
// ═══════════════════════════════════════════════
const BENTO_ITEMS = [
  { label: 'Inicio', icon: '🏠', url: '/' },
  { label: 'Buscar', icon: '🔍', url: '/?q=' },
  { label: 'Noticias', icon: '📰', url: '/?cat=noticias' },
  { label: 'Gobierno', icon: '🏛', url: '/?cat=gobierno' },
  { label: 'Educacion', icon: '🎓', url: '/?cat=educacion' },
  { label: 'Salud', icon: '🩺', url: '/?cat=salud' },
  { label: 'Tech', icon: '💻', url: '/?cat=tecnologia' },
  { label: 'Negocios', icon: '💼', url: '/?cat=negocios' },
  { label: 'Deportes', icon: '⚽', url: '/?cat=deportes' }
];

function buildSidebar(sidebarEl) {
  const header = '<div class="sidebar-header">' +
    '<h2 style="font-size:var(--font-size-lg);font-weight:700">Menu</h2>' +
    '<button class="sidebar-close" id="sidebar-close" aria-label="Cerrar menu">' +
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 1l14 14M15 1L1 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
    '</button></div>';
  const grid = '<div class="bento-grid">' +
    BENTO_ITEMS.map(item =>
      '<a class="bento-item" href="' + item.url + '">' +
        '<div class="bento-item-icon">' + item.icon + '</div>' +
        '<span class="bento-item-label">' + item.label + '</span>' +
      '</a>'
    ).join('') +
  '</div>';
  sidebarEl.innerHTML = header + grid;
}

function openSidebar(sidebar, overlay) {
  sidebar.classList.add('active');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  sidebar.querySelector('#sidebar-close').focus();
}

function closeSidebar(sidebar, overlay) {
  sidebar.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function initSidebar() {
  const bentoBtn = document.getElementById('bento-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!bentoBtn || !sidebar || !overlay) return;
  buildSidebar(sidebar);
  bentoBtn.addEventListener('click', () => openSidebar(sidebar, overlay));
  overlay.addEventListener('click', () => closeSidebar(sidebar, overlay));
  sidebar.addEventListener('click', e => {
    if (e.target.closest('#sidebar-close')) closeSidebar(sidebar, overlay);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('active')) {
      closeSidebar(sidebar, overlay);
      bentoBtn.focus();
    }
  });
}
window.initSidebar = initSidebar;

// ═══════════════════════════════════════════════
// TOOLTIP MODULE
// ═══════════════════════════════════════════════
let tooltipEl = null;
let tooltipTimer = null;
const TOOLTIP_DELAY = 400;

function createTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip-content';
  tooltipEl.style.cssText = 'position:fixed;z-index:9999;max-width:260px;min-width:200px;padding:12px;pointer-events:none;opacity:0;transition:opacity .15s ease';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function positionTooltip(el, x, y) {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 12;
  let top = y + 12;
  if (left + rect.width > vw - 16) left = x - rect.width - 12;
  if (top + rect.height > vh - 16) top = y - rect.height - 12;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function showTooltip(card, e) {
  const tip = createTooltipEl();
  const title = card.querySelector('.card-title')?.textContent || '';
  const desc = card.querySelector('.card-description')?.textContent || '';
  const domain = card.querySelector('.card-domain')?.textContent || '';
  const favicon = card.querySelector('.card-favicon');
  const faviconSrc = favicon ? favicon.src : '';
  tip.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    (faviconSrc ? '<img src="' + faviconSrc + '" style="width:24px;height:24px;border-radius:6px;object-fit:cover" alt="">' : '') +
    '<div><span class="tooltip-title">' + title + '</span>' +
    '<span style="font-size:11px;color:var(--text-tertiary)">' + domain + '</span></div>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin:0">' + desc + '</p>';
  positionTooltip(tip, e.clientX, e.clientY);
  tip.style.opacity = '1';
}

function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (tooltipEl) tooltipEl.style.opacity = '0';
}

function initTooltips() {
  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.link-card');
    if (!card) { hideTooltip(); return; }
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => showTooltip(card, e), TOOLTIP_DELAY);
  });
  document.addEventListener('mousemove', e => {
    if (tooltipEl && tooltipEl.style.opacity === '1') positionTooltip(tooltipEl, e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('.link-card')) hideTooltip();
  });
}
window.initTooltips = initTooltips;

// Auto-init tooltips
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTooltips);
} else {
  initTooltips();
}
