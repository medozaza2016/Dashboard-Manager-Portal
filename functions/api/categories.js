import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  const { searchParams } = new URL(request.url);
  const profileIdParam = searchParams.get("profile");
  const profileId = profileIdParam ? Number(profileIdParam) : 1;

  if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > 2) {
    return jsonResponse({ error: "Invalid profile. Use profile=1 (Personal) or profile=2 (Work)." }, 400);
  }

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
