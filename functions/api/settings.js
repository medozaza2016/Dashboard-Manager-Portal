import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const DEFAULTS = {
  branding: { name: "Luxorit", subtitle: "Pro", logo: "" },
  preferences: { theme: "dark", landingPage: "home", defaultView: "list", sidebarCollapsed: false },
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
    return jsonResponse({ branding, preferences });
  }

  if (request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }

    const branding = payload.branding || {};
    const preferences = payload.preferences || {};
    const cleanBranding = {
      name: typeof branding.name === "string" ? branding.name.trim().slice(0, 42) || "Luxorit" : "Luxorit",
      subtitle: typeof branding.subtitle === "string" ? branding.subtitle.trim().slice(0, 32) : "",
      logo: typeof branding.logo === "string" ? branding.logo.trim().slice(0, 4) : "",
    };
    const cleanPreferences = {
      theme: preferences.theme === "light" ? "light" : "dark",
      landingPage: ["home", "all"].includes(preferences.landingPage) ? preferences.landingPage : "home",
      defaultView: ["list", "cards", "slim"].includes(preferences.defaultView) ? preferences.defaultView : "list",
      sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
    };

    for (const [key, value] of [["branding", cleanBranding], ["preferences", cleanPreferences]]) {
      await env.DB.prepare(
        "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP"
      ).bind(key, JSON.stringify(value)).run();
    }
    return jsonResponse({ branding: cleanBranding, preferences: cleanPreferences });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
