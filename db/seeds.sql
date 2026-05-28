-- seeds.sql - Datos de ejemplo para inicio.red.bo

-- ===================================================
-- MACRO CATEGORIES (3)
-- ===================================================
INSERT OR IGNORE INTO macro_categories (slug, name_es, name_en, name_pt, icon_default, sort_order) VALUES
  ('trabajo',         'Trabajo',          'Work',            'Trabalho',        '💼', 1),
  ('entretenimiento', 'Entretenimiento',  'Entertainment',   'Entretenimento',  '🎬', 2),
  ('tecnologia',      'Tecnología',       'Technology',      'Tecnologia',      '💻', 3);

-- ===================================================
-- CATEGORIES (10)
-- ===================================================
INSERT OR IGNORE INTO categories (macro_id, slug, name_es, name_en, name_pt, color_hex, icon_default, sort_order) VALUES
  (1, 'noticias',       'Noticias',       'News',         'Notícias',     '#ef4444', '📰', 1),
  (1, 'gobierno',       'Gobierno',       'Government',   'Governo',      '#3b82f6', '🏛',  2),
  (1, 'negocios',       'Negocios',       'Business',     'Negócios',     '#f59e0b', '💰', 3),
  (2, 'entretenimiento','Entretenimiento','Entertainment','Entretenimento','#ec4899', '🎭', 4),
  (2, 'deportes',       'Deportes',       'Sports',       'Esportes',     '#10b981', '⚽', 5),
  (2, 'musica',         'Música',         'Music',        'Música',       '#8b5cf6', '🎵', 6),
  (3, 'tecnologia',     'Tecnología',     'Technology',   'Tecnologia',   '#6366f1', '💻', 7),
  (3, 'educacion',      'Educación',      'Education',    'Educação',     '#0ea5e9', '🎓', 8),
  (3, 'salud',          'Salud',          'Health',       'Saúde',        '#14b8a6', '🩺', 9),
  (1, 'empleo',         'Empleo',         'Jobs',         'Emprego',      '#f97316', '🔍', 10);

-- ===================================================
-- LINKS (20 aprobados)
-- ===================================================
INSERT OR IGNORE INTO links (hash_custom, category_id, titulo, url_final, descripcion_tooltip, is_approved, origen, sort_order) VALUES
  ('eldeber',    1, 'El Deber',           'https://eldeber.com.bo',       'Diario cruceño líder en Bolivia',                          1, 'manual', 1),
  ('lostiempos', 1, 'Los Tiempos',        'https://lostiempos.com',       'Periodico de Cochabamba fundado en 1943',                  1, 'manual', 2),
  ('paginasiete',1, 'Página Siete',       'https://paginasiete.bo',       'Periodico nacional independiente',                        1, 'manual', 3),
  ('erbol',      1, 'ERBOL',              'https://erbol.com.bo',         'Educación Radiofónica de Bolivia',                         1, 'manual', 4),
  ('bolivia-gob',2, 'Bolivia.gob.bo',     'https://bolivia.gob.bo',       'Portal oficial del Estado Plurinacional de Bolivia',       1, 'manual', 1),
  ('aduana-bo',  2, 'Aduana Nacional',    'https://aduana.gob.bo',        'Aduana Nacional del Estado Boliviano',                     1, 'manual', 2),
  ('sit-bo',     2, 'SIT Bolivia',        'https://sit.gob.bo',           'Sistema Integrado de Trámites del Estado',                 1, 'manual', 3),
  ('bancounion', 3, 'Banco Unión',        'https://bancounion.com.bo',    'Banco estatal boliviano de mayor cobertura',               1, 'manual', 1),
  ('bcb',        3, 'Banco Central',      'https://bcb.gob.bo',           'Banco Central de Bolivia - política monetaria',            1, 'manual', 2),
  ('bolsa-bo',   3, 'Bolsa de Valores',   'https://bbv.com.bo',           'Bolsa Boliviana de Valores',                               1, 'manual', 3),
  ('atb',        4, 'ATB Digital',        'https://atb.com.bo',           'Canal de televisión boliviano en línea',                   1, 'manual', 1),
  ('reduno',     4, 'Red Uno',            'https://reduno.com.bo',        'Red Uno de Bolivia - TV y noticias',                       1, 'manual', 2),
  ('boliviafbl', 5, 'Liga Boliviana',     'https://boliviafbl.com',       'Federación Boliviana de Fútbol',                           1, 'manual', 1),
  ('entel',      7, 'Entel Bolivia',      'https://entel.bo',             'Empresa Nacional de Telecomunicaciones',                   1, 'manual', 1),
  ('tigo-bo',    7, 'Tigo Bolivia',       'https://tigo.com.bo',          'Servicios de telecomunicaciones Tigo',                     1, 'manual', 2),
  ('umsa',       8, 'UMSA',               'https://umsa.bo',              'Universidad Mayor de San Andrés',                          1, 'manual', 1),
  ('ucb',        8, 'UCB',                'https://ucb.edu.bo',           'Universidad Católica Boliviana',                           1, 'manual', 2),
  ('inlasa',     8, 'Infocal',            'https://infocal.com.bo',       'Instituto de formación técnica',                           1, 'manual', 3),
  ('sedes-lpz',  9, 'SEDES La Paz',       'https://sedes.gobernacionlpz.bo', 'Servicio Departamental de Salud La Paz',                1, 'manual', 1),
  ('computrabajo',10,'Computrabajo',      'https://computrabajo.com.bo',  'Portal de empleos líder en Bolivia',                       1, 'manual', 1);
