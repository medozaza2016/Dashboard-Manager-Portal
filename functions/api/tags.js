import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const MAX_NAME = 40;

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function duplicateName(db, name, exceptId = null) {
  const row = await db.prepare(
    "SELECT id FROM tags WHERE lower(name) = lower(?) AND (? IS NULL OR id != ?) LIMIT 1"
  ).bind(name.trim(), exceptId, exceptId).first();
  return !!row;
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  const { searchParams } = new URL(request.url);
  const profileIdParam = searchParams.get("profile");
  const profileId = profileIdParam == null ? 1 : Number(profileIdParam);

  if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > 2) {
    return jsonResponse({ error: "Invalid profile. Use profile=1 (Personal) or profile=2 (Work)." }, 400);
  }

  // Parse the tag ID once so update and delete requests have a validated ID.
  // The missing declaration previously caused a ReferenceError and an HTTP 500.
  const idParam = searchParams.get("id");
  const id = idParam == null ? null : validId(idParam);
  if (idParam != null && id == null) return jsonResponse({ error: "Invalid tag id." }, 400);

  if (request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT t.id, t.name, COUNT(s.id) AS serviceCount
      FROM tags t
      LEFT JOIN service_tags st ON st.tag_id = t.id
      LEFT JOIN services s ON s.id = st.service_id AND s.profile_id = t.profile_id
      WHERE t.profile_id = ?
      GROUP BY t.id ORDER BY lower(t.name), t.name
    `).bind(profileId).all();
    return jsonResponse(result.results || []);
  }

  if (request.method === "POST" || request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return jsonResponse({ error: "Expected a JSON object." }, 400);
    if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.trim().length > MAX_NAME) {
      return jsonResponse({ error: "Tag name is required and must be 40 characters or fewer." }, 400);
    }
    const name = payload.name.trim();

    if (request.method === "POST") {
      if (await duplicateName(env.DB, name)) return jsonResponse({ error: "A tag with this name already exists." }, 409);
      await env.DB.prepare("INSERT INTO tags (name, profile_id) VALUES (?, ?)").bind(name, profileId).run();
      const row = await env.DB.prepare(`
        SELECT t.id, t.name, COUNT(st.service_id) AS serviceCount
        FROM tags t LEFT JOIN service_tags st ON st.tag_id = t.id
        WHERE t.name = ? AND t.profile_id = ? GROUP BY t.id
      `).bind(name, profileId).first();
      return jsonResponse(row, 201);
    }

    if (id == null) return jsonResponse({ error: "The id query parameter is required for updates." }, 400);
    const existing = await env.DB.prepare("SELECT id FROM tags WHERE id = ? AND profile_id = ?").bind(id, profileId).first();
    if (!existing) return jsonResponse({ error: "Tag not found." }, 404);
    if (await duplicateName(env.DB, name, id)) return jsonResponse({ error: "A tag with this name already exists." }, 409);
    await env.DB.prepare("UPDATE tags SET name = ? WHERE id = ? AND profile_id = ?").bind(name, id, profileId).run();
    return jsonResponse(await env.DB.prepare(`
      SELECT t.id, t.name, COUNT(st.service_id) AS serviceCount
      FROM tags t LEFT JOIN service_tags st ON st.tag_id = t.id
      WHERE t.id = ? AND t.profile_id = ? GROUP BY t.id
    `).bind(id, profileId).first());
  }

  if (request.method === "DELETE") {
    if (id == null) return jsonResponse({ error: "The id query parameter is required for deletion." }, 400);
    const existing = await env.DB.prepare("SELECT id, name FROM tags WHERE id = ? AND profile_id = ?").bind(id, profileId).first();
    if (!existing) return jsonResponse({ error: "Tag not found." }, 404);
    await env.DB.prepare("DELETE FROM service_tags WHERE tag_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM tags WHERE id = ? AND profile_id = ?").bind(id, profileId).run();
    return jsonResponse({ deleted: true, id });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
