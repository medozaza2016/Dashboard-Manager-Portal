import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

function readProfile(request) {
  const url = new URL(request.url);
  const profileId = Number(url.searchParams.get("profile") || 1);
  return Number.isSafeInteger(profileId) && (profileId === 1 || profileId === 2) ? profileId : null;
}

async function getFavoriteIds(db, profileId) {
  const result = await db.prepare(
    "SELECT id FROM services WHERE profile_id = ? AND is_favorite = 1 ORDER BY sort_order, id"
  ).bind(profileId).all();
  return (result.results || []).map(row => Number(row.id));
}

async function getSavedOrder(db, profileId) {
  const key = "favorites_order_profile_" + profileId;
  const row = await db.prepare(
    "SELECT setting_value FROM portal_settings WHERE setting_key = ?"
  ).bind(key).first();

  let saved = [];
  if (row?.setting_value) {
    try {
      const parsed = JSON.parse(row.setting_value);
      if (Array.isArray(parsed)) saved = parsed.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    } catch {
      saved = [];
    }
  }

  const current = await getFavoriteIds(db, profileId);
  const currentSet = new Set(current);
  const ordered = [...new Set(saved)].filter(id => currentSet.has(id));
  const included = new Set(ordered);
  for (const id of current) {
    if (!included.has(id)) ordered.push(id);
  }
  return ordered;
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  const profileId = readProfile(request);
  if (!profileId) return jsonResponse({ error: "Invalid profile. Use profile=1 (Personal) or profile=2 (Work)." }, 400);

  if (request.method === "GET") {
    const order = await getSavedOrder(env.DB, profileId);
    return jsonResponse({ order, profileId });
  }

  if (request.method === "PUT") {
    let payload;
    try { payload = await request.json(); }
    catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }

    if (!payload || !Array.isArray(payload.order) || payload.order.length > 200 ||
        payload.order.some(value => !Number.isSafeInteger(Number(value)) || Number(value) < 1) ||
        new Set(payload.order.map(Number)).size !== payload.order.length) {
      return jsonResponse({ error: "Provide an ordered array of unique favorite service IDs." }, 400);
    }

    const current = await getFavoriteIds(env.DB, profileId);
    const requested = payload.order.map(Number);
    if (current.length !== requested.length || current.some(id => !requested.includes(id))) {
      return jsonResponse({
        error: "The Favorites list changed. Refresh Favorites and try reordering again."
      }, 409);
    }

    const key = "favorites_order_profile_" + profileId;
    await env.DB.prepare(
      "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP"
    ).bind(key, JSON.stringify(requested)).run();

    return jsonResponse({ order: requested, profileId, saved: true });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
