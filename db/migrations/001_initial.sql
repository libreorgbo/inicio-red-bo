-- schema.sql - inicio.red.bo Database Schema
-- Compatible con Cloudflare D1 (SQLite)

-- ===================================================
-- ROLES
-- ===================================================
CREATE TABLE IF NOT EXISTS roles (
  role_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name  TEXT NOT NULL UNIQUE CHECK(role_name IN ('super_admin','admin','usuario')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO roles (role_name) VALUES ('super_admin'),('admin'),('usuario');

-- ===================================================
-- USERS
-- ===================================================
CREATE TABLE IF NOT EXISTS users (
  user_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id      TEXT UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT,
  avatar_url     TEXT,
  role_id        INTEGER NOT NULL DEFAULT 3 REFERENCES roles(role_id),
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('activo','suspendido','pendiente')),
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

-- ===================================================
-- MACRO CATEGORIES
-- ===================================================
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

-- ===================================================
-- CATEGORIES
-- ===================================================
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

-- ===================================================
-- LINKS
-- ===================================================
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
  redirect_type        TEXT NOT NULL DEFAULT 'direct' CHECK(redirect_type IN ('direct','interstitial_5s','pop_under')),
  interstitial_secs    INTEGER DEFAULT 5,
  total_clicks         INTEGER DEFAULT 0,
  total_impressions    INTEGER DEFAULT 0,
  owner_affiliate_tag  TEXT,
  user_affiliate_tag   TEXT,
  is_approved          INTEGER NOT NULL DEFAULT 0 CHECK(is_approved IN (0,1)),
  origen               TEXT DEFAULT 'manual' CHECK(origen IN ('manual','user_submit','AI_Harvester')),
  sort_order           INTEGER DEFAULT 0,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_links_hash ON links(hash_custom);
CREATE INDEX IF NOT EXISTS idx_links_approved ON links(is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_origen ON links(origen, is_approved);
CREATE INDEX IF NOT EXISTS idx_links_scroll ON links(category_id, is_approved, sort_order, link_id);

-- ===================================================
-- SEARCH ENGINES
-- ===================================================
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
  ('Web','web',1,1),('Imágenes','images',0,2),('Videos','videos',0,3),
  ('Noticias','news',0,4),('Torrents','torrents',0,5),('Subtítulos','subtitles',0,6);

-- ===================================================
-- ADVERTISEMENTS
-- ===================================================
CREATE TABLE IF NOT EXISTS advertisements (
  ad_id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_name              TEXT NOT NULL,
  formato              TEXT NOT NULL CHECK(formato IN ('1:1','4:5','9:16','728x90','300x250','160x600')),
  network_source       TEXT NOT NULL DEFAULT 'AdSense' CHECK(network_source IN ('AdSense','Custom','Affiliate')),
  script_code_or_html  TEXT,
  impresiones_compradas INTEGER DEFAULT 0,
  impresiones_servidas  INTEGER DEFAULT 0,
  geo_targeting        TEXT DEFAULT '[]',
  device_targeting     TEXT DEFAULT 'all' CHECK(device_targeting IN ('desktop','mobile','all')),
  is_active            INTEGER DEFAULT 1 CHECK(is_active IN (0,1)),
  priority             INTEGER DEFAULT 5,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ads_active ON advertisements(is_active, device_targeting);

-- ===================================================
-- SEO METADATA
-- ===================================================
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

-- ===================================================
-- SYSTEM MODULES
-- ===================================================
CREATE TABLE IF NOT EXISTS system_modules (
  module_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_name        TEXT NOT NULL,
  module_slug        TEXT NOT NULL UNIQUE,
  sidebar_icon       TEXT DEFAULT '🧩',
  schema_patch       TEXT,
  ui_component_json  TEXT,
  routes_config      TEXT,
  status             TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
  created_by         INTEGER REFERENCES users(user_id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===================================================
-- ANALYTICS EVENTS
-- ===================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL CHECK(event_type IN ('click','impression','search','page_view')),
  link_id     INTEGER REFERENCES links(link_id),
  ad_id       INTEGER REFERENCES advertisements(ad_id),
  user_id     INTEGER REFERENCES users(user_id),
  country     TEXT,
  device_type TEXT,
  ip_hash     TEXT,
  referrer    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_link ON analytics_events(link_id, created_at DESC);

-- ===================================================
-- AI HARVEST KEYWORDS
-- ===================================================
CREATE TABLE IF NOT EXISTS ai_harvest_keywords (
  harvest_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword            TEXT NOT NULL,
  category_id        INTEGER NOT NULL REFERENCES categories(category_id),
  is_active          INTEGER DEFAULT 1,
  last_harvested_at  DATETIME,
  created_by         INTEGER REFERENCES users(user_id),
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);
