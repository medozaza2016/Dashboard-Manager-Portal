import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const PROJECT = "dashboard-manager-portal";
const REPOSITORY = "medozaza2016/Dashboard-Manager-Portal";
const PROJECT_URL = "https://dashboard-manager-portal.pages.dev";

function safeDeploymentUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);

  const branch = typeof env.CF_PAGES_BRANCH === "string" ? env.CF_PAGES_BRANCH : null;
  const commitSha = typeof env.CF_PAGES_COMMIT_SHA === "string" ? env.CF_PAGES_COMMIT_SHA.trim() : "";
  const deploymentUrl = safeDeploymentUrl(env.CF_PAGES_URL) || safeDeploymentUrl(new URL(request.url).origin);
  const environment = branch ? (branch === "main" ? "production" : "preview") : null;

  let commit = null;
  let commitLookupError = null;
  if (/^[a-f0-9]{40}$/i.test(commitSha)) {
    try {
      const response = await fetch(
        "https://api.github.com/repos/" + REPOSITORY + "/commits/" + encodeURIComponent(commitSha),
        {
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": PROJECT + "-pages-functions",
            "x-github-api-version": "2022-11-28",
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) {
        commitLookupError = "GitHub returned HTTP " + response.status + ".";
      } else {
        const data = await response.json();
        commit = {
          sha: data.sha || commitSha,
          shortSha: String(data.sha || commitSha).slice(0, 7),
          message: data.commit?.message?.split("\n")[0] || "Commit message unavailable",
          author: data.commit?.author?.name || data.author?.login || "Unknown author",
          committedAt: data.commit?.committer?.date || data.commit?.author?.date || null,
          url: typeof data.html_url === "string" && data.html_url.startsWith("https://github.com/")
            ? data.html_url
            : "https://github.com/" + REPOSITORY + "/commit/" + commitSha,
        };
      }
    } catch {
      commitLookupError = "Could not retrieve commit metadata from GitHub.";
    }
  } else {
    commitLookupError = "Cloudflare Pages did not expose a commit SHA to this Function.";
  }

  return jsonResponse({
    projectName: PROJECT,
    repository: REPOSITORY,
    projectUrl: PROJECT_URL,
    deploymentUrl,
    branch,
    environment,
    deploymentStatus: "serving",
    commit,
    commitLookupError,
    deploymentHistoryUrl: "https://dash.cloudflare.com/4ed0b7cda99d43ce679d2aace4d3f525/workers-and-pages?type=pages",
    note: "This endpoint identifies the deployment currently serving this request. Use Cloudflare deployment history for exact deployment start/end times and build-stage status.",
  });
}
