-- Anchor Dashboard 0.3.0 follow-up.
-- 1. Normalizes branding rows that still carry a pre-Anchor default pair.
--    0006 handled the original seed ("Luxorit" / "Pro"); databases that were
--    seeded by the earlier "Dashboard Manager" build still read
--    "Dashboard" / "Manager", so the sidebar shows the retired name.
-- 2. Backfills the preference keys added in 0.3.0 so stored rows match what the
--    Settings page writes. Values that already exist are never overwritten.
-- Idempotent: safe to re-run, and every statement is a no-op once applied.

UPDATE portal_settings
SET setting_value = json_set(
      setting_value,
      '$.name', CASE json_extract(setting_value, '$.name')
                  WHEN 'Luxorit' THEN 'Anchor'
                  WHEN 'Dashboard' THEN 'Anchor'
                  ELSE json_extract(setting_value, '$.name')
                END,
      '$.subtitle', CASE json_extract(setting_value, '$.subtitle')
                      WHEN 'Pro' THEN 'Dashboard'
                      WHEN 'Manager' THEN 'Dashboard'
                      ELSE json_extract(setting_value, '$.subtitle')
                    END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'branding'
  AND json_valid(setting_value)
  -- Only touch the exact legacy default pairs, never a name the owner chose.
  AND (
    json_extract(setting_value, '$.name') = 'Luxorit'
    OR (
      json_extract(setting_value, '$.name') = 'Dashboard'
      AND json_extract(setting_value, '$.subtitle') = 'Manager'
    )
  );

UPDATE portal_settings
SET setting_value = json_set(setting_value, '$.sidebarCategoriesCollapsed', json('false')),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value)
  AND json_type(setting_value, '$.sidebarCategoriesCollapsed') IS NULL;

UPDATE portal_settings
SET setting_value = json_set(setting_value, '$.sidebarTagsCollapsed', json('false')),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value)
  AND json_type(setting_value, '$.sidebarTagsCollapsed') IS NULL;

UPDATE portal_settings
SET setting_value = json_set(setting_value, '$.showCardDescriptions', json('false')),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value)
  AND json_type(setting_value, '$.showCardDescriptions') IS NULL;

UPDATE portal_settings
SET setting_value = json_set(setting_value, '$.showSlimDescriptions', json('false')),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value)
  AND json_type(setting_value, '$.showSlimDescriptions') IS NULL;

UPDATE portal_settings
SET setting_value = json_set(setting_value, '$.serviceImageSize', 34),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value)
  AND json_type(setting_value, '$.serviceImageSize') IS NULL;
