import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";
import { deleteAssetIfUnreferenced, isAllowedAssetKey, isAssetReferenced } from "../lib/assets.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/png": { ext: "png", matches: (b) => b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) },
  "image/jpeg": { ext: "jpg", matches: (b) => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 },
  "image/webp": { ext: "webp", matches: (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  "image/gif": { ext: "gif", matches: (b) => b.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...b.slice(0, 6))) },
};

function slugSegment(value, maxLength, fallback) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

function imageResponse(object) {
  const type = object.httpMetadata?.contentType;
  if (!Object.prototype.hasOwnProperty.call(IMAGE_TYPES, type)) {
    return new Response("Unsupported stored asset type.", { status: 415 });
  }
  return new Response(object.body, {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=300, must-revalidate",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-length": String(object.size),
    },
  });
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);
  if (!env.R2_LOGOS) return jsonResponse({ error: "R2 binding R2_LOGOS is missing. Bind the dashboard-manager-portal-assets bucket and redeploy." }, 503);

  const { searchParams } = new URL(request.url);
  if (request.method === "GET") {
    const key = searchParams.get("key");
    if (key == null) {
      return jsonResponse({ connected: true, bucket: "dashboard-manager-portal-assets", access: "private", publicAccessEnabled: false, maxImageBytes: MAX_IMAGE_BYTES, acceptedTypes: Object.keys(IMAGE_TYPES) });
    }
    if (!isAllowedAssetKey(key)) return jsonResponse({ error: "Invalid asset key." }, 400);
    try {
      if (!(await isAssetReferenced(env, key))) return jsonResponse({ error: "Asset not found." }, 404);
      const object = await env.R2_LOGOS.get(key);
      if (!object) return jsonResponse({ error: "Asset not found." }, 404);
      return imageResponse(object);
    } catch {
      return jsonResponse({ error: "Could not retrieve asset." }, 500);
    }
  }

  if (request.method === "POST") {
    let form;
    try { form = await request.formData(); } catch { return jsonResponse({ error: "Upload form is invalid." }, 400); }
    const file = form.get("file");
    const scope = form.get("scope");
    if (scope !== "service" && scope !== "branding") return jsonResponse({ error: "Upload scope must be service or branding." }, 400);
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.type !== "string") {
      return jsonResponse({ error: "Choose a PNG, JPEG, WebP, or GIF image." }, 400);
    }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return jsonResponse({ error: "Images must be no larger than 5 MB." }, 413);
    const type = file.type.toLowerCase();
    const descriptor = IMAGE_TYPES[type];
    if (!descriptor) return jsonResponse({ error: "Supported formats are PNG, JPEG, WebP, and GIF. SVG is not accepted." }, 415);

    let service = null;
    let serviceId = null;
    let profileId = null;
    let originalName = "";
    if (scope === "service") {
      serviceId = Number(form.get("serviceId"));
      profileId = Number(form.get("profileId") || 1);
      if (!Number.isSafeInteger(serviceId) || serviceId < 1 || ![1, 2].includes(profileId)) {
        return jsonResponse({ error: "Save the service before uploading its image." }, 400);
      }
      service = await env.DB.prepare(
        "SELECT id, name FROM services WHERE id = ? AND (profile_id = ? OR (profile_id IS NULL AND ? = 1))"
      ).bind(serviceId, profileId, profileId).first();
      if (!service) return jsonResponse({ error: "The service was not found in the selected profile." }, 404);
      originalName = String(file.name || form.get("originalName") || "image").slice(0, 180);
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!descriptor.matches(bytes)) return jsonResponse({ error: "The uploaded file does not match its declared image format." }, 415);
      const uploadedAt = new Date().toISOString();
      let key;
      let customMetadata;
      if (scope === "service") {
        const serviceSlug = slugSegment(service.name, 48, "service");
        const originalBase = originalName.replace(/\\.[^.]+$/, "");
        const originalSlug = slugSegment(originalBase, 56, "image");
        const uploadId = crypto.randomUUID();
        key = "service-logos/" + serviceSlug + "_" + originalSlug + "_" + serviceId + "_" + uploadId + "." + descriptor.ext;
        customMetadata = {
          purpose: "service",
          current: "true",
          serviceId: String(serviceId),
          serviceName: String(service.name).slice(0, 100),
          originalName,
          uploadedAt,
        };
      } else {
        key = "branding/" + crypto.randomUUID() + "." + descriptor.ext;
        customMetadata = { purpose: "branding", uploadedAt };
      }
      await env.R2_LOGOS.put(key, bytes, {
        httpMetadata: { contentType: type, cacheControl: "private, max-age=300, must-revalidate" },
        customMetadata,
      });
      return jsonResponse({ uploaded: true, key, contentType: type, size: bytes.byteLength, originalName }, 201);
    } catch {
      return jsonResponse({ error: "Image upload failed. Check the R2 binding and try again." }, 500);
    }
  }

  if (request.method === "DELETE") {
    const key = searchParams.get("key");
    if (!isAllowedAssetKey(key)) return jsonResponse({ error: "Invalid asset key." }, 400);
    try {
      if (await isAssetReferenced(env, key)) {
        return jsonResponse({ error: "This image is still attached to a saved service or portal branding." }, 409);
      }
      await env.R2_LOGOS.delete(key);
      return jsonResponse({ deleted: true, key });
    } catch {
      return jsonResponse({ error: "Could not remove the uploaded image." }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
