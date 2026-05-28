/* ads.js - Sistema de inyección de publicidad - inicio.red.bo */
'use strict';

const AD_INTERVAL = 5; // 1 ad per N organic cards

const MOCK_ADS = [
  {
    id: 'ad-1',
    title: 'Tigo Bolivia',
    url: 'https://tigo.com.bo',
    domain: 'tigo.com.bo',
    description: 'Internet y telefonía móvil. ¡Conectá Bolivia!',
    category: 'tecnologia',
    timeTarget: 'all',
    weight: 3,
    sponsored: true
  },
  {
    id: 'ad-2',
    title: 'Fassil Digital',
    url: 'https://fassil.com.bo',
    domain: 'fassil.com.bo',
    description: 'Abre tu cuenta bancaria 100% online desde Bolivia',
    category: 'negocios',
    timeTarget: 'tarde',
    weight: 3,
    sponsored: true
  },
  {
    id: 'ad-3',
    title: 'Viva',
    url: 'https://viva.com.bo',
    domain: 'viva.com.bo',
    description: 'Planes prepago y postpago para toda Bolivia',
    category: 'tecnologia',
    timeTarget: 'manana',
    weight: 2,
    sponsored: true
  },
  {
    id: 'ad-4',
    title: 'ATB Digital',
    url: 'https://atb.com.bo',
    domain: 'atb.com.bo',
    description: 'Señal en vivo y noticias de ATB Bolivia',
    category: 'noticias',
    timeTarget: 'noche',
    weight: 2,
    sponsored: true
  },
  {
    id: 'ad-5',
    title: 'Farmacorp',
    url: 'https://farmacorp.com',
    domain: 'farmacorp.com',
    description: 'Medicamentos y salud — Entrega a domicilio',
    category: 'salud',
    timeTarget: 'all',
    weight: 2,
    sponsored: true
  }
];

function getTimeSlot() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'manana';
  if (h >= 12 && h < 19) return 'tarde';
  return 'noche';
}

function pickAd(ads) {
  if (!ads.length) return null;
  const total = ads.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const ad of ads) {
    r -= ad.weight;
    if (r <= 0) return ad;
  }
  return ads[ads.length - 1];
}

function selectAd(category) {
  const slot = getTimeSlot();
  const pool = MOCK_ADS.filter(ad => {
    const catMatch = ad.category === 'all' || ad.category === category || category === 'all';
    const timeMatch = ad.timeTarget === 'all' || ad.timeTarget === slot;
    return catMatch && timeMatch;
  });
  return pickAd(pool.length ? pool : MOCK_ADS);
}

function buildAdCard(ad) {
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(ad.domain)}&sz=32`;
  return `
<article class="link-card ad-card" data-ad-id="${ad.id}" data-url="${ad.url}" tabindex="0" role="link"
  aria-label="${ad.title} — Patrocinado">
  <span class="sponsored-badge">Patrocinado</span>
  <div class="card-header">
    <img class="card-favicon" src="${favicon}" alt="" width="32" height="32"
         onerror="this.style.display='none'">
    <div class="card-meta">
      <span class="card-title">${ad.title}</span>
      <span class="card-domain">${ad.domain}</span>
    </div>
  </div>
  <p class="card-description">${ad.description}</p>
  <div class="card-footer">
    <span class="card-category">${ad.category}</span>
    <span class="card-stats">Publicidad</span>
  </div>
</article>`;
}

function bindAdEvents(grid) {
  grid.querySelectorAll('.ad-card').forEach(card => {
    const handler = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      const url = card.dataset.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', handler);
  });
}

function injectAds(grid, category) {
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.link-card:not(.ad-card)')];
  if (cards.length < AD_INTERVAL) return;

  // Remove existing ad cards to avoid duplicates
  grid.querySelectorAll('.ad-card').forEach(a => a.remove());

  const positions = [];
  for (let i = AD_INTERVAL - 1; i < cards.length; i += AD_INTERVAL) {
    positions.push(i);
  }

  positions.forEach(pos => {
    const ad = selectAd(category || 'all');
    if (!ad) return;
    const el = document.createElement('article');
    el.outerHTML; // trigger parse
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildAdCard(ad);
    const adCard = wrapper.firstElementChild;
    const refCard = cards[pos];
    if (refCard && refCard.nextSibling) {
      grid.insertBefore(adCard, refCard.nextSibling);
    } else {
      grid.appendChild(adCard);
    }
  });

  bindAdEvents(grid);
}

function initAds() {
  const grid = document.getElementById('links-grid');
  if (!grid) return;

  const getCategory = () => (window.STATE && window.STATE.currentCategory) || 'all';

  // Inject after first paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      injectAds(grid, getCategory());
    }, 100);
  });

  // Re-inject on grid updates (new cards loaded)
  const observer = new MutationObserver(() => {
    clearTimeout(observer._t);
    observer._t = setTimeout(() => injectAds(grid, getCategory()), 200);
  });
  observer.observe(grid, { childList: true });

  console.log('[Ads] initialized');
}

window.initAds = initAds;
window.injectAds = injectAds;
