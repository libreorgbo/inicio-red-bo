-- inicio-red-bo D1 Schema

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT DEFAULT '[]',
  favicon TEXT,
  clicks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '',
  description TEXT,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT,
  description TEXT,
  category TEXT DEFAULT 'all',
  time_target TEXT DEFAULT 'all',
  weight INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  clicks INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (link_id) REFERENCES links(id)
);

CREATE TABLE IF NOT EXISTS harvester_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  name TEXT,
  active INTEGER DEFAULT 1,
  last_harvested DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_links_category ON links(category);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_clicks ON links(clicks);
CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_date ON link_clicks(clicked_at);

INSERT OR IGNORE INTO categories (id, name, emoji, order_index) VALUES
  ('all', 'Todos', '🌎', 0),
  ('noticias', 'Noticias', '📰', 1),
  ('gobierno', 'Gobierno', '🏛', 2),
  ('educacion', 'Educacion', '🎓', 3),
  ('salud', 'Salud', '🩺', 4),
  ('tecnologia', 'Tecnologia', '💻', 5),
  ('negocios', 'Negocios', '💼', 6),
  ('deportes', 'Deportes', '⚽', 7),
  ('entretenimiento', 'Entretenimiento', '🎬', 8);

INSERT OR IGNORE INTO links (title, url, domain, description, category, clicks) VALUES
  ('El Deber', 'https://eldeber.com.bo', 'eldeber.com.bo', 'Noticias de Bolivia y el mundo', 'noticias', 1250),
  ('Los Tiempos', 'https://lostiempos.com', 'lostiempos.com', 'Periodico de Cochabamba', 'noticias', 980),
  ('Pagina Siete', 'https://paginasiete.bo', 'paginasiete.bo', 'Periodico nacional independiente', 'noticias', 870),
  ('Bolivia.gob.bo', 'https://bolivia.gob.bo', 'bolivia.gob.bo', 'Portal del Estado Plurinacional', 'gobierno', 650),
  ('UMSA', 'https://umsa.bo', 'umsa.bo', 'Universidad Mayor de San Andres', 'educacion', 540),
  ('Red Uno', 'https://reduno.com.bo', 'reduno.com.bo', 'Television y noticias', 'noticias', 430),
  ('YPFB', 'https://ypfb.gob.bo', 'ypfb.gob.bo', 'Yacimientos Petroliferos Fiscales Bolivianos', 'gobierno', 320),
  ('Banco Union', 'https://bancounion.com.bo', 'bancounion.com.bo', 'Banco estatal boliviano', 'negocios', 290),
  ('BCB', 'https://bcb.gob.bo', 'bcb.gob.bo', 'Banco Central de Bolivia', 'gobierno', 270),
  ('Entel', 'https://entel.bo', 'entel.bo', 'Empresa Nacional de Telecomunicaciones', 'tecnologia', 250);

INSERT OR IGNORE INTO ads (title, url, domain, description, category, time_target, weight) VALUES
  ('Tigo Bolivia', 'https://tigo.com.bo', 'tigo.com.bo', 'Internet y telefonía móvil en Bolivia', 'tecnologia', 'all', 3),
  ('Viva', 'https://viva.com.bo', 'viva.com.bo', 'Servicios de telecomunicaciones', 'tecnologia', 'manana', 2),
  ('Fassil', 'https://fassil.com.bo', 'fassil.com.bo', 'Banco Fassil - Tu banco digital', 'negocios', 'tarde', 3),
  ('ATB Digital', 'https://atb.com.bo', 'atb.com.bo', 'Television y noticias ATB Bolivia', 'noticias', 'noche', 2),
  ('Farmacorp', 'https://farmacorp.com', 'farmacorp.com', 'Farmacias y salud en Bolivia', 'salud', 'all', 2);

INSERT OR IGNORE INTO harvester_sources (url, name) VALUES
  ('https://eldeber.com.bo', 'El Deber'),
  ('https://lostiempos.com', 'Los Tiempos'),
  ('https://paginasiete.bo', 'Pagina Siete'),
  ('https://erbol.com.bo', 'ERBOL'),
  ('https://correodelsur.com', 'Correo del Sur');
