/**
 * auth.js — Módulo de autenticación frontend
 * inicio.red.bo — ES Module
 */

export class AuthModule {
  constructor() {
    this.user = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;
    await this.checkAuthState();
    this._bindEvents();
  }

  async checkAuthState() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      this.user = data.user || null;
    } catch {
      this.user = null;
    }
    this._renderAuthUI();
    return this.user;
  }

  _renderAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userAvatar = document.getElementById('user-avatar');
    const adminLink = document.getElementById('admin-link');

    if (this.user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userAvatar) {
        userAvatar.style.display = 'flex';
        const img = userAvatar.querySelector('img') || document.createElement('img');
        img.src = this.user.avatar_url || '/icons/default-favicon.svg';
        img.alt = this.user.display_name || this.user.email;
        img.title = this.user.display_name || this.user.email;
        img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
        if (!userAvatar.contains(img)) userAvatar.appendChild(img);
      }
      if (adminLink && ['admin', 'super_admin'].includes(this.user.role)) {
        adminLink.style.display = 'flex';
      }
    } else {
      if (loginBtn) loginBtn.style.display = 'flex';
      if (userAvatar) userAvatar.style.display = 'none';
      if (adminLink) adminLink.style.display = 'none';
    }
  }

  _bindEvents() {
    // Login button
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.showLoginModal());
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // Submit link button
    const submitBtn = document.getElementById('submit-link-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.showSubmitLinkModal());
    }

    // User avatar dropdown
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
      userAvatar.addEventListener('click', () => this._toggleUserMenu());
    }
  }

  showLoginModal() {
    window.location.href = '/auth/google';
  }

  async logout() {
    await fetch('/auth/logout', { method: 'GET', credentials: 'include' });
    this.user = null;
    this._renderAuthUI();
    window.location.reload();
  }

  _toggleUserMenu() {
    let menu = document.getElementById('user-menu');
    if (menu) {
      menu.remove();
      return;
    }

    menu = document.createElement('div');
    menu.id = 'user-menu';
    menu.style.cssText = `
      position:fixed;
      top:64px;right:16px;z-index:9000;
      background:#111118;
      border:1px solid rgba(255,255,255,.1);
      border-radius:12px;
      padding:.5rem;
      min-width:200px;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
    `;

    const items = [
      { label: this.user?.display_name || this.user?.email || 'Usuario', type: 'header' },
      { label: 'Enviar enlace', action: () => this.showSubmitLinkModal(), icon: '➕' },
      ...(this.user?.role !== 'usuario' ? [{ label: 'Dashboard Admin', href: '/dashboard', icon: '⚙️' }] : []),
      { label: 'Cerrar sesión', action: () => this.logout(), icon: '🚪' }
    ];

    items.forEach(item => {
      const el = document.createElement(item.type === 'header' ? 'div' : item.href ? 'a' : 'button');
      if (item.type === 'header') {
        el.textContent = item.label;
        el.style.cssText = 'padding:.5rem .75rem;color:rgba(255,255,255,.5);font-size:.75rem;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:.25rem;display:block;';
      } else {
        el.style.cssText = 'display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-radius:8px;color:rgba(255,255,255,.9);font-size:.875rem;cursor:pointer;width:100%;text-align:left;background:none;border:none;text-decoration:none;transition:background .15s;';
        el.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
        if (item.href) el.href = item.href;
        if (item.action) el.addEventListener('click', () => { item.action(); menu.remove(); });
        el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,.06)');
        el.addEventListener('mouseleave', () => el.style.background = 'none');
      }
      menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // Close on outside click
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target.id !== 'user-avatar') {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  showSubmitLinkModal() {
    if (!this.user) {
      this.showLoginModal();
      return;
    }

    // Remove existing modal
    document.getElementById('submit-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'submit-modal';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10000;
      background:rgba(0,0,0,.7);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;padding:1rem;
    `;

    overlay.innerHTML = `
      <div style="background:#111118;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;max-width:480px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;">
          <h2 style="font-size:1.125rem;font-weight:600;">Enviar un enlace</h2>
          <button id="submit-modal-close" style="background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:1.25rem;line-height:1;">✕</button>
        </div>
        <form id="submit-link-form">
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.875rem;color:rgba(255,255,255,.6);margin-bottom:.375rem;">URL *</label>
            <input type="url" name="url_final" required placeholder="https://ejemplo.com" style="width:100%;background:#0d0d14;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.625rem .875rem;color:#fff;font-size:.875rem;outline:none;"/>
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.875rem;color:rgba(255,255,255,.6);margin-bottom:.375rem;">Título *</label>
            <input type="text" name="titulo" required maxlength="200" placeholder="Nombre del sitio" style="width:100%;background:#0d0d14;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.625rem .875rem;color:#fff;font-size:.875rem;outline:none;"/>
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.875rem;color:rgba(255,255,255,.6);margin-bottom:.375rem;">Descripción</label>
            <textarea name="descripcion" maxlength="500" rows="3" placeholder="Breve descripción del sitio..." style="width:100%;background:#0d0d14;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.625rem .875rem;color:#fff;font-size:.875rem;outline:none;resize:vertical;"></textarea>
          </div>
          <div style="margin-bottom:1.5rem;">
            <label style="display:block;font-size:.875rem;color:rgba(255,255,255,.6);margin-bottom:.375rem;">Categoría *</label>
            <select name="category_id" required id="submit-cat-select" style="width:100%;background:#0d0d14;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.625rem .875rem;color:#fff;font-size:.875rem;outline:none;">
              <option value="">Seleccionar categoría...</option>
            </select>
          </div>
          <div style="display:flex;gap:.75rem;">
            <button type="button" id="submit-cancel" style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.625rem;color:rgba(255,255,255,.7);cursor:pointer;font-size:.875rem;">Cancelar</button>
            <button type="submit" style="flex:2;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;padding:.625rem;color:#fff;cursor:pointer;font-size:.875rem;font-weight:600;">Enviar enlace</button>
          </div>
          <p id="submit-msg" style="text-align:center;font-size:.8rem;margin-top:.75rem;display:none;"></p>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Load categories
    fetch('/api/categories').then(r => r.json()).then(data => {
      const sel = document.getElementById('submit-cat-select');
      const cats = data.categories || [];
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.category_id;
        opt.textContent = c.name_es;
        sel.appendChild(opt);
      });
    }).catch(() => {});

    // Events
    document.getElementById('submit-modal-close').addEventListener('click', () => overlay.remove());
    document.getElementById('submit-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('submit-link-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = document.getElementById('submit-msg');
      try {
        const res = await fetch('/api/submit-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            url_final: fd.get('url_final'),
            titulo: fd.get('titulo'),
            descripcion: fd.get('descripcion'),
            category_id: fd.get('category_id')
          })
        });
        const data = await res.json();
        msg.style.display = 'block';
        if (res.ok) {
          msg.style.color = '#10b981';
          msg.textContent = '✅ Enlace enviado para revisión. ¡Gracias!';
          setTimeout(() => overlay.remove(), 2000);
        } else {
          msg.style.color = '#ef4444';
          msg.textContent = data.error || 'Error al enviar el enlace';
        }
      } catch {
        msg.style.display = 'block';
        msg.style.color = '#ef4444';
        msg.textContent = 'Error de red. Por favor intenta de nuevo.';
      }
    });
  }

  getUser() {
    return this.user;
  }

  isAdmin() {
    return this.user && ['admin', 'super_admin'].includes(this.user.role);
  }
}
