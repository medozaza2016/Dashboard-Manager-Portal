-- Identify services synchronized from Cloudflare Access so repeated imports update rather than duplicate.
ALTER TABLE services ADD COLUMN source_access_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_source_access_id
  ON services(source_access_id)
  WHERE source_access_id IS NOT NULL;
