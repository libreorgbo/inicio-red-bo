/* render.js - Motor de renderizado de tarjetas - inicio.red.bo */
'use strict';

// Favicon con fallback
function getFaviconHTML(link) {
  const letter = (link.title || link.domain || '?')[0].toUpperCase();
  const faviconUrl = 'https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(link.domain || link.url);
  return '<img class="card-favicon" src="' + faviconUrl + '" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">' +
         '<div class="card-favicon-fallback" style="display:none">' + letter + '</div>';
}

// Render individual card
function renderCard(link) {
  const isAd = link.sponsored || link.is_ad;
  const cardClass = 'link-card' + (isAd ? ' ad-card' : '');
  return '<article class="' + cardClass + '" data-id="' + link.id + '" data-url="' + (link.url || '#') + '" tabindex="0" role="link">' +
    (isAd ? '<span class="card-sponsored-badge">Publicidad</span>' : '') +
    '<div class="card-header">' +
      '<div style="display:flex;align-items:center;gap:0">' + getFaviconHTML(link) + '</div>' +
      '<div class="card-meta">' +
        '<div class="card-title">' + escapeHtml(link.title || link.domain) + '</div>' +
        '<div class="card-domain">' + escapeHtml(link.domain || '') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      '<p class="card-description">' + escapeHtml(link.description || '') + '</p>' +
    '</div>' +
    '<div class="card-footer">' +
      '<span class="card-category">' + escapeHtml(link.category || '') + '</span>' +
      '<span class="card-stats">' + formatClicks(link.clicks || 0) + '</span>' +
    '</div>' +
  '</article>';
}

// Skeleton loading cards
function renderLoadingCards(count) {
  const skeleton = '<article class="link-card" style="pointer-events:none">' +
    '<div class="card-header">' +
      '<div style="width:32px;height:32px;border-radius:8px;background:var(--color-bg-tertiary)"></div>' +
      '<div class="card-meta">' +
        '<div style="height:12px;width:70%;background:var(--color-bg-tertiary);border-radius:4px;margin-bottom:6px"></div>' +
        '<div style="height:10px;width:50%;background:var(--color-bg-tertiary);border-radius:4px"></div>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      '<div style="height:10px;width:90%;background:var(--color-bg-tertiary);border-radius:4px;margin-bottom:6px"></div>' +
      '<div style="height:10px;width:70%;background:var(--color-bg-tertiary);border-radius:4px"></div>' +
    '</div>' +
    '<div class="card-footer">' +
      '<div style="height:18px;width:60px;background:var(--color-bg-tertiary);border-radius:var(--radius-sm)"></div>' +
    '</div>' +
  '</article>';
  return Array(count).fill(skeleton).join('');
}
window.renderLoadingCards = renderLoadingCards;

// Main render function
function renderLinks(links, container, reset = false) {
  if (!container) return;
  if (!links || links.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div>' +
      '<h3 class="empty-state-title">Sin resultados</h3>' +
      '<p class="empty-state-desc">Intenta con otros terminos de busqueda</p></div>';
    return;
  }
  const html = links.map(renderCard).join('');
  if (reset) {
    container.innerHTML = html;
  } else {
    container.insertAdjacentHTML('beforeend', html);
  }
  bindCardEvents(container);
}
window.renderLinks = renderLinks;

// Card click events
function bindCardEvents(container) {
  container.querySelectorAll('.link-card[data-url]').forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound = '1';
    card.addEventListener('click', () => {
      const url = card.dataset.url;
      if (url && url !== '#') window.open(url, '_blank', 'noopener,noreferrer');
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
}

// Utilities
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatClicks(n) {
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n);
}
