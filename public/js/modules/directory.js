/**
 * directory.js — Motor de renderizado del directorio
 * Scroll infinito + algoritmo de anuncios rotativos
 */

function getAdPosition(rowNumber) { return (rowNumber * 2) % 5; }
function shouldInsertAd(rowNumber) { return rowNumber >= 2; }

export class Directory {
  constructor() {
    this.page = 0;
    this.PAGE_SIZE = 5;
    this.loading = false;
    this.hasMore = true;
    this.observer = null;
    this.rowCount = 0;
    this.colIndex = 0;
  }

  async init() {
    await this.loadPage(0);
    this._initInfiniteScroll();
  }

  async loadPage(page) {
    if (this.loading || !this.hasMore) return;
    this.loading = true;

    const loader = document.getElementById('grid-loader');
    if (loader) loader.hidden = false;

    try {
      const res = await fetch(`/api/categories?page=${page}&limit=${this.PAGE_SIZE}`);
      const { categories, hasMore } = await res.json();

      this.hasMore = hasMore;
      const startRow = this.rowCount;
      await this._insertAdsIntoGrid(categories, startRow);
    } catch (err) {
      console.error('[Directory] Error cargando categorías:', err);
    } finally {
      this.loading = false;
      if (loader) loader.hidden = true;
    }
  }

  async _insertAdsIntoGrid(categories, startRow) {
    const COLS = window.innerWidth >= 1200 ? 5 : (window.innerWidth >= 768 ? 3 : 1);
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < categories.length; i++) {
      const currentRow = Math.floor(this.colIndex / COLS);

      if (COLS === 5 && this.colIndex % COLS === getAdPosition(startRow + currentRow) && shouldInsertAd(startRow + currentRow)) {
        const adSlot = await this._fetchAndRenderAd();
        if (adSlot) {
          fragment.appendChild(adSlot);
          this.colIndex++;
        }
      }

      const card = this._buildCard(categories[i]);
      fragment.appendChild(card);
      this.colIndex++;

      if (this.colIndex % COLS === 0) this.rowCount++;
    }

    grid.appendChild(fragment);
    this.page++;
  }

  _buildCard(cat) {
    const card = document.createElement('article');
    card.className = 'link-card';
    card.style.setProperty('--category-color', cat.color_hex || '#6366f1');
    card.dataset.category = cat.slug;
    card.setAttribute('aria-label', `Categoría: ${cat.name_es}`);

    const links = (cat.links || []).slice(0, 10);

    card.innerHTML = `
      <div class="card-header">
        <div class="card-cat-icon" style="background:${cat.color_hex || '#6366f1'}20;border:1px solid ${cat.color_hex || '#6366f1'}40">
          ${this._escape(cat.icon_default || '🔗')}
        </div>
        <h3 class="card-title">${this._escape(cat.name_es)}</h3>
        <span class="card-count">${cat.link_count || 0}</span>
      </div>
      <ul class="card-links-list" role="list">
        ${links.map(link => this._renderLinkItem(link)).join('')}
        ${!links.length ? '<li class="card-empty">Sin enlaces aún</li>' : ''}
      </ul>
    `;

    this._bindTooltips(card);
    return card;
  }

  _renderLinkItem(link) {
    let domain = '';
    try { domain = new URL(link.url_final).hostname; } catch {}
    const faviconUrl = domain
      ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}`
      : '/icons/default-favicon.svg';

    const desc = link.descripcion_tooltip ? encodeURIComponent(link.descripcion_tooltip) : '';

    return `
      <li class="card-link-item" role="listitem">
        <a href="/r/${this._escape(link.hash_custom || String(link.link_id))}"
           class="card-link"
           data-link-id="${link.link_id}"
           data-tooltip="${desc}"
           data-title="${this._escape(link.titulo)}"
           rel="noopener"
           target="_blank">
          <img src="${faviconUrl}"
               alt=""
               class="link-favicon"
               loading="lazy"
               width="20" height="20"
               onerror="this.src='/icons/default-favicon.svg'">
          <span class="link-title">${this._escape(link.titulo)}</span>
        </a>
      </li>
    `;
  }

  _bindTooltips(card) {
    const tooltip = document.getElementById('link-tooltip');
    if (!tooltip) return;

    card.querySelectorAll('.card-link').forEach(link => {
      link.addEventListener('mouseenter', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const title = e.currentTarget.dataset.title || '';
        const desc = decodeURIComponent(e.currentTarget.dataset.tooltip || '');
        const faviconEl = e.currentTarget.querySelector('.link-favicon');

        const titleEl = tooltip.querySelector('.tooltip-title');
        const descEl = tooltip.querySelector('.tooltip-desc');
        const faviconSlot = tooltip.querySelector('.tooltip-favicon');

        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;
        if (faviconSlot && faviconEl) {
          faviconSlot.innerHTML = `<img src="${faviconEl.src}" width="16" height="16" style="border-radius:50%">`;
        }

        const top = Math.min(rect.bottom + 6, window.innerHeight - 80);
        const left = Math.min(rect.left, window.innerWidth - 260);
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.hidden = false;
        tooltip.setAttribute('aria-hidden', 'false');
      });

      link.addEventListener('mouseleave', () => {
        tooltip.hidden = true;
        tooltip.setAttribute('aria-hidden', 'true');
      });
    });
  }

  async _fetchAndRenderAd() {
    try {
      const res = await fetch('/api/ads/next');
      if (!res.ok) return null;
      const ad = await res.json();

      const adEl = document.createElement('div');
      adEl.className = 'link-card ad-card';
      adEl.setAttribute('aria-label', 'Publicidad');
      if (ad.ad_id) adEl.dataset.adId = ad.ad_id;

      adEl.innerHTML = ad.script_code_or_html ||
        '<div class="ad-placeholder">Publicidad</div>';

      if (ad.ad_id) this._observeAdImpression(adEl, ad.ad_id);
      return adEl;
    } catch {
      return null;
    }
  }

  _observeAdImpression(element, adId) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          try {
            navigator.sendBeacon('/api/analytics', JSON.stringify({
              type: 'impression',
              ad_id: adId,
              timestamp: Date.now()
            }));
          } catch {}
          observer.unobserve(element);
        }
      });
    }, { threshold: 0.5 });

    observer.observe(element);
  }

  _initInfiniteScroll() {
    const sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) return;

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.loading && this.hasMore) {
        this.loadPage(this.page);
      }
    }, { rootMargin: '200px' });

    this.observer.observe(sentinel);
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
}
