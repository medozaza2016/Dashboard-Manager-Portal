const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function requireCloudflareAccess(request, env) {
  // Bypass Cloudflare Access in local development
  if (env.BYPASS_ACCESS === "1" || !env.CF_PAGES_URL || String(env.CF_PAGES_URL || "").includes("localhost")) {
    return { claims: { sub: "local-dev", email: "local@dev" } };
  }

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audience = String(env.ACCESS_AUD || "").trim();

  if (!teamDomain || !audience) {
    return {
      response: jsonResponse({
        error: "Backend authentication is not configured.",
        code: "ACCESS_NOT_CONFIGURED",
        detail: "Configure ACCESS_TEAM_DOMAIN and ACCESS_AUD, and protect the portal with a Cloudflare Access application.",
      }, 503),
    };
  }

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return { response: jsonResponse({ error: "Authentication required.", code: "ACCESS_REQUIRED" }, 401) };
  }

  try {
    const parts = assertion.split(".");
    if (parts.length !== 3) throw new Error("Malformed JWT");
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token");

    const issuer = `https://${teamDomain}`;
    if (claims.iss !== issuer) throw new Error("Invalid issuer");
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) throw new Error("Invalid audience");
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Expired token");
    if (typeof claims.nbf === "number" && claims.nbf > now + 30) throw new Error("Token not active");

    const certsResponse = await fetch(`${issuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!certsResponse.ok) throw new Error("Could not load Access certificates");
    const certs = await certsResponse.json();
    const jwk = (certs.keys || []).find((key) => key.kid === header.kid);
    if (!jwk) throw new Error("Signing key not found");

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      decodeBase64Url(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error("Invalid signature");

    return { claims };
  } catch {
    return { response: jsonResponse({ error: "Invalid or expired Cloudflare Access session.", code: "ACCESS_INVALID" }, 401) };
  }
}

export { jsonResponse };
