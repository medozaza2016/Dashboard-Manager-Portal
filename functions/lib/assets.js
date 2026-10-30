const SERVICE_PREFIX = "service-logos/";
const BRANDING_PREFIX = "branding/";
const LEGACY_UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp|gif)$/i;
const NAMED_SERVICE_FILE = /^[a-z0-9-]{1,48}_[a-z0-9-]{1,56}_\\d+_[0-9a-f-]{36}\\.(png|jpg|webp|gif)$/i;

export function isAllowedAssetKey(key, scope) {
  if (typeof key !== "string" || key.length > 220) return false;
  const serviceFile = key.startsWith(SERVICE_PREFIX) ? key.slice(SERVICE_PREFIX.length) : "";
  const brandingFile = key.startsWith(BRANDING_PREFIX) ? key.slice(BRANDING_PREFIX.length) : "";
  if (scope === "service") return LEGACY_UUID_FILE.test(serviceFile) || NAMED_SERVICE_FILE.test(serviceFile);
  if (scope === "branding") return LEGACY_UUID_FILE.test(brandingFile);
  return LEGACY_UUID_FILE.test(brandingFile)
    || LEGACY_UUID_FILE.test(serviceFile)
    || NAMED_SERVICE_FILE.test(serviceFile);
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
