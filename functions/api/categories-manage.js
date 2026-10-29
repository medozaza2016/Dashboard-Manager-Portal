import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const MAX_NAME = 60;
const ALLOWED_ICONS = new Set(["cloudflare", "cloud", "windows", "gauge", "monitor", "server", "box", "briefcase", "storage", "networking", "remote-access", "development", "infrastructure", "heart-pulse", "landmark", "shopping-bag", "utensils", "house", "graduation-cap", "plane", "car-front", "lightbulb", "film", "shield-check", "scale", "wallet-cards"]);

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validCategoryName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= MAX_NAME;
}

async function duplicateName(db, name, exceptId = null) {
  const row = await db.prepare(
    "SELECT id FROM categories WHERE lower(name) = lower(?) AND (? IS NULL OR id != ?) LIMIT 1"
  ).bind(name.trim(), exceptId, exceptId).first();
  return !!row;
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  const { searchParams } = new URL(request.url);
  const profileParam = searchParams.get("profile");
  const profileId = profileParam == null ? 1 : Number(profileParam);
  if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > 2) {
    return jsonResponse({ error: "Invalid profile. Use profile=1 (Personal) or profile=2 (Work)." }, 400);
  }

  const idParam = searchParams.get("id");
  const id = idParam == null ? null : validId(idParam);
  if (idParam != null && id == null) return jsonResponse({ error: "Invalid category id." }, 400);

  if (request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT c.id, c.name, c.icon, c.sort_order AS sortOrder, COUNT(s.id) AS serviceCount
      FROM categories c
      LEFT JOIN services s ON s.category_id = c.id AND s.profile_id = c.profile_id
      WHERE c.profile_id = ?
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `).bind(profileId).all();
    return jsonResponse(result.results || []);
  }

  if (request.method === "PATCH") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    if (!payload || !Array.isArray(payload.order) || payload.order.length > 200 ||
        payload.order.some(value => !validId(value)) ||
        new Set(payload.order.map(Number)).size !== payload.order.length) {
      return jsonResponse({ error: "Provide an ordered array of unique category IDs." }, 400);
    }
    const current = await env.DB.prepare("SELECT id FROM categories WHERE profile_id = ? ORDER BY sort_order, name").bind(profileId).all();
    const existingIds = (current.results || []).map(row => Number(row.id));
    const requestedIds = payload.order.map(Number);
    if (existingIds.length !== requestedIds.length || existingIds.some(id => !requestedIds.includes(id))) {
      return jsonResponse({ error: "The category list changed. Refresh and try reordering again." }, 409);
    }
    const statements = requestedIds.map((categoryId, index) =>
      env.DB.prepare("UPDATE categories SET sort_order = ? WHERE id = ? AND profile_id = ?").bind(index + 1, categoryId, profileId)
    );
    if (statements.length) await env.DB.batch(statements);
    const result = await env.DB.prepare(`
      SELECT c.id, c.name, c.icon, c.sort_order AS sortOrder, COUNT(s.id) AS serviceCount
      FROM categories c
      LEFT JOIN services s ON s.category_id = c.id AND s.profile_id = c.profile_id
      WHERE c.profile_id = ?
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `).bind(profileId).all();
    return jsonResponse(result.results || []);
  }

  if (request.method === "POST" || request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return jsonResponse({ error: "Expected a JSON object." }, 400);
    if (!validCategoryName(payload.name)) return jsonResponse({ error: "Category name is required and must be 60 characters or fewer." }, 400);
    const name = payload.name.trim();
    if (payload.icon != null && (typeof payload.icon !== "string" || !ALLOWED_ICONS.has(payload.icon))) {
      return jsonResponse({ error: "Choose a supported category icon." }, 400);
    }
    if (payload.sortOrder != null && (!Number.isSafeInteger(Number(payload.sortOrder)) || Number(payload.sortOrder) < 1 || Number(payload.sortOrder) > 9999)) {
      return jsonResponse({ error: "Category order must be a whole number from 1 to 9999." }, 400);
    }

    if (request.method === "POST") {
      // Category names are currently globally unique in the schema, so duplicateName checks both profiles.
      if (await duplicateName(env.DB, name)) return jsonResponse({ error: "A category with this name already exists." }, 409);
      const next = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM categories WHERE profile_id = ?").bind(profileId).first();
      const sortOrder = Number(payload.sortOrder || next?.nextOrder || 1);
      await env.DB.prepare("INSERT INTO categories (name, sort_order, icon, profile_id) VALUES (?, ?, ?, ?)")
        .bind(name, sortOrder, payload.icon || "box", profileId).run();
      const row = await env.DB.prepare(`
        SELECT c.id, c.name, c.icon, c.sort_order AS sortOrder, COUNT(s.id) AS serviceCount
        FROM categories c
        LEFT JOIN services s ON s.category_id = c.id AND s.profile_id = c.profile_id
        WHERE c.name = ? AND c.profile_id = ?
        GROUP BY c.id
      `).bind(name, profileId).first();
      return jsonResponse(row, 201);
    }

    if (id == null) return jsonResponse({ error: "The id query parameter is required for updates." }, 400);
    const existing = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND profile_id = ?").bind(id, profileId).first();
    if (!existing) return jsonResponse({ error: "Category not found in this profile." }, 404);
    if (await duplicateName(env.DB, name, id)) return jsonResponse({ error: "A category with this name already exists." }, 409);
    const changes = [];
    const values = [];
    changes.push("name = ?"); values.push(name);
    if (payload.icon != null) { changes.push("icon = ?"); values.push(payload.icon); }
    if (payload.sortOrder != null) { changes.push("sort_order = ?"); values.push(Number(payload.sortOrder)); }
    values.push(id, profileId);
    await env.DB.prepare("UPDATE categories SET " + changes.join(", ") + " WHERE id = ? AND profile_id = ?").bind(...values).run();
    const row = await env.DB.prepare(`
      SELECT c.id, c.name, c.icon, c.sort_order AS sortOrder, COUNT(s.id) AS serviceCount
      FROM categories c
      LEFT JOIN services s ON s.category_id = c.id AND s.profile_id = c.profile_id
      WHERE c.id = ? AND c.profile_id = ?
      GROUP BY c.id
    `).bind(id, profileId).first();
    return jsonResponse(row);
  }

  if (request.method === "DELETE") {
    if (id == null) return jsonResponse({ error: "The id query parameter is required for deletion." }, 400);
    const existing = await env.DB.prepare("SELECT id, name FROM categories WHERE id = ? AND profile_id = ?").bind(id, profileId).first();
    if (!existing) return jsonResponse({ error: "Category not found in this profile." }, 404);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM services WHERE category_id = ? AND profile_id = ?").bind(id, profileId).first();
    if (Number(count?.count || 0) > 0) {
      return jsonResponse({ error: "This category still contains services. Move its services to another category before deleting it." }, 409);
    }
    await env.DB.prepare("DELETE FROM categories WHERE id = ? AND profile_id = ?").bind(id, profileId).run();
    return jsonResponse({ deleted: true, id });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
