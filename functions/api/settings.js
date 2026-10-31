import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";
import { deleteAssetIfUnreferenced, isAllowedAssetKey } from "../lib/assets.js";

const DEFAULTS = {
  branding: { name: "Anchor", subtitle: "Dashboard", logo: "", logoKey: null },
  preferences: { theme: "anchor", landingPage: "favorites", defaultView: "list", sidebarCollapsed: false, sidebarCategoriesCollapsed: false, sidebarTagsCollapsed: false, showCardDescriptions: false, showSlimDescriptions: false, serviceImageSize: 34 },
};

async function readSetting(db, key, fallback) {
  const row = await db.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = ?").bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.setting_value); } catch { return fallback; }
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  if (request.method === "GET") {
    const [branding, preferences] = await Promise.all([
      readSetting(env.DB, "branding", DEFAULTS.branding),
      readSetting(env.DB, "preferences", DEFAULTS.preferences),
    ]);
    return jsonResponse({ branding: { ...DEFAULTS.branding, ...branding }, preferences: { ...DEFAULTS.preferences, ...preferences } });
  }

  if (request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }

    const branding = payload.branding || {};
    const preferences = payload.preferences || {};
    if (branding.logoKey != null && branding.logoKey !== "" && !isAllowedAssetKey(branding.logoKey, "branding")) return jsonResponse({ error: "Invalid portal logo reference." }, 400);
    const cleanBranding = {
      name: typeof branding.name === "string" ? branding.name.trim().slice(0, 42) || "Anchor" : "Anchor",
      subtitle: typeof branding.subtitle === "string" ? branding.subtitle.trim().slice(0, 32) : "",
      logo: typeof branding.logo === "string" ? branding.logo.trim().slice(0, 4) : "",
      logoKey: isAllowedAssetKey(branding.logoKey, "branding") ? branding.logoKey : null,
    };
    const requestedImageSize = Number(preferences.serviceImageSize);
    const cleanPreferences = {
      theme: "anchor",
      landingPage: preferences.landingPage === "all" ? "all" : "favorites",
      defaultView: ["list", "cards", "slim", "dots"].includes(preferences.defaultView) ? preferences.defaultView : "list",
      sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
      sidebarCategoriesCollapsed: Boolean(preferences.sidebarCategoriesCollapsed),
      sidebarTagsCollapsed: Boolean(preferences.sidebarTagsCollapsed),
      showCardDescriptions: Boolean(preferences.showCardDescriptions),
      showSlimDescriptions: Boolean(preferences.showSlimDescriptions),
      serviceImageSize: preferences.serviceImageSize == null || !Number.isFinite(requestedImageSize) ? 34 : Math.min(64, Math.max(20, Math.round(requestedImageSize / 2) * 2)),
    };

    const previousBranding = await readSetting(env.DB, "branding", DEFAULTS.branding);
    for (const [key, value] of [["branding", cleanBranding], ["preferences", cleanPreferences]]) {
      await env.DB.prepare(
        "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP"
      ).bind(key, JSON.stringify(value)).run();
    }
    if (previousBranding?.logoKey && previousBranding.logoKey !== cleanBranding.logoKey) await deleteAssetIfUnreferenced(env, previousBranding.logoKey, new URL(request.url).origin);
    return jsonResponse({ branding: cleanBranding, preferences: cleanPreferences });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
