-- Add an optional private R2 object key for a service's uploaded logo.
-- Existing services keep their current icon behavior until a logo is uploaded.
ALTER TABLE services ADD COLUMN logo_key TEXT;
