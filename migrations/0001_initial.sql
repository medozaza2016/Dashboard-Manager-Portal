CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT 'grid',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🔧',
  category_id INTEGER NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS service_tags (
  service_id INTEGER NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (service_id, tag_id)
);

CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_services_favorite ON services(is_favorite, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_tags_tag ON service_tags(tag_id);

INSERT OR IGNORE INTO categories (id, name, sort_order, icon) VALUES
  (1, 'Cloudflare', 1, 'cloudflare'),
  (2, 'Microsoft', 2, 'microsoft'),
  (3, 'Monitoring', 3, 'monitoring'),
  (4, 'Development', 4, 'development'),
  (5, 'Infrastructure', 5, 'infrastructure');

INSERT OR IGNORE INTO services (id, name, url, description, icon, category_id, is_favorite, sort_order) VALUES
  (1, 'Cloudflare Dashboard', 'https://dash.cloudflare.com', 'DNS, tunnels, Access and edge configuration', '☁️', 1, 1, 1),
  (2, 'Pages', 'https://pages.cloudflare.com', 'Deploy and manage sites', '⚡', 1, 1, 2),
  (3, 'Workers', 'https://workers.cloudflare.com', 'Build and deploy serverless applications', '⟫', 1, 0, 3),
  (4, 'D1', 'https://developers.cloudflare.com/d1', 'Serverless SQL database', '🛢️', 1, 1, 4),
  (5, 'Microsoft 365', 'https://www.microsoft365.com', 'Email and productivity', '🪟', 2, 1, 5),
  (6, 'Azure Portal', 'https://portal.azure.com', 'Manage cloud resources', '🔷', 2, 0, 6),
  (7, 'Grafana', 'https://grafana.com', 'Metrics and dashboards', '🟠', 3, 1, 7),
  (8, 'Uptime Kuma', 'https://github.com/louislam/uptime-kuma', 'Uptime monitoring', '🟢', 3, 0, 8),
  (9, 'GitHub', 'https://github.com', 'Code repositories', '◉', 4, 1, 9),
  (10, 'Portainer', 'https://portainer.example', 'Docker management', '🐳', 5, 1, 10),
  (11, 'Proxmox', 'https://proxmox.example', 'Virtualization platform', '🖥️', 5, 1, 11),
  (12, 'TrueNAS', 'https://truenas.example', 'File storage', '🗄️', 5, 0, 12);

INSERT OR IGNORE INTO tags (name) VALUES
  ('DNS'), ('Security'), ('Pages'), ('Web'), ('Workers'), ('Edge'), ('Database'),
  ('Office'), ('Productivity'), ('Azure'), ('Cloud'), ('Monitoring'), ('Analytics'),
  ('Uptime'), ('Development'), ('Git'), ('Docker'), ('Containers'), ('Infrastructure'),
  ('VMs'), ('Storage');

WITH mapping(service_id, tag_name) AS (VALUES
  (1,'DNS'), (1,'Security'), (2,'Pages'), (2,'Web'),
  (3,'Workers'), (3,'Edge'), (4,'Database'), (4,'Edge'),
  (5,'Office'), (5,'Productivity'), (6,'Azure'), (6,'Cloud'),
  (7,'Monitoring'), (7,'Analytics'), (8,'Monitoring'), (8,'Uptime'),
  (9,'Development'), (9,'Git'), (10,'Docker'), (10,'Containers'),
  (11,'Infrastructure'), (11,'VMs'), (12,'Infrastructure'), (12,'Storage')
)
INSERT OR IGNORE INTO service_tags(service_id, tag_id)
SELECT mapping.service_id, tags.id
FROM mapping JOIN tags ON tags.name = mapping.tag_name;

INSERT OR IGNORE INTO portal_settings (setting_key, setting_value) VALUES
  ('branding', '{"name":"Luxorit","subtitle":"Pro","logo":""}'),
  ('preferences', '{"theme":"dark","landingPage":"home","defaultView":"list","sidebarCollapsed":false}'),
  ('schema_version', '1');
