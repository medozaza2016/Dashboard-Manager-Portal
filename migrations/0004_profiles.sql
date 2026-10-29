-- Add profile-level isolation for services, categories, tags
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO profiles (id, name) VALUES
  (1, 'Personal'),
  (2, 'Work');

-- Add profile_id to existing tables (nullable during transition, then NOT NULL in future migration)
ALTER TABLE categories ADD COLUMN profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE services ADD COLUMN profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE;

-- Update indexes for profile scoping
CREATE INDEX IF NOT EXISTS idx_categories_profile ON categories(profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_services_profile ON services(profile_id, category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tags_profile ON tags(profile_id, name);

-- Backfill existing data to Personal profile (id=1)
UPDATE categories SET profile_id = 1 WHERE profile_id IS NULL;
UPDATE services SET profile_id = 1 WHERE profile_id IS NULL;
UPDATE tags SET profile_id = 1 WHERE profile_id IS NULL;

-- Make profile_id required going forward (enforced at application level for now)
