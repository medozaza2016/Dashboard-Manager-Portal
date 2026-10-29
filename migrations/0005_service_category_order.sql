ALTER TABLE services ADD COLUMN category_sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE services
SET category_sort_order = (
  SELECT COUNT(*)
  FROM services AS x
  WHERE x.profile_id = services.profile_id
    AND x.category_id = services.category_id
    AND (
      x.sort_order < services.sort_order
      OR (x.sort_order = services.sort_order AND x.id <= services.id)
    )
);
CREATE INDEX IF NOT EXISTS idx_services_profile_category_order
ON services(profile_id, category_id, category_sort_order, id);