# 🚀 CLAUDE CODE — META-PROMPTS AVANZADOS
## Proyecto: inicio.red.bo | Ecosistema red.bo
### Instrucciones de uso: Copia cada bloque completo y pégalo en Claude Code (`claude` CLI o /chat en VS Code)

---

> **PROTOCOLO GLOBAL** — Aplica a TODOS los prompts:
> - Lee primero TODOS los archivos del proyecto existente antes de modificar
> - Usa `TodoWrite` para planificar tareas complejas antes de ejecutar
> - Ejecuta `Read` → `Edit` (nunca `Write` sobre archivos existentes sin leer primero)
> - Usa `Bash` para instalar deps, ejecutar tests y validar builds
> - Al finalizar cada prompt, ejecuta `wrangler deploy --dry-run` para verificar

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📦 PROMPT 1 — Arquitectura de Datos: Cloudflare D1 + KV Engine
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Arquitecto de Datos Cloud Nativo y DBA Senior especializado en Cloudflare D1 (SQLite edge) 
y Cloudflare KV. Estás modificando un proyecto existente en este directorio. 

PASO 0 — EXPLORACIÓN OBLIGATORIA:
Lee los siguientes archivos antes de escribir cualquier línea:
- Lee `wrangler.toml` para identificar bindings D1/KV actuales
- Lee `schema.sql` o cualquier archivo `.sql` existente en el proyecto
- Lista todos los archivos en `src/`, `db/`, `migrations/` si existen
- Identifica la versión de Wrangler con: bash "npx wrangler --version"

PASO 1 — CREA O MODIFICA: `db/schema.sql`
Genera el script SQL de inicialización completo. MODIFICA el archivo si ya existe 
(agrega las tablas faltantes sin destruir las existentes). Incluye:

-- ═══════════════════════════════════════════
-- TABLA: roles
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS roles (
  role_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name  TEXT NOT NULL UNIQUE CHECK(role_name IN ('super_admin','admin','usuario')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO roles (role_name) VALUES ('super_admin'),('admin'),('usuario');

-- ═══════════════════════════════════════════
-- TABLA: users
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  user_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id      TEXT UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT,
  avatar_url     TEXT,
  role_id        INTEGER NOT NULL DEFAULT 3 REFERENCES roles(role_id),
  status         TEXT NOT NULL DEFAULT 'pendiente' 
                   CHECK(status IN ('activo','suspendido','pendiente')),
  i18n_lang      TEXT NOT NULL DEFAULT 'es',
  session_token  TEXT,
  token_expires  DATETIME,
  affiliate_tag  TEXT UNIQUE,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ═══════════════════════════════════════════
-- TABLA: macro_categories
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS macro_categories (
  macro_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  name_es          TEXT NOT NULL,
  name_en          TEXT,
  name_pt          TEXT,
  icon_default     TEXT,
  sort_order       INTEGER DEFAULT 0,
  status           TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_macro_slug ON macro_categories(slug);

-- ═══════════════════════════════════════════
-- TABLA: categories
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS categories (
  category_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  macro_id         INTEGER REFERENCES macro_categories(macro_id) ON DELETE SET NULL,
  slug             TEXT NOT NULL UNIQUE,
  name_es          TEXT NOT NULL,
  name_en          TEXT,
  name_pt          TEXT,
  color_hex        TEXT NOT NULL DEFAULT '#6366f1',
  icon_default     TEXT,
  sort_order       INTEGER DEFAULT 0,
  status           TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cat_macro ON categories(macro_id);
CREATE INDEX IF NOT EXISTS idx_cat_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_cat_sort ON categories(sort_order);

-- ═══════════════════════════════════════════
-- TABLA: links (Core Engine)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS links (
  link_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  hash_custom          TEXT UNIQUE,
  category_id          INTEGER NOT NULL REFERENCES categories(category_id),
  user_id              INTEGER REFERENCES users(user_id),
  titulo               TEXT NOT NULL,
  url_final            TEXT NOT NULL,
  descripcion_tooltip  TEXT,
  favicon_url          TEXT,
  is_deep_link         INTEGER NOT NULL DEFAULT 0 CHECK(is_deep_link IN (0,1)),
  redirect_type        TEXT NOT NULL DEFAULT 'direct'
                         CHECK(redirect_type IN ('direct','interstitial_5s','pop_under')),
  interstitial_secs    INTEGER DEFAULT 5,
  total_clicks         INTEGER DEFAULT 0,
  total_impressions    INTEGER DEFAULT 0,
  owner_affiliate_tag  TEXT,
  user_affiliate_tag   TEXT,
  is_approved          INTEGER NOT NULL DEFAULT 0 CHECK(is_approved IN (0,1)),
  origen               TEXT DEFAULT 'manual' 
                         CHECK(origen IN ('manual','user_submit','AI_Harvester')),
  sort_order           INTEGER DEFAULT 0,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_links_hash ON links(hash_custom);
CREATE INDEX IF NOT EXISTS idx_links_approved ON links(is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_origen ON links(origen, is_approved);
-- Índice compuesto para scroll infinito paginado
CREATE INDEX IF NOT EXISTS idx_links_scroll ON links(category_id, is_approved, sort_order, link_id);

-- ═══════════════════════════════════════════
-- TABLA: search_engines
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS search_engines (
  engine_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_name  TEXT NOT NULL,
  engine_slug  TEXT NOT NULL UNIQUE,
  google_cse_id TEXT,
  search_url   TEXT,
  is_default   INTEGER DEFAULT 0 CHECK(is_default IN (0,1)),
  sort_order   INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo'))
);
INSERT OR IGNORE INTO search_engines (engine_name,engine_slug,is_default,sort_order) VALUES
  ('Web','web',1,1),
  ('Imágenes','images',0,2),
  ('Videos','videos',0,3),
  ('Noticias','news',0,4),
  ('Torrents','torrents',0,5),
  ('Subtítulos','subtitles',0,6);

-- ═══════════════════════════════════════════
-- TABLA: advertisements
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS advertisements (
  ad_id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_name              TEXT NOT NULL,
  formato              TEXT NOT NULL CHECK(formato IN ('1:1','4:5','9:16','728x90','300x250','160x600')),
  network_source       TEXT NOT NULL DEFAULT 'AdSense' 
                         CHECK(network_source IN ('AdSense','Custom','Affiliate')),
  script_code_or_html  TEXT,
  impresiones_compradas INTEGER DEFAULT 0,
  impresiones_servidas  INTEGER DEFAULT 0,
  geo_targeting        TEXT DEFAULT '[]',   -- JSON array: ["BO","AR","MX"] o [] para global
  device_targeting     TEXT DEFAULT 'all' CHECK(device_targeting IN ('desktop','mobile','all')),
  is_active            INTEGER DEFAULT 1 CHECK(is_active IN (0,1)),
  priority             INTEGER DEFAULT 5,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ads_active ON advertisements(is_active, device_targeting);

-- ═══════════════════════════════════════════
-- TABLA: seo_metadata
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seo_metadata (
  seo_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id    INTEGER UNIQUE REFERENCES categories(category_id),
  macro_id       INTEGER REFERENCES macro_categories(macro_id),
  og_title       TEXT,
  og_description TEXT,
  og_image_url   TEXT,
  meta_keywords  TEXT,
  canonical_url  TEXT,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════
-- TABLA: system_modules (Plugin Engine)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS system_modules (
  module_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_name        TEXT NOT NULL,
  module_slug        TEXT NOT NULL UNIQUE,
  sidebar_icon       TEXT DEFAULT '🧩',
  schema_patch       TEXT,    -- SQL ALTER TABLE statements
  ui_component_json  TEXT,    -- JSON: form fields definition
  routes_config      TEXT,    -- JSON: [{method,path,action}]
  status             TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
  created_by         INTEGER REFERENCES users(user_id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════
-- TABLA: analytics_events
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL CHECK(event_type IN ('click','impression','search','page_view')),
  link_id     INTEGER REFERENCES links(link_id),
  ad_id       INTEGER REFERENCES advertisements(ad_id),
  user_id     INTEGER REFERENCES users(user_id),
  country     TEXT,
  device_type TEXT,
  ip_hash     TEXT,  -- SHA-256 del IP para privacidad GDPR
  referrer    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_link ON analytics_events(link_id, created_at DESC);

PASO 2 — CREA: `db/migrations/001_initial.sql`
Copia el script anterior con encabezado de migración versionada.

PASO 3 — CREA O MODIFICA: `wrangler.toml`
Agrega/actualiza los bindings D1 y KV. Lee el archivo actual primero.
Asegura que existan:
[[d1_databases]]
binding = "DB"
database_name = "redbo-main"
database_id = "TU_DATABASE_ID_AQUI"

[[kv_namespaces]]
binding = "KV_CACHE"
id = "TU_KV_ID_AQUI"

PASO 4 — CREA: `src/lib/kv-strategy.md`
Documenta qué datos van en KV vs D1:
KV (TTL corto, lectura masiva):
- links activos por categoría: key=`cat:{slug}:links`, TTL=300s
- configuración de search engines: key=`engines:active`, TTL=3600s  
- anuncios activos por device+geo: key=`ads:{country}:{device}`, TTL=600s
- metadata SEO por categoría: key=`seo:{slug}`, TTL=86400s
- hash collections: key=`hash:{hash_custom}`, TTL=3600s

D1 (source of truth, escrituras y analíticas):
- Todas las escrituras (inserts, updates)
- Queries admin con filtros complejos
- Analíticas y reportes históricos

PASO 5 — EJECUTA VALIDACIÓN:
bash "cd db && sqlite3 /tmp/test.db < schema.sql && echo '✅ Schema válido'"
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🎨 PROMPT 2 — Frontend Premium PWA: Glassmorphism + Bento Grid
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Diseñador UI/UX e Ingeniero Frontend experto en Web Vitals, 
CSS avanzado y JavaScript Vanilla de alto rendimiento para Cloudflare Pages. 
Estás MODIFICANDO el proyecto existente en este directorio.

PASO 0 — EXPLORACIÓN OBLIGATORIA:
- Lee `public/index.html` o `src/index.html` (el que exista)
- Lee todos los archivos CSS en `public/css/` o `src/styles/`  
- Lee `public/js/main.js` o equivalente
- Lista la estructura completa del proyecto con: bash "find . -name '*.html' -o -name '*.css' | head -50"

PASO 1 — MODIFICA: `public/index.html`
Reconstruye la estructura HTML semántica completa. CONSERVA el contenido 
existente útil, MEJORA lo que sigue:

<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0a0f">
  <!-- PWA + SEO Meta tags dinámicos inyectados por Worker -->
  <title>inicio.red.bo — Tu portal de internet</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <!-- Google Fonts: Sora (display) + DM Sans (body) -->
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
</head>
<body>

  <!-- MARQUEE SUPERIOR -->
  <div class="marquee-wrapper" role="marquee" aria-label="Red de dominios">
    <div class="marquee-track" id="marquee-track">
      <!-- JS inyecta los links -->
    </div>
  </div>

  <!-- BANNER ADSENSE 728x90 -->
  <div class="ad-banner-top" id="ad-banner-728" aria-label="Publicidad">
    <!-- Slot AdSense inyectado por Worker -->
  </div>

  <!-- HEADER GLASSMORPHISM -->
  <header class="glass-header" role="banner">
    <div class="header-inner">
      <a href="/" class="logo-wordmark" aria-label="inicio.red.bo">
        <span class="logo-prefix">inicio</span><span class="logo-dot">.</span><span class="logo-domain">red.bo</span>
      </a>

      <!-- BUSCADOR GLASSMORPHISM -->
      <div class="search-glass-container" role="search">
        <div class="search-tabs" id="search-tabs" role="tablist" aria-label="Motor de búsqueda">
          <!-- Tabs inyectadas por JS desde /api/engines -->
        </div>
        <div class="search-input-wrapper">
          <span class="search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input 
            type="search" 
            id="search-input" 
            class="search-glass-input" 
            placeholder="Buscar en la web..."
            autocomplete="off"
            aria-label="Campo de búsqueda"
            aria-controls="search-results"
          >
          <button class="search-clear-btn" id="search-clear" aria-label="Limpiar búsqueda" hidden>✕</button>
        </div>
      </div>

      <!-- BENTO MENU 3x3 -->
      <div class="bento-trigger-container">
        <button class="bento-trigger" id="bento-trigger" 
                aria-label="Menú de navegación" 
                aria-expanded="false" 
                aria-controls="sidebar-nav">
          <div class="bento-grid-icon">
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
            <span></span><span></span><span></span>
          </div>
        </button>
      </div>
    </div>
  </header>

  <!-- SIDEBAR DESLIZABLE -->
  <aside class="sidebar-nav" id="sidebar-nav" role="navigation" aria-label="Navegación principal" aria-hidden="true">
    <div class="sidebar-header">
      <span class="sidebar-logo">red.bo</span>
      <button class="sidebar-close" aria-label="Cerrar menú">✕</button>
    </div>
    <nav class="sidebar-links" id="sidebar-links">
      <!-- JS inyecta módulos activos -->
    </nav>
    <div class="sidebar-footer">
      <button id="theme-toggle" aria-label="Cambiar tema">🌙 Modo Oscuro</button>
      <a href="/dashboard" id="nav-admin" hidden>⚙️ Admin</a>
      <button id="nav-login">👤 Ingresar</button>
    </div>
  </aside>
  <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>

  <!-- MAIN CONTENT -->
  <main class="main-content" id="main-content" role="main">
    
    <!-- SEARCH RESULTS (hidden by default) -->
    <section class="search-results-container" id="search-results" 
             role="region" aria-label="Resultados de búsqueda" hidden>
      <div class="search-results-grid" id="search-results-grid"></div>
    </section>

    <!-- DIRECTORIO PRINCIPAL — GRID 5 COLUMNAS -->
    <section class="directory-section" id="directory-section" 
             role="region" aria-label="Directorio de categorías">
      <div class="categories-grid" id="categories-grid" 
           aria-live="polite" aria-label="Categorías">
        <!-- Primera fila (5 tarjetas) renderizada por JS inmediato -->
        <!-- Resto cargado por IntersectionObserver (lazy) -->
      </div>
      
      <!-- SENTINEL para scroll infinito -->
      <div class="scroll-sentinel" id="scroll-sentinel" aria-hidden="true"></div>
      
      <!-- LOADER -->
      <div class="grid-loader" id="grid-loader" aria-label="Cargando..." hidden>
        <div class="loader-dots"><span></span><span></span><span></span></div>
      </div>
    </section>

  </main>

  <!-- TOOLTIP FLOTANTE (global, posicionado por JS) -->
  <div class="link-tooltip" id="link-tooltip" role="tooltip" aria-hidden="true">
    <div class="tooltip-favicon"></div>
    <div class="tooltip-content">
      <span class="tooltip-title"></span>
      <span class="tooltip-desc"></span>
    </div>
  </div>

  <!-- INTERSTITIAL OVERLAY -->
  <div class="interstitial-overlay" id="interstitial-overlay" hidden role="dialog" aria-modal="true">
    <div class="interstitial-card">
      <div class="interstitial-ad-slot" id="interstitial-ad"></div>
      <div class="interstitial-counter">
        Continuando en <span id="interstitial-count">5</span>s
        <div class="interstitial-progress"><div id="interstitial-bar"></div></div>
      </div>
      <button class="interstitial-skip" id="interstitial-skip" hidden>Saltar ahora →</button>
    </div>
  </div>

  <!-- SCRIPTS -->
  <script src="/js/app.js" type="module"></script>
  <script>
    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('SW registered:', reg.scope))
          .catch(err => console.warn('SW failed:', err));
      });
    }
  </script>
</body>
</html>

PASO 2 — CREA: `public/css/tokens.css`
Sistema de design tokens completo:
:root {
  /* Paleta principal — dark por defecto */
  --clr-bg-0: #07070d;
  --clr-bg-1: #0e0e1a;
  --clr-bg-2: #16162a;
  --clr-bg-3: #1e1e38;
  --clr-surface: rgba(255,255,255,0.04);
  --clr-border: rgba(255,255,255,0.08);
  --clr-border-hover: rgba(255,255,255,0.18);
  --clr-accent: #7c6eff;
  --clr-accent-glow: rgba(124,110,255,0.25);
  --clr-accent-2: #ff6e7c;
  --clr-text-primary: rgba(255,255,255,0.92);
  --clr-text-secondary: rgba(255,255,255,0.55);
  --clr-text-muted: rgba(255,255,255,0.28);
  --clr-success: #4ade80;
  --clr-warning: #fbbf24;
  --clr-danger: #f87171;
  
  /* Glass */
  --glass-bg: rgba(255,255,255,0.05);
  --glass-border: rgba(255,255,255,0.1);
  --glass-blur: blur(20px) saturate(180%);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
  
  /* Tipografía */
  --font-display: 'Sora', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Espaciado */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px;  --space-10: 40px;
  --space-12: 48px; --space-16: 64px;
  
  /* Grid */
  --grid-cols-desktop: 5;
  --grid-gap: 24px;
  --card-height: 280px;
  --card-radius: 16px;
  
  /* Transiciones */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 150ms;
  --dur-normal: 250ms;
  --dur-slow: 400ms;
}

[data-theme="light"] {
  --clr-bg-0: #f8f8fc;
  --clr-bg-1: #f0f0f8;
  --clr-bg-2: #e8e8f5;
  --clr-bg-3: #e0e0f0;
  --clr-surface: rgba(0,0,0,0.03);
  --clr-border: rgba(0,0,0,0.08);
  --clr-text-primary: rgba(10,10,30,0.92);
  --clr-text-secondary: rgba(10,10,30,0.55);
  --clr-text-muted: rgba(10,10,30,0.3);
  --glass-bg: rgba(255,255,255,0.7);
  --glass-border: rgba(0,0,0,0.08);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8);
}

PASO 3 — CREA: `public/css/components.css`
Incluye estilos para:
- `.marquee-wrapper` con `@keyframes marquee-scroll` y `will-change: transform`
- `.glass-header` con `backdrop-filter: var(--glass-blur)` y `position: sticky; top: 0`
- `.search-glass-input` con el efecto vidrio esmerilado premium
- `.bento-grid-icon span` con transición de la matriz 3×3 al estado open
- `.sidebar-nav` con `transform: translateX(-100%)` y transición `var(--ease-out)`
- `.link-card` con `height: var(--card-height)`, border-top dinámico via CSS var
- `.link-item-favicon` circular: `border-radius: 50%; object-fit: cover; width: 20px; height: 20px`
- `.link-tooltip` con `position: fixed; z-index: 9999; pointer-events: none`

PASO 4 — CREA: `public/css/layout.css`
Grid principal:
.categories-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols-desktop), 1fr);
  gap: var(--grid-gap);
  padding: var(--space-6);
}
@media (max-width: 1199px) {
  .categories-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 767px) {
  .categories-grid { grid-template-columns: 1fr; --grid-gap: 16px; }
}
/* Scroll interno de tarjetas */
.card-links-list {
  overflow-y: auto;
  max-height: 190px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}
.card-links-list::-webkit-scrollbar { width: 3px; }
.card-links-list::-webkit-scrollbar-track { background: transparent; }
.card-links-list::-webkit-scrollbar-thumb { 
  background: rgba(255,255,255,0.15); 
  border-radius: 99px; 
}

PASO 5 — CREA: `public/manifest.json`
{
  "name": "inicio.red.bo",
  "short_name": "inicio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#07070d",
  "theme_color": "#0a0a0f",
  "description": "Tu portal de internet en Bolivia",
  "icons": [
    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}

PASO 6 — CREA: `public/sw.js`
Service Worker con estrategia Cache First para assets estáticos y 
Network First para llamadas API. Versiona el cache con CACHE_VERSION = 'v1'.
Cache estático: CSS, JS, fuentes, iconos, manifest.
Exclude del cache: /api/, /auth/, /dashboard.

PASO 7 — VALIDACIÓN:
bash "npx lighthouse http://localhost:8787 --only-categories=performance --output=json | grep -E 'score|fcp|lcp'"
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🔍 PROMPT 3 — Motor de Búsqueda Multi-Tab + Scroll Infinito + Favicons
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Desarrollador Frontend Senior especialista en APIs, DOM avanzado 
y hilos asíncronos. Estás MODIFICANDO el proyecto existente.

PASO 0 — LEE PRIMERO:
- Lee `public/js/app.js` o el archivo JS principal existente
- Lee `src/worker.js` o `src/index.js` (Worker de Cloudflare)
- Identifica endpoints API ya implementados

PASO 1 — CREA: `public/js/modules/search.js`
Módulo de búsqueda con las siguientes funciones exportadas:

export class SearchEngine {
  constructor(config) {
    this.currentTab = 'web';
    this.currentQuery = '';
    this.debounceTimer = null;
    this.DEBOUNCE_MS = 380;
    this.config = config; // { tabs: [...], onResults: fn, onClear: fn }
  }

  init() {
    this._renderTabs();
    this._bindEvents();
  }

  _renderTabs() {
    // Lee /api/engines, renderiza tabs horizontales con el slug activo resaltado
    // Genera: <button role="tab" data-engine-id="1" data-slug="web" aria-selected="true">Web</button>
  }

  _bindEvents() {
    // Input event con debounce de 380ms
    // Keydown Enter: búsqueda inmediata sin debounce
    // Click en tab: cambia motor activo y re-ejecuta búsqueda si hay query
    // Click en resultado: abre en nueva pestaña con tracking
  }

  async search(query, engineSlug) {
    if (!query.trim()) { this.config.onClear(); return; }
    const params = new URLSearchParams({ q: query, engine: engineSlug });
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    this.config.onResults(data.items || [], query);
  }

  renderResults(items, query) {
    // Renderiza tarjetas de resultado con: título, snippet, favicon, URL display
    // Cada resultado: <article class="search-result-card">...</article>
    // Destaca el query en el snippet con <mark> tag
  }
}

PASO 2 — CREA: `public/js/modules/directory.js`
Motor de renderizado del directorio con scroll infinito:

export class Directory {
  constructor() {
    this.page = 0;
    this.PAGE_SIZE = 5; // 5 categorías = 1 fila desktop
    this.loading = false;
    this.hasMore = true;
    this.observer = null;
  }

  async init() {
    await this.loadPage(0); // Carga inmediata primera fila
    this._initInfiniteScroll();
  }

  async loadPage(page) {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    document.getElementById('grid-loader').hidden = false;
    
    const res = await fetch(`/api/categories?page=${page}&limit=${this.PAGE_SIZE}`);
    const { categories, hasMore } = await res.json();
    
    this.hasMore = hasMore;
    categories.forEach(cat => this._renderCard(cat));
    
    this.loading = false;
    document.getElementById('grid-loader').hidden = true;
  }

  _renderCard(cat) {
    // Genera la tarjeta con:
    // - border-top: 3px solid {cat.color_hex} (inyecta CSS var --category-color)
    // - height fija: var(--card-height) = 280px INAMOVIBLE
    // - Header: favicon circular + nombre categoría + badge count
    // - Lista de links con scroll interno si count > 6
    // - Cada link con favicon Google: `https://www.google.com/s2/favicons?sz=32&domain={domain}`
    // - Todos los favicons: border-radius 50%, object-fit cover, 20x20px
    
    const card = document.createElement('article');
    card.className = 'link-card';
    card.style.setProperty('--category-color', cat.color_hex);
    card.setAttribute('data-category', cat.slug);
    card.setAttribute('aria-label', `Categoría: ${cat.name_es}`);
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-cat-icon" style="background: ${cat.color_hex}20; border: 1px solid ${cat.color_hex}40">
          ${cat.icon_default || '🔗'}
        </div>
        <h3 class="card-title">${cat.name_es}</h3>
        <span class="card-count">${cat.link_count}</span>
      </div>
      <ul class="card-links-list" role="list">
        ${cat.links.map(link => this._renderLinkItem(link)).join('')}
      </ul>
    `;
    
    document.getElementById('categories-grid').appendChild(card);
    this._bindTooltips(card);
  }

  _renderLinkItem(link) {
    const domain = new URL(link.url_final).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    return `
      <li class="card-link-item" role="listitem">
        <a href="/r/${link.hash_custom || link.link_id}" 
           class="card-link" 
           data-link-id="${link.link_id}"
           data-tooltip="${encodeURIComponent(link.descripcion_tooltip || '')}"
           data-title="${link.titulo}"
           rel="noopener"
           target="_blank">
          <img src="${faviconUrl}" 
               alt="" 
               class="link-favicon" 
               loading="lazy"
               width="20" height="20"
               onerror="this.src='/icons/default-favicon.svg'">
          <span class="link-title">${link.titulo}</span>
        </a>
      </li>
    `;
  }

  _bindTooltips(card) {
    // Sistema de tooltips desacoplados: calcula posición con getBoundingClientRect()
    // NO modifica el layout de la tarjeta
    // Muestra og:metadata de forma elegante en caja flotante position:fixed
    const tooltip = document.getElementById('link-tooltip');
    
    card.querySelectorAll('.card-link').forEach(link => {
      link.addEventListener('mouseenter', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const title = e.currentTarget.dataset.title;
        const desc = decodeURIComponent(e.currentTarget.dataset.tooltip || '');
        const faviconSrc = e.currentTarget.querySelector('.link-favicon')?.src;
        
        tooltip.querySelector('.tooltip-title').textContent = title;
        tooltip.querySelector('.tooltip-desc').textContent = desc;
        if (faviconSrc) tooltip.querySelector('.tooltip-favicon').innerHTML = 
          `<img src="${faviconSrc}" width="16" height="16" style="border-radius:50%">`;
        
        // Posicionamiento inteligente (no sale del viewport)
        const top = Math.min(rect.bottom + 6, window.innerHeight - 80);
        const left = Math.min(rect.left, window.innerWidth - 260);
        tooltip.style.cssText = `top:${top}px; left:${left}px;`;
        tooltip.hidden = false;
        tooltip.setAttribute('aria-hidden', 'false');
      });
      
      link.addEventListener('mouseleave', () => {
        tooltip.hidden = true;
        tooltip.setAttribute('aria-hidden', 'true');
      });
    });
  }

  _initInfiniteScroll() {
    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.loading && this.hasMore) {
        this.page++;
        this.loadPage(this.page);
      }
    }, { rootMargin: '200px' });
    
    this.observer.observe(document.getElementById('scroll-sentinel'));
  }
}

PASO 3 — MODIFICA: `public/js/app.js`
Punto de entrada principal que importa y orquesta todos los módulos:
- Importa SearchEngine, Directory
- Inicializa ambos en DOMContentLoaded
- Maneja la lógica de show/hide entre search results y directory
- Gestiona el tema claro/oscuro (localStorage + prefers-color-scheme)
- Gestiona el sidebar: toggle, overlay click, escape key
- Maneja el interstitial overlay con countdown

VALIDACIÓN:
bash "npx wrangler dev --port 8787 &" y luego verifica que la primera fila cargue en <200ms
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🛣️ PROMPT 4 — Worker: Enrutador Edge Inteligente + Deep Links + Interstitials
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Ingeniero de Backend Senior experto en Cloudflare Workers, Edge Computing 
y patrones de arquitectura serverless. Estás MODIFICANDO el Worker existente.

PASO 0 — LEE PRIMERO:
- Lee COMPLETAMENTE `src/worker.js` o `src/index.js`
- Lee `wrangler.toml` para conocer todos los bindings disponibles
- Identifica rutas ya implementadas y no las dupliques

PASO 1 — MODIFICA: `src/worker.js`
Implementa el router central. Usa el patrón de router ligero (no itty-router, 
solo pattern matching nativo):

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ─── CORS preflight ───────────────────────────────────
    if (method === 'OPTIONS') return corsResponse();

    // ─── RUTAS PÚBLICAS ───────────────────────────────────
    if (path === '/' || path === '') 
      return handleHomePage(request, env, ctx);
    
    if (path.startsWith('/r/')) 
      return handleRedirect(request, env, ctx, path.slice(3));
    
    if (path === '/api/search')           return handleSearch(request, env);
    if (path === '/api/categories')       return handleCategories(request, env);
    if (path === '/api/engines')          return handleEngines(request, env);
    if (path === '/api/analytics/track')  return handleAnalytics(request, env, ctx);
    
    // ─── RUTAS AUTH ───────────────────────────────────────
    if (path === '/auth/google')          return handleGoogleAuth(request, env);
    if (path === '/auth/callback')        return handleGoogleCallback(request, env);
    if (path === '/auth/logout')          return handleLogout(request, env);
    
    // ─── RUTAS PROTEGIDAS (requieren JWT) ─────────────────
    if (path.startsWith('/api/admin/')) {
      const auth = await verifyJWT(request, env);
      if (!auth) return unauthorizedResponse();
      return handleAdminRoute(request, env, ctx, path, auth);
    }
    
    // ─── DASHBOARD ────────────────────────────────────────
    if (path.startsWith('/dashboard')) {
      const auth = await verifyJWT(request, env);
      if (!auth) return Response.redirect(`${url.origin}/auth/google`, 302);
      return handleDashboard(request, env, auth);
    }
    
    // ─── MÓDULOS DINÁMICOS ────────────────────────────────
    if (path.startsWith('/api/modules/'))
      return handleDynamicModule(request, env, ctx, path);
    
    // ─── ASSETS ESTÁTICOS (Cloudflare Pages serve) ────────
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};

// ═══════════════════════════════════════════════════════
// HANDLER: Redirección Inteligente
// ═══════════════════════════════════════════════════════
async function handleRedirect(request, env, ctx, hashOrId) {
  const url = new URL(request.url);
  
  // Intenta KV primero (cache caliente)
  const cached = await env.KV_CACHE.get(`hash:${hashOrId}`, { type: 'json' });
  let link = cached;
  
  if (!link) {
    const stmt = env.DB.prepare(
      `SELECT l.*, u.affiliate_tag as user_aff_tag 
       FROM links l LEFT JOIN users u ON l.user_id = u.user_id
       WHERE (l.hash_custom = ? OR l.link_id = ?) AND l.is_approved = 1`
    );
    const result = await stmt.bind(hashOrId, parseInt(hashOrId) || 0).first();
    if (!result) return new Response('Link no encontrado', { status: 404 });
    link = result;
    // Cache por 1 hora
    ctx.waitUntil(env.KV_CACHE.put(`hash:${hashOrId}`, JSON.stringify(link), { expirationTtl: 3600 }));
  }

  // Tracking asíncrono (no bloquea la respuesta)
  ctx.waitUntil(trackClick(request, env, link.link_id));

  // ── Deep Links (protocolos nativos) ──
  const DEEP_PROTOCOLS = ['whatsapp://', 'tg://', 'intent://', 'fb://', 'instagram://', 'twitter://'];
  const isDeepLink = DEEP_PROTOCOLS.some(p => link.url_final.startsWith(p)) || link.is_deep_link;
  
  if (isDeepLink) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': link.url_final,
        'X-Content-Type-Options': 'nosniff',
      }
    });
  }

  // ── Pop-under ──
  if (link.redirect_type === 'pop_under') {
    const popHtml = buildPopUnderHTML(link.url_final, await getActiveAd(env, request));
    return new Response(popHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' }});
  }

  // ── Interstitial ──
  if (link.redirect_type === 'interstitial_5s') {
    const adData = await getActiveAd(env, request);
    const affilTag = buildAffiliateURL(link, env.OWNER_AFFILIATE_TAG);
    const interstitialHtml = buildInterstitialHTML({
      link, 
      adData, 
      countdownSecs: link.interstitial_secs || 5,
      finalUrl: affilTag
    });
    return new Response(interstitialHtml, { 
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // ── Redirect directo ──
  const finalUrl = buildAffiliateURL(link, env.OWNER_AFFILIATE_TAG);
  return Response.redirect(finalUrl, 302);
}

// ═══════════════════════════════════════════════════════
// HANDLER: Búsqueda via Google CSE
// ═══════════════════════════════════════════════════════
async function handleSearch(request, env) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const engineSlug = searchParams.get('engine') || 'web';
  
  if (!query || query.length < 2) 
    return jsonResponse({ error: 'Query requerida', items: [] }, 400);

  // Obtiene CSE ID del engine seleccionado
  const engine = await env.DB.prepare(
    'SELECT * FROM search_engines WHERE engine_slug = ? AND status = ?'
  ).bind(engineSlug, 'activo').first();
  
  if (!engine?.google_cse_id) 
    return jsonResponse({ error: 'Motor no configurado', items: [] });

  const cseUrl = `https://customsearch.googleapis.com/customsearch/v1?` +
    `key=${env.GOOGLE_CSE_API_KEY}&cx=${engine.google_cse_id}&q=${encodeURIComponent(query)}&num=10`;
  
  const cseRes = await fetch(cseUrl);
  const cseData = await cseRes.json();
  
  const items = (cseData.items || []).map(item => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    displayLink: item.displayLink,
    favicon: `https://www.google.com/s2/favicons?sz=32&domain=${item.displayLink}`,
    image: item.pagemap?.cse_thumbnail?.[0]?.src || null
  }));

  return jsonResponse({ items, engine: engineSlug, query });
}

// ═══════════════════════════════════════════════════════
// HANDLER: Categorías con paginación
// ═══════════════════════════════════════════════════════
async function handleCategories(request, env) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '0');
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);
  const offset = page * limit;
  const hash = searchParams.get('hash');

  // Si hay hash, devuelve colección personalizada
  if (hash) {
    const cached = await env.KV_CACHE.get(`hash:${hash}`, { type: 'json' });
    if (cached) return jsonResponse(cached);
    // Query D1 para hash collection...
  }

  // Cache KV para primera página
  if (page === 0) {
    const cached = await env.KV_CACHE.get('cat:page:0', { type: 'json' });
    if (cached) return jsonResponse(cached);
  }

  const cats = await env.DB.prepare(`
    SELECT c.*, COUNT(l.link_id) as link_count,
      s.og_image_url
    FROM categories c
    LEFT JOIN links l ON l.category_id = c.category_id AND l.is_approved = 1
    LEFT JOIN seo_metadata s ON s.category_id = c.category_id
    WHERE c.status = 'activo'
    GROUP BY c.category_id
    ORDER BY c.sort_order ASC, c.category_id ASC
    LIMIT ? OFFSET ?
  `).bind(limit + 1, offset).all();

  const hasMore = cats.results.length > limit;
  const categories = cats.results.slice(0, limit);

  // Para cada categoría, carga sus links (máx 10 para render inicial)
  const categoriesWithLinks = await Promise.all(categories.map(async (cat) => {
    const linksRes = await env.DB.prepare(`
      SELECT link_id, hash_custom, titulo, url_final, descripcion_tooltip, 
             favicon_url, redirect_type, is_deep_link
      FROM links 
      WHERE category_id = ? AND is_approved = 1
      ORDER BY sort_order ASC, total_clicks DESC
      LIMIT 10
    `).bind(cat.category_id).all();
    return { ...cat, links: linksRes.results };
  }));

  const response = { categories: categoriesWithLinks, hasMore, page };
  
  if (page === 0) {
    env.KV_CACHE.put('cat:page:0', JSON.stringify(response), { expirationTtl: 300 });
  }
  
  return jsonResponse(response);
}

// ═══════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 's-maxage=60' : 'no-store'
    }
  });
}

function corsResponse() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

function buildAffiliateURL(link, ownerTag) {
  // Da prioridad al tag del owner (super_admin), luego al del usuario
  // Implementa lógica de reescritura de parámetros de afiliado
  return link.url_final; // expandir con lógica de afiliados
}

async function trackClick(request, env, linkId) {
  const cf = request.cf || {};
  const country = cf.country || 'XX';
  const ua = request.headers.get('user-agent') || '';
  const device = /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  const ipHash = await hashIP(request.headers.get('CF-Connecting-IP') || '');
  
  await env.DB.prepare(`
    INSERT INTO analytics_events (event_type, link_id, country, device_type, ip_hash)
    VALUES ('click', ?, ?, ?, ?)
  `).bind(linkId, country, device, ipHash).run();
  
  await env.DB.prepare(
    'UPDATE links SET total_clicks = total_clicks + 1 WHERE link_id = ?'
  ).bind(linkId).run();
}

async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'salt_redbo_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
}

PASO 2 — CREA: `src/templates/interstitial.html`
Template HTML del interstitial con:
- Diseño dark premium con el branding de inicio.red.bo
- Countdown circular SVG animado
- Slot de anuncio centrado (formato adaptativo por device)
- Progress bar animada con CSS `@keyframes`
- Botón "Ir ahora →" que aparece después de 3s
- Meta refresh como fallback: <meta http-equiv="refresh" content="6;url=FINAL_URL">

VALIDACIÓN:
bash "npx wrangler dev" y prueba GET /r/test123, GET /api/categories, GET /api/search?q=test&engine=web
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📊 PROMPT 5 — Algoritmo Publicitario Rotativo + Analytics Engine
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Científico de Datos e Ingeniero de Software especialista en 
algoritmos de ad-serving y analíticas web de alta concurrencia en Edge.

PASO 0 — LEE PRIMERO:
- Lee `src/worker.js` para entender la estructura actual del Worker
- Lee `public/js/modules/directory.js` para saber cómo se renderizan las tarjetas
- Lee `db/schema.sql` para verificar la estructura de la tabla `advertisements`

PASO 1 — CREA: `src/lib/ad-engine.js`
Módulo de inyección publicitaria:

/**
 * Algoritmo de rotación basada en módulo lineal
 * 
 * Fórmula: posicionAnuncio = (numeroDeFila * 2) % 5
 * 
 * Resultado verificado:
 * Fila 2 → columna (4%5)+1 = col 0 → posición 1
 * Fila 3 → columna (6%5)+1 = col 2 → posición 3  
 * Fila 4 → columna (8%5)+1 = col 4 → posición 5
 * Fila 5 → columna (10%5)+1 = col 0 → posición 1 (reinicia)
 * → Ciclo perfecto de 5 posiciones sin repetición adyacente
 */
export function getAdPosition(rowNumber) {
  if (rowNumber < 2) return null; // Fila 1 libre de anuncios
  return (rowNumber * 2) % 5; // 0-indexed (0=primera columna)
}

export function shouldInsertAd(rowNumber) {
  return rowNumber >= 2; // A partir de fila 2
}

/**
 * Selecciona el anuncio apropiado según geo + device + inventario disponible
 */
export async function selectAd(env, country, device) {
  // Intenta cache KV primero
  const cacheKey = `ads:${country}:${device}`;
  const cached = await env.KV_CACHE.get(cacheKey, { type: 'json' });
  if (cached) return cached;

  // Query priorizada: geo+device específico > device only > global
  const ad = await env.DB.prepare(`
    SELECT * FROM advertisements 
    WHERE is_active = 1
      AND (device_targeting = ? OR device_targeting = 'all')
      AND impresiones_servidas < impresiones_compradas
    ORDER BY 
      CASE WHEN geo_targeting LIKE '%"' || ? || '"%' THEN 0 ELSE 1 END,
      priority DESC,
      RANDOM()
    LIMIT 1
  `).bind(device, country).first();

  // Fallback a AdSense si no hay campaña activa
  const result = ad || { 
    network_source: 'AdSense', 
    script_code_or_html: env.ADSENSE_DEFAULT_CODE || '' 
  };

  await env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 });
  return result;
}

PASO 2 — MODIFICA: `public/js/modules/directory.js`
Integra el algoritmo de inyección en el renderizado del grid:

// En el método loadPage(), después de recibir las categorías:
async _insertAdsIntoGrid(categories, startRow) {
  const COLS = window.innerWidth >= 1200 ? 5 : (window.innerWidth >= 768 ? 3 : 1);
  const grid = document.getElementById('categories-grid');
  
  let colIndex = 0;
  const fragment = document.createDocumentFragment();
  
  for (let i = 0; i < categories.length; i++) {
    const rowNumber = startRow + Math.floor(colIndex / COLS);
    
    // Inserta ad ANTES de la categoría si corresponde
    if (COLS === 5 && colIndex % COLS === getAdPosition(rowNumber) && shouldInsertAd(rowNumber)) {
      const adSlot = await this._fetchAndRenderAd();
      if (adSlot) {
        fragment.appendChild(adSlot);
        colIndex++;
        // Si al insertar el ad completamos la fila, continúa
      }
    }
    
    const card = this._buildCard(categories[i]);
    fragment.appendChild(card);
    colIndex++;
  }
  
  grid.appendChild(fragment);
}

async _fetchAndRenderAd() {
  try {
    const res = await fetch('/api/ads/next');
    if (!res.ok) return null;
    const ad = await res.json();
    
    const adEl = document.createElement('div');
    adEl.className = 'link-card ad-card';
    adEl.setAttribute('aria-label', 'Publicidad');
    adEl.dataset.adId = ad.ad_id;
    adEl.innerHTML = ad.script_code_or_html || '<div class="ad-placeholder">Anuncio</div>';
    
    // Intersection Observer para tracking de impresiones
    this._observeAdImpression(adEl, ad.ad_id);
    return adEl;
  } catch { return null; }
}

_observeAdImpression(element, adId) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Beacon asíncrono — no bloquea el hilo principal
        navigator.sendBeacon('/api/analytics/track', JSON.stringify({
          type: 'impression',
          ad_id: adId,
          timestamp: Date.now()
        }));
        observer.unobserve(element); // Una sola vez por elemento
      }
    });
  }, { threshold: 0.5 }); // 50% visible = cuenta como impresión
  
  observer.observe(element);
}

// getAdPosition y shouldInsertAd son funciones puras (importadas o inline):
function getAdPosition(row) { return (row * 2) % 5; }
function shouldInsertAd(row) { return row >= 2; }

PASO 3 — AGREGA al Worker (`src/worker.js`):
El handler `/api/ads/next` y `/api/analytics/track`:

async function handleAdsNext(request, env) {
  const cf = request.cf || {};
  const country = cf.country || 'XX';
  const ua = request.headers.get('user-agent') || '';
  const device = /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  
  const ad = await selectAd(env, country, device);
  return jsonResponse(ad);
}

async function handleAnalytics(request, env, ctx) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  
  const body = await request.json().catch(() => null);
  if (!body) return new Response('Bad Request', { status: 400 });
  
  const cf = request.cf || {};
  const country = cf.country || 'XX';
  const ua = request.headers.get('user-agent') || '';
  const device = /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  const ipHash = await hashIP(request.headers.get('CF-Connecting-IP') || '');
  
  // Procesamiento asíncrono — NO bloquea la respuesta al cliente
  ctx.waitUntil((async () => {
    if (body.type === 'impression' && body.ad_id) {
      await env.DB.prepare(
        'UPDATE advertisements SET impresiones_servidas = impresiones_servidas + 1 WHERE ad_id = ?'
      ).bind(body.ad_id).run();
      
      await env.DB.prepare(`
        INSERT INTO analytics_events (event_type, ad_id, country, device_type, ip_hash)
        VALUES ('impression', ?, ?, ?, ?)
      `).bind(body.ad_id, country, device, ipHash).run();
    }
    
    if (body.type === 'click' && body.link_id) {
      await trackClick(request, env, body.link_id);
    }
  })());
  
  return new Response(null, { status: 202 }); // Accepted — respuesta inmediata
}

VALIDACIÓN:
bash "node -e \"
  function getAdPosition(r) { return (r*2)%5; }
  for(let r=2;r<=8;r++) console.log('Fila',r,'→ Col',getAdPosition(r)+1);
\""
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🔐 PROMPT 6 — Auth RBAC: Google OAuth2 + JWT Edge + Formulario de Envío
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Experto en Ciberseguridad e Ingeniero IAM especializado en 
autenticación OAuth2 en Cloudflare Workers con Web Crypto API nativa.

PASO 0 — LEE PRIMERO:
- Lee `src/worker.js` para identificar handlers de auth existentes
- Lee `wrangler.toml` para verificar variables de entorno definidas
- Ejecuta: bash "grep -r 'JWT\|auth\|login\|OAuth' src/ --include='*.js' -l"

PASO 1 — CREA: `src/lib/auth.js`
Sistema completo de autenticación:

const JWT_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };

// ── JWT: Sign ──────────────────────────────────────────
export async function signJWT(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), JWT_ALGORITHM, false, ['sign']
  );
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000) }));
  const data = `${header}.${body}`;
  const sig = await crypto.subtle.sign(JWT_ALGORITHM.name, key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
}

// ── JWT: Verify ────────────────────────────────────────
export async function verifyJWT(request, env) {
  try {
    const token = extractToken(request);
    if (!token) return null;
    
    const [header, payload, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.JWT_SECRET), JWT_ALGORITHM, false, ['verify']
    );
    
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      JWT_ALGORITHM.name, key, sigBytes, new TextEncoder().encode(`${header}.${payload}`)
    );
    
    if (!valid) return null;
    
    const decoded = JSON.parse(atob(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) return null; // Expirado
    
    return decoded;
  } catch { return null; }
}

function extractToken(request) {
  // 1. Cookie HttpOnly (preferida para SSO)
  const cookie = request.headers.get('Cookie') || '';
  const cookieMatch = cookie.match(/redbo_session=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];
  
  // 2. Authorization header (para API calls del dashboard)
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  
  return null;
}

// ── Google OAuth2 Flow ─────────────────────────────────
export function buildGoogleAuthURL(env, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code, env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  return res.json();
}

export async function getGoogleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.json();
}

// ── RBAC Middleware ────────────────────────────────────
export function requireRole(...allowedRoles) {
  return (authPayload) => {
    if (!authPayload) return false;
    return allowedRoles.includes(authPayload.role);
  };
}

export const canAdminLinks   = requireRole('admin', 'super_admin');
export const canSuperAdmin   = requireRole('super_admin');
export const canViewProfile  = requireRole('usuario', 'admin', 'super_admin');

// ── Sanitización de inputs ─────────────────────────────
export function sanitizeInput(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/[<>'"&]/g, c => ({'<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;','&':'&amp;'}[c]))
    .trim();
}

export function sanitizeURL(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Protocol invalid');
    return u.toString();
  } catch { return null; }
}

PASO 2 — AGREGA handlers al Worker (`src/worker.js`):
Implementa los 4 handlers de auth usando las funciones de `src/lib/auth.js`:

// handleGoogleAuth: genera state CSRF, redirige a Google
// handleGoogleCallback: intercambia code, busca/crea user en D1, genera JWT, 
//   setea cookie HttpOnly Secure SameSite=Strict, redirige a /dashboard o /
// handleLogout: borra la cookie, redirige a /
// handleSubmitLink: valida JWT, sanitiza inputs, valida URL con HEAD request,
//   inserta en D1 con is_approved=0, origen='user_submit', notifica queue

PASO 3 — CREA: `public/js/modules/auth.js`
Módulo frontend para:
- Verificar estado de autenticación en carga (GET /api/auth/me)
- Mostrar/ocultar botón Login vs perfil de usuario
- Formulario modal de envío de links con validación cliente
- Manejo del flujo post-login redirect

PASO 4 — AGREGA variables de entorno a `wrangler.toml`:
[vars]
GOOGLE_REDIRECT_URI = "https://inicio.red.bo/auth/callback"

# En producción, usa wrangler secret put:
# JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

VALIDACIÓN:
bash "npx wrangler secret list" para verificar secrets configurados
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📊 PROMPT 7 — Dashboard SPA Administrativo Avanzado
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Diseñador de Software Senior y Desarrollador Frontend experto en 
arquitecturas SPA y paneles de control empresariales avanzados.

PASO 0 — LEE PRIMERO:
- Lee `public/dashboard.html` si existe, o crea desde cero
- Lee `public/css/tokens.css` para reutilizar el sistema de design tokens
- Lee `src/worker.js` para conocer los endpoints de admin disponibles

PASO 1 — CREA: `public/dashboard.html`
SPA completo en un único archivo HTML con JavaScript modular inline:

La arquitectura del SPA debe seguir el patrón de Component Router:
- Un div `#app-shell` con sidebar + topbar fijos
- Un div `#module-view` que cambia dinámicamente (no recarga página)
- Estado global en `window.DashState = { user, module, data }`

MÓDULOS requeridos (cada uno como función renderModule_{nombre}()):

1. renderModuleOverview() — Dashboard Home
   - Cards de métricas: Total Links, Links Pendientes, Total Clics Hoy, 
     Impresiones de Ads (últimas 24h)
   - Gráfico de actividad últimos 7 días (barras SVG inline, sin librerías)
   - Feed de los últimos 10 links enviados por usuarios

2. renderModuleEngines() — Gestor de Buscadores
   - Tabla dinámica: id, nombre, slug, CSE_ID, estado, predeterminado
   - Inline editing: click en celda CSE_ID para editar directamente
   - Switch toggle para activar/desactivar (PUT /api/admin/engines/:id)
   - Botón [⭐ Predeterminado] que hace PUT /api/admin/engines/:id/default
   - Botón [+ Agregar Motor] con modal de formulario

3. renderModuleModeration() — Cola de Aprobación
   - Tabla con: favicon circular, categoría badge, título, URL (truncada), 
     usuario, fecha, origen (badge: "Usuario" | "IA Harvester")
   - 3 botones por fila: 
     [✅ Aprobar + Referido Usuario] → PUT .../approve?mode=user
     [💰 Aprobar + Mi Afiliado]     → PUT .../approve?mode=owner
     [❌ Rechazar]                   → DELETE .../reject
   - Filtros: Por origen, por categoría, por fecha
   - Paginación server-side

4. renderModuleAds() — Gestión de Publicidad
   - Formulario de nueva campaña: nombre, formato (radio buttons visuales 
     mostrando dimensiones), red (AdSense/Custom/Affiliate), código HTML,
     segmentación geo (chips de países con autocomplete ISO3166),
     segmentación device (radio: desktop/mobile/all)
   - Tabla de campañas activas con: progress bar impresiones (servidas/compradas)
   - Toggle activo/inactivo por campaña

5. renderModuleSEO() — SEO & Open Graph
   - Selector de categoría (dropdown)
   - Campos: og:title, og:description, og:image URL (con preview),
     meta keywords (tags input), canonical URL
   - Preview en tiempo real del cómo se verá en redes sociales (card mockup)
   - Botón guardar: PUT /api/admin/seo/:category_id

6. renderModuleUsers() — Gestión de Usuarios
   - Tabla con avatar, nombre, email, rol (badge coloreado), estado, fecha registro
   - Acciones: cambiar rol (select inline), suspender/activar

PASO 2 — DISEÑO VISUAL del Dashboard:
Usa las CSS variables de tokens.css. El tema del dashboard debe ser:
- Sidebar: 260px fijo, bg: var(--clr-bg-1), border-right: 1px solid var(--clr-border)
- TopBar: altura 60px, glass effect, flex justify-between
- Module View: bg: var(--clr-bg-0), padding: 32px
- Tablas: border-collapse, hover rows con fondo var(--clr-bg-2)
- Botones de acción: diseño pill con colores semánticos (green/yellow/red)
- Toggle switch: CSS puro (input[type=checkbox] + label con pseudo-elementos)

PASO 3 — CREA: `src/routes/admin.js`
Todos los handlers de la API admin:
- GET  /api/admin/stats     — métricas del overview
- GET  /api/admin/links     — lista paginada con filtros
- PUT  /api/admin/links/:id/approve
- PUT  /api/admin/links/:id/reject  
- GET  /api/admin/engines
- POST /api/admin/engines
- PUT  /api/admin/engines/:id
- PUT  /api/admin/engines/:id/default
- GET  /api/admin/ads
- POST /api/admin/ads
- PUT  /api/admin/ads/:id
- GET  /api/admin/seo/:category_id
- PUT  /api/admin/seo/:category_id
- GET  /api/admin/users
- PUT  /api/admin/users/:id/role

Todos los handlers deben:
1. Verificar JWT con verifyJWT()
2. Verificar rol mínimo requerido con canAdminLinks() o canSuperAdmin()
3. Retornar errores descriptivos en JSON
4. Invalida KV cache relevante tras cada escritura

VALIDACIÓN:
bash "npx wrangler dev" y navega a localhost:8787/dashboard
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🤖 PROMPT 8 — AI Link Harvester Engine (Cron Worker + LLM)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Ingeniero de Automatización experto en scraping inteligente, 
Cron Workers de Cloudflare y procesamiento semántico con LLMs.

PASO 0 — LEE PRIMERO:
- Lee `wrangler.toml` para verificar la sección [[triggers]] con crons
- Lee `db/schema.sql` para entender la estructura de links y categories
- Lee `src/worker.js` para el patrón de handlers existente

PASO 1 — MODIFICA: `wrangler.toml`
Agrega el trigger de cron:
[triggers]
crons = ["0 4 * * *"]  # Cada día a las 4AM UTC (medianoche en Bolivia GMT-4)

PASO 2 — MODIFICA: `src/worker.js`
Agrega el export del scheduled handler:

export default {
  async fetch(request, env, ctx) { /* ... código existente ... */ },
  
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAIHarvester(env));
  }
};

PASO 3 — CREA: `src/lib/ai-harvester.js`
Motor completo de harvesting:

export async function runAIHarvester(env) {
  const log = (msg) => console.log(`[AIHarvester ${new Date().toISOString()}] ${msg}`);
  log('Iniciando ciclo de harvest...');
  
  // ── 1. Obtener keywords y categorías desde D1 ──────────────────
  const { results: keywords } = await env.DB.prepare(`
    SELECT ak.keyword, ak.harvest_id, c.category_id, c.slug as category_slug, c.name_es
    FROM ai_harvest_keywords ak
    JOIN categories c ON ak.category_id = c.category_id
    WHERE ak.is_active = 1
    ORDER BY ak.last_harvested_at ASC NULLS FIRST
    LIMIT 5
  `).all();
  
  if (!keywords.length) { log('No hay keywords activas'); return; }
  
  // ── 2. Para cada keyword, buscar con Google CSE ────────────────
  const discovered = [];
  
  for (const kw of keywords) {
    log(`Buscando: "${kw.keyword}" → categoría: ${kw.category_slug}`);
    
    try {
      const cseUrl = `https://customsearch.googleapis.com/customsearch/v1?` +
        `key=${env.GOOGLE_CSE_API_KEY}&cx=${env.HARVESTER_CSE_ID}` +
        `&q=${encodeURIComponent(kw.keyword + ' herramienta plataforma web app')}` +
        `&num=10&gl=bo&lr=lang_es`;
      
      const cseRes = await fetch(cseUrl);
      const cseData = await cseRes.json();
      
      if (cseData.items) {
        for (const item of cseData.items) {
          discovered.push({
            keyword: kw.keyword,
            category_id: kw.category_id,
            category_name: kw.name_es,
            raw_title: item.title,
            raw_url: item.link,
            raw_snippet: item.snippet,
            display_link: item.displayLink
          });
        }
      }
      
      // Throttle: 500ms entre llamadas CSE para evitar rate limit
      await new Promise(r => setTimeout(r, 500));
      
      // Actualiza timestamp de última búsqueda
      await env.DB.prepare(
        'UPDATE ai_harvest_keywords SET last_harvested_at = CURRENT_TIMESTAMP WHERE harvest_id = ?'
      ).bind(kw.harvest_id).run();
      
    } catch (err) { log(`Error en CSE para "${kw.keyword}": ${err.message}`); }
  }
  
  log(`Descubiertos ${discovered.length} enlaces candidatos`);
  
  // ── 3. Filtrar duplicados contra D1 ───────────────────────────
  const unique = [];
  for (const item of discovered) {
    try {
      const domain = new URL(item.raw_url).hostname.replace('www.', '');
      const exists = await env.DB.prepare(
        'SELECT 1 FROM links WHERE url_final LIKE ? LIMIT 1'
      ).bind(`%${domain}%`).first();
      if (!exists) unique.push({ ...item, clean_domain: domain });
    } catch {}
  }
  log(`${unique.length} candidatos únicos (filtrados duplicados)`);
  
  // ── 4. Procesamiento semántico con LLM ────────────────────────
  if (!unique.length) { log('No hay nuevos candidatos'); return; }
  
  const batchSize = 10;
  const processed = [];
  
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const batchProcessed = await processWithLLM(batch, env);
    processed.push(...batchProcessed);
    await new Promise(r => setTimeout(r, 1000)); // Throttle LLM
  }
  
  // ── 5. Validación HTTP 200 ────────────────────────────────────
  const valid = [];
  for (const item of processed) {
    try {
      const checkRes = await fetch(item.url_base_limpia, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; redbo-harvester/1.0)' },
        signal: AbortSignal.timeout(5000)
      });
      if (checkRes.status === 200 || checkRes.status === 301 || checkRes.status === 302) {
        valid.push(item);
      } else {
        log(`Descartado (HTTP ${checkRes.status}): ${item.url_base_limpia}`);
      }
    } catch { log(`Descartado (timeout/error): ${item.url_base_limpia}`); }
  }
  
  log(`${valid.length} enlaces válidos tras validación HTTP`);
  
  // ── 6. Inserción masiva en D1 ─────────────────────────────────
  let inserted = 0;
  for (const item of valid) {
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO links 
          (category_id, titulo, url_final, descripcion_tooltip, is_approved, origen)
        VALUES (?, ?, ?, ?, 0, 'AI_Harvester')
      `).bind(item.category_id, item.titulo_limpio, item.url_base_limpia, item.descripcion_corta_tooltip).run();
      inserted++;
    } catch {}
  }
  
  log(`✅ Harvest completado: ${inserted} enlaces insertados en cola de revisión`);
}

async function processWithLLM(batch, env) {
  const prompt = `Analiza estos resultados de búsqueda web y extrae información limpia.
Para cada resultado, devuelve un objeto JSON con exactamente estas claves:
- "titulo_limpio": nombre de la aplicación/plataforma (máx 60 chars, sin signos de puntuación exagerados)
- "url_base_limpia": solo la URL base del sitio (ej: https://ejemplo.com, sin paths largos)
- "descripcion_corta_tooltip": descripción concisa y profesional en español (máx 100 chars)
- "category_id": usa el category_id del contexto proporcionado

Descarta resultados que sean: artículos de blog, listicles, páginas de resultados de búsqueda, 
dominios parkeados, páginas de error, o sitios sin funcionalidad clara como herramienta/plataforma.

Datos a procesar:
${JSON.stringify(batch.map(b => ({
  category_id: b.category_id,
  raw_title: b.raw_title,
  raw_url: b.raw_url,
  raw_snippet: b.raw_snippet
})))}

Responde SOLO con un array JSON válido. Sin texto adicional, sin markdown, sin \`\`\`.`;

  const apiKey = env.OPENAI_API_KEY || env.GEMINI_API_KEY;
  const useGemini = !env.OPENAI_API_KEY;
  
  let result = [];
  
  try {
    if (useGemini) {
      // Gemini API
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      result = JSON.parse(text.replace(/```json?|```/g, '').trim());
    } else {
      // OpenAI API
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '[]';
      result = JSON.parse(text.replace(/```json?|```/g, '').trim());
    }
  } catch (err) { console.error('[LLM Error]', err.message); }
  
  return Array.isArray(result) ? result : [];
}

PASO 4 — AGREGA a `db/schema.sql`:
-- Tabla de keywords para el harvester
CREATE TABLE IF NOT EXISTS ai_harvest_keywords (
  harvest_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword            TEXT NOT NULL,
  category_id        INTEGER NOT NULL REFERENCES categories(category_id),
  is_active          INTEGER DEFAULT 1,
  last_harvested_at  DATETIME,
  created_by         INTEGER REFERENCES users(user_id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

PASO 5 — AGREGA módulo al Dashboard:
En renderModuleHarvester():
- Tabla de keywords con CRUD
- Botón [▶ Ejecutar Ahora] → POST /api/admin/harvester/run (trigger manual)
- Log de la última ejecución con estadísticas
- Toggle activo/inactivo por keyword

VALIDACIÓN:
bash "npx wrangler dev" y luego: bash "curl -X POST http://localhost:8787/api/admin/harvester/run -H 'Authorization: Bearer TEST_TOKEN'"
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🛠️ PROMPT 9 — Core Extensibility Engine: Plugin System Dinámico
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Eres un Ingeniero de Sistemas Principal y Arquitecto de Software especialista 
en motores de extensibilidad en tiempo de ejecución y arquitecturas de plugins SaaS.

PASO 0 — LEE PRIMERO:
- Lee COMPLETAMENTE `src/worker.js` para entender el router actual
- Lee `public/dashboard.html` para entender el sistema de módulos SPA existente
- Lee `db/schema.sql` para verificar la tabla `system_modules`

PASO 1 — CREA: `src/lib/module-engine.js`
El corazón del Plugin Architecture:

// ══════════════════════════════════════════════════
// SCHEMA: Definición de módulo plugin
// ══════════════════════════════════════════════════
/**
 * Ejemplo de routes_config JSON:
 * [
 *   {"method": "GET",    "action": "list",   "path": "/api/modules/{slug}"},
 *   {"method": "POST",   "action": "create", "path": "/api/modules/{slug}"},
 *   {"method": "PUT",    "action": "update", "path": "/api/modules/{slug}/{id}"},
 *   {"method": "DELETE", "action": "delete", "path": "/api/modules/{slug}/{id}"}
 * ]
 * 
 * Ejemplo de ui_component_json:
 * {
 *   "table": {
 *     "columns": ["id","nombre","descuento","fecha_expira","activo"],
 *     "searchable": ["nombre"],
 *     "sortable": ["fecha_expira","nombre"]
 *   },
 *   "form": {
 *     "fields": [
 *       {"name":"nombre",       "type":"text",     "required":true,  "label":"Nombre del Cupón"},
 *       {"name":"codigo",       "type":"text",     "required":true,  "label":"Código"},
 *       {"name":"descuento",    "type":"number",   "required":true,  "label":"% Descuento"},
 *       {"name":"fecha_expira", "type":"datetime", "required":false, "label":"Expira el"},
 *       {"name":"activo",       "type":"toggle",   "required":false, "label":"Activo"}
 *     ]
 *   }
 * }
 */

export async function handleDynamicModule(request, env, ctx, path) {
  const url = new URL(request.url);
  const pathParts = path.replace('/api/modules/', '').split('/');
  const slug = pathParts[0];
  const recordId = pathParts[1];
  const method = request.method;
  
  if (slug === 'active') {
    // Lista módulos activos para el sidebar del dashboard
    const { results } = await env.DB.prepare(
      'SELECT module_id, module_name, module_slug, sidebar_icon, ui_component_json, routes_config FROM system_modules WHERE status = ?'
    ).bind('activo').all();
    return jsonResponse(results);
  }
  
  // Busca el módulo por slug
  const module = await env.DB.prepare(
    'SELECT * FROM system_modules WHERE module_slug = ? AND status = ?'
  ).bind(slug, 'activo').first();
  
  if (!module) return new Response(JSON.stringify({ error: `Módulo '${slug}' no encontrado` }), { status: 404 });
  
  // Ejecuta acción CRUD genérica basada en el módulo
  return executeDynamicCRUD(request, env, module, method, recordId);
}

async function executeDynamicCRUD(request, env, module, method, recordId) {
  const tableName = `module_${module.module_slug}`;
  
  try {
    switch (method) {
      case 'GET': {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '0');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        
        if (recordId) {
          const record = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).bind(recordId).first();
          return jsonResponse(record || {}, record ? 200 : 404);
        }
        
        const { results } = await env.DB.prepare(
          `SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ? OFFSET ?`
        ).bind(limit, page * limit).all();
        
        const { results: countRes } = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${tableName}`).all();
        return jsonResponse({ records: results, total: countRes[0]?.total || 0, page });
      }
      
      case 'POST': {
        const body = await request.json();
        const ui = JSON.parse(module.ui_component_json || '{}');
        const fields = ui.form?.fields || [];
        
        // Construye query dinámico desde el schema del módulo
        const allowedFields = fields.map(f => f.name);
        const insertFields = allowedFields.filter(f => body[f] !== undefined);
        const placeholders = insertFields.map(() => '?').join(',');
        const values = insertFields.map(f => body[f]);
        
        await env.DB.prepare(
          `INSERT INTO ${tableName} (${insertFields.join(',')}, created_at) VALUES (${placeholders}, CURRENT_TIMESTAMP)`
        ).bind(...values).run();
        
        return jsonResponse({ success: true, message: 'Registro creado' }, 201);
      }
      
      case 'PUT': {
        if (!recordId) return jsonResponse({ error: 'ID requerido' }, 400);
        const body = await request.json();
        const ui = JSON.parse(module.ui_component_json || '{}');
        const allowedFields = (ui.form?.fields || []).map(f => f.name);
        
        const updateFields = Object.keys(body).filter(k => allowedFields.includes(k));
        const setClauses = updateFields.map(f => `${f} = ?`).join(', ');
        const values = [...updateFields.map(f => body[f]), recordId];
        
        await env.DB.prepare(
          `UPDATE ${tableName} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(...values).run();
        
        return jsonResponse({ success: true });
      }
      
      case 'DELETE': {
        if (!recordId) return jsonResponse({ error: 'ID requerido' }, 400);
        await env.DB.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(recordId).run();
        return jsonResponse({ success: true });
      }
      
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── Ejecuta el schema_patch SQL del nuevo módulo ──────────────────
export async function applyModuleSchemaPatch(env, moduleSlug, schemaPatch) {
  // SEGURIDAD: Solo permite CREATE TABLE y CREATE INDEX (no DROP, no ALTER arbitrario)
  const ALLOWED_PATTERNS = [/^CREATE TABLE IF NOT EXISTS\s+module_/i, /^CREATE INDEX IF NOT EXISTS/i];
  
  const statements = schemaPatch.split(';').map(s => s.trim()).filter(Boolean);
  
  for (const stmt of statements) {
    const isAllowed = ALLOWED_PATTERNS.some(p => p.test(stmt));
    if (!isAllowed) throw new Error(`SQL no permitido en schema_patch: "${stmt.slice(0,60)}..."`);
    await env.DB.prepare(stmt).run();
  }
}

PASO 2 — AGREGA endpoint al Worker (`src/worker.js`):

// En la sección de rutas admin:
if (path === '/api/admin/modules' && method === 'POST')
  return handleCreateModule(request, env, authPayload);

if (path === '/api/admin/modules' && method === 'GET')  
  return handleListModules(request, env);

// Handler para crear módulo:
async function handleCreateModule(request, env, auth) {
  if (!canSuperAdmin(auth)) return unauthorizedResponse();
  
  const body = await request.json();
  const { module_name, module_slug, sidebar_icon, schema_patch, ui_component_json, routes_config } = body;
  
  // Validaciones
  if (!module_name || !module_slug) return jsonResponse({ error: 'Nombre y slug requeridos' }, 400);
  if (!/^[a-z0-9_-]+$/.test(module_slug)) return jsonResponse({ error: 'Slug inválido (solo a-z, 0-9, -, _)' }, 400);
  
  // Aplica el schema patch de forma segura
  if (schema_patch) {
    try {
      await applyModuleSchemaPatch(env, module_slug, schema_patch);
    } catch (err) {
      return jsonResponse({ error: `Error en schema: ${err.message}` }, 400);
    }
  }
  
  // Guarda el módulo en D1
  await env.DB.prepare(`
    INSERT INTO system_modules (module_name, module_slug, sidebar_icon, schema_patch, ui_component_json, routes_config, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(module_name, module_slug, sidebar_icon || '🧩', schema_patch, ui_component_json, routes_config, auth.user_id).run();
  
  // Invalida cache de módulos activos
  await env.KV_CACHE.delete('modules:active');
  
  return jsonResponse({ success: true, message: `Módulo '${module_name}' creado exitosamente` }, 201);
}

PASO 3 — AGREGA módulo UI al Dashboard (`public/dashboard.html`):
En renderModuleModuleBuilder():

El formulario debe tener:
1. Campos: Nombre, Slug (auto-generado desde nombre), Icono (emoji picker simple)
2. Textarea "Schema SQL" con syntax highlight básico (colores CSS en tokens)
3. Constructor visual de campos del formulario:
   - Botón [+ Agregar Campo]
   - Por cada campo: nombre, tipo (select: text/number/email/url/toggle/datetime/select/textarea), 
     label, required checkbox
   - Drag & drop para reordenar (usando la API nativa de HTML Drag and Drop)
4. Preview JSON en tiempo real del ui_component_json generado
5. Botón [💾 Crear Módulo] → POST /api/admin/modules

PASO 4 — SIDEBAR INJECTION en Dashboard:
Al iniciar el dashboard, hace fetch a /api/modules/active y para cada módulo:
- Inserta botón en el sidebar con su icono y nombre
- Al hacer clic, llama a renderDynamicModule(module) que:
  - Parsea ui_component_json
  - Renderiza tabla con columnas definidas (fetcheando /api/modules/{slug})
  - Renderiza formulario de creación/edición con los campos definidos
  - Conecta acciones CRUD a los endpoints dinámicos

VALIDACIÓN FINAL COMPLETA:
1. bash "npx wrangler dev --port 8787"
2. bash "curl -s http://localhost:8787/api/modules/active | python3 -m json.tool"
3. Crea un módulo de prueba "Cupones" con slug "cupones"
4. bash "curl -s http://localhost:8787/api/modules/cupones | python3 -m json.tool"
5. bash "npx wrangler deploy --dry-run" para validar el bundle final
```

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🔧 PROMPT BONUS — Setup Inicial y Deployment Pipeline
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
Lee TODO el proyecto existente y ejecuta el setup completo de integración:

PASO 1 — VERIFICA dependencias:
bash "cat package.json"
bash "npx wrangler --version"

PASO 2 — CREA D1 database si no existe:
bash "npx wrangler d1 create redbo-main"
# Copia el database_id al wrangler.toml

PASO 3 — APLICA el schema:
bash "npx wrangler d1 execute redbo-main --local --file=db/schema.sql"
bash "npx wrangler d1 execute redbo-main --file=db/schema.sql"  # producción

PASO 4 — CREA KV namespace:
bash "npx wrangler kv namespace create KV_CACHE"
bash "npx wrangler kv namespace create KV_CACHE --preview"

PASO 5 — CONFIGURA secrets (uno por uno):
bash "echo 'REEMPLAZA_CON_TU_SECRET' | npx wrangler secret put JWT_SECRET"
bash "echo 'REEMPLAZA_CON_TU_CLIENT_ID' | npx wrangler secret put GOOGLE_CLIENT_ID"
bash "echo 'REEMPLAZA_CON_TU_CLIENT_SECRET' | npx wrangler secret put GOOGLE_CLIENT_SECRET"
bash "echo 'REEMPLAZA_CON_TU_CSE_KEY' | npx wrangler secret put GOOGLE_CSE_API_KEY"

PASO 6 — SEED de datos iniciales:
bash "npx wrangler d1 execute redbo-main --file=db/seeds.sql"

PASO 7 — TEST local completo:
bash "npx wrangler dev --port 8787 --inspector-port 9229"
# Verifica: GET /, GET /api/categories, GET /api/engines, GET /dashboard

PASO 8 — DEPLOY a producción:
bash "npx wrangler deploy"
bash "npx wrangler d1 execute redbo-main --file=db/schema.sql"  # Aplica migraciones en prod

PASO 9 — VERIFICA:
bash "curl -s https://inicio.red.bo/api/categories | python3 -m json.tool"
bash "curl -s https://inicio.red.bo/api/engines | python3 -m json.tool"
```

---

## 📋 ORDEN DE EJECUCIÓN RECOMENDADO

```
1. PROMPT BONUS (Setup) → Confirma que el ambiente está listo
2. PROMPT 1 (Database)  → Schema SQL y estrategia KV
3. PROMPT 4 (Worker)    → Router principal del edge
4. PROMPT 6 (Auth)      → Sistema de autenticación
5. PROMPT 2 (Frontend)  → HTML/CSS/PWA base
6. PROMPT 3 (Search+Dir)→ Módulos JS del directorio
7. PROMPT 5 (Ads)       → Motor publicitario
8. PROMPT 7 (Dashboard) → Panel administrativo
9. PROMPT 8 (Harvester) → Bot de IA autónomo
10. PROMPT 9 (Plugins)  → Sistema de extensibilidad
```

---

*Generado para el proyecto inicio.red.bo | LIBRE — Juan Pablo Yáñez | red.bo ecosystem*
*Optimizado para Claude Code CLI — Copia cada bloque directamente al terminal*
