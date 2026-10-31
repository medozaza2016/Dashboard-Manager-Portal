-- Anchor Dashboard rebrand (0.2.0).
-- Normalizes previously stored portal_settings rows and locks the Anchor theme.
-- Idempotent: safe to re-run, and it is a no-op on databases that already match.

UPDATE portal_settings
SET setting_value = json_set(
      setting_value,
      '$.theme', 'anchor',
      '$.landingPage', CASE json_extract(setting_value, '$.landingPage')
                        WHEN 'all' THEN 'all'
                        ELSE 'favorites'
                      END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'preferences'
  AND json_valid(setting_value);

UPDATE portal_settings
SET setting_value = json_set(
      setting_value,
      '$.name', CASE json_extract(setting_value, '$.name')
                  WHEN 'Luxorit' THEN 'Anchor'
                  ELSE json_extract(setting_value, '$.name')
                END,
      '$.subtitle', CASE json_extract(setting_value, '$.subtitle')
                      WHEN 'Pro' THEN 'Dashboard'
                      ELSE json_extract(setting_value, '$.subtitle')
                    END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'branding'
  AND json_valid(setting_value);

INSERT OR IGNORE INTO portal_settings (setting_key, setting_value) VALUES
  ('branding', '{"name":"Anchor","subtitle":"Dashboard","logo":"","logoKey":null}'),
  ('preferences', '{"theme":"anchor","landingPage":"favorites","defaultView":"list","sidebarCollapsed":false,"showSlimDescriptions":false,"serviceImageSize":34}');
