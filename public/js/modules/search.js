/**
 * search.js — Motor de búsqueda multi-tab
 * inicio.red.bo
 */

export class SearchEngine {
  constructor(config) {
    this.currentTab = 'web';
    this.currentQuery = '';
    this.debounceTimer = null;
    this.DEBOUNCE_MS = 380;
    this.config = config; // { onResults: fn, onClear: fn }
    this.tabs = [];
  }

  async init() {
    await this._loadTabs();
    this._renderTabs();
    this._bindEvents();
  }

  async _loadTabs() {
    try {
      const res = await fetch('/api/engines');
      const data = await res.json();
      this.tabs = Array.isArray(data) ? data : [];
    } catch {
      this.tabs = [{ engine_slug: 'web', engine_name: 'Web', is_default: 1 }];
    }
    const def = this.tabs.find(t => t.is_default) || this.tabs[0];
    if (def) this.currentTab = def.engine_slug;
  }

  _renderTabs() {
    const container = document.getElementById('search-tabs');
    if (!container) return;

    container.innerHTML = this.tabs.map(tab => `
      <button
        role="tab"
        class="search-tab${tab.engine_slug === this.currentTab ? ' active' : ''}"
        data-slug="${tab.engine_slug}"
        aria-selected="${tab.engine_slug === this.currentTab}"
      >${tab.engine_name}</button>
    `).join('');
  }

  _bindEvents() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');
    const tabsEl = document.getElementById('search-tabs');

    if (!input) return;

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (clearBtn) clearBtn.hidden = !q;

      clearTimeout(this.debounceTimer);
      if (!q) { this.config.onClear?.(); return; }

      this.debounceTimer = setTimeout(() => {
        this.currentQuery = q;
        this.search(q, this.currentTab);
      }, this.DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this.debounceTimer);
        const q = input.value.trim();
        if (q) {
          this.currentQuery = q;
          this.search(q, this.currentTab);
        }
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        this.currentQuery = '';
        this.config.onClear?.();
        input.focus();
      });
    }

    if (tabsEl) {
      tabsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[role="tab"]');
        if (!btn) return;

        this.currentTab = btn.dataset.slug;
        tabsEl.querySelectorAll('[role="tab"]').forEach(t => {
          t.classList.toggle('active', t === btn);
          t.setAttribute('aria-selected', t === btn);
        });

        if (this.currentQuery) this.search(this.currentQuery, this.currentTab);
      });
    }
  }

  async search(query, engineSlug) {
    if (!query.trim()) { this.config.onClear?.(); return; }

    try {
      const params = new URLSearchParams({ q: query, engine: engineSlug });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      this.config.onResults?.(data.items || [], query);
    } catch {
      this.config.onResults?.([], query);
    }
  }

  renderResults(items, query, container) {
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<div class="search-empty">No se encontraron resultados para "<strong>${this._escape(query)}</strong>"</div>`;
      return;
    }

    const highlighted = (text) => {
      if (!text || !query) return text || '';
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    };

    container.innerHTML = items.map(item => `
      <article class="search-result-card">
        <div class="search-result-header">
          <img
            src="https://www.google.com/s2/favicons?sz=32&domain=${this._escape(item.displayLink || '')}"
            alt=""
            class="search-result-favicon"
            width="16" height="16"
            loading="lazy"
            onerror="this.src='/icons/default-favicon.svg'"
          >
          <span class="search-result-domain">${this._escape(item.displayLink || '')}</span>
        </div>
        <a href="${this._escape(item.link)}" class="search-result-title" target="_blank" rel="noopener">
          ${highlighted(item.title)}
        </a>
        <p class="search-result-snippet">${highlighted(item.snippet || '')}</p>
      </article>
    `).join('');
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
}
