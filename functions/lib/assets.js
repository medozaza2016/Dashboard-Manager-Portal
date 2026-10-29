const SERVICE_PREFIX = "service-logos/";
const BRANDING_PREFIX = "branding/";
const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/i;

export function isAllowedAssetKey(key, scope) {
  if (typeof key !== "string" || key.length > 120) return false;
  const prefix = scope === "service" ? SERVICE_PREFIX : scope === "branding" ? BRANDING_PREFIX : null;
  if (prefix) return key.startsWith(prefix) && UUID_FILE.test(key.slice(prefix.length));
  return (key.startsWith(SERVICE_PREFIX) && UUID_FILE.test(key.slice(SERVICE_PREFIX.length)))
    || (key.startsWith(BRANDING_PREFIX) && UUID_FILE.test(key.slice(BRANDING_PREFIX.length)));
}

export async function isAssetReferenced(env, key) {
  if (!env?.DB || !isAllowedAssetKey(key)) return false;
  const service = await env.DB.prepare("SELECT id FROM services WHERE logo_key = ? LIMIT 1").bind(key).first();
  if (service) return true;
  const row = await env.DB.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = 'branding'").first();
  if (row) {
    try {
      const branding = JSON.parse(row.setting_value);
      if (branding?.logoKey === key) return true;
    } catch {}
  }
  return false;
}

export async function deleteAssetIfUnreferenced(env, key) {
  if (!env?.R2_LOGOS || !isAllowedAssetKey(key)) return false;
  try {
    if (await isAssetReferenced(env, key)) return false;
    await env.R2_LOGOS.delete(key);
    return true;
  } catch {
    // Cleanup must never turn a successful D1 save into a failed request.
    return false;
  }
}
