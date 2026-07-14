/**
 * Bridge SDK to connect design-patterns-katas micro-frontend with the parent SkillzEngine app.
 * This runs inside the iframe and communicates completions over HTTP to the parent API.
 */

export function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;

  // Check URL search parameters
  const urlParams = new URLSearchParams(window.location.search);
  const val = urlParams.get(name);
  if (val) return val;

  // Check hash parameters
  const hash = window.location.hash;
  const hashQueryStart = hash.indexOf("?");
  if (hashQueryStart !== -1) {
    const hashParams = new URLSearchParams(hash.substring(hashQueryStart));
    return hashParams.get(name);
  }

  return null;
}

function getBridgeParams() {
  if (typeof window === "undefined") {
    return { api: null, token: null, pathId: null };
  }

  let api = getQueryParam("se_api");
  let token = getQueryParam("se_token");
  let pathId = getQueryParam("se_path");

  if (api) {
    sessionStorage.setItem("se_api", api);
  } else {
    api = sessionStorage.getItem("se_api");
  }

  if (token) {
    sessionStorage.setItem("se_token", token);
  } else {
    token = sessionStorage.getItem("se_token");
  }

  if (pathId) {
    sessionStorage.setItem("se_path", pathId);
  } else {
    pathId = sessionStorage.getItem("se_path");
  }

  return { api, token, pathId };
}

export async function notifyCompletion(kataId: string) {
  const { api, token, pathId } = getBridgeParams();

  if (!api || !token || !pathId) {
    console.log("[SkillzEngine Bridge] Not running inside SkillzEngine or missing parameters.");
    return;
  }

  console.log(`[SkillzEngine Bridge] Syncing completion of chapter "${kataId}" with SkillzEngine...`);

  try {
    const res = await fetch(`${api}/api/learning/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pathId,
        kataId,
      }),
    });

    const data = await res.json();
    console.log("[SkillzEngine Bridge] Sync response:", data);

    if (window.parent && window.parent !== window) {
      console.log("[SkillzEngine Bridge] Posting KATA_COMPLETED to parent window...");
      window.parent.postMessage({ type: "KATA_COMPLETED", kataId }, "*");
    }

    return data;
  } catch (err) {
    console.error("[SkillzEngine Bridge] Sync request failed:", err);
  }
}

export async function getRemoteProgress(): Promise<string[] | null> {
  const { api, token, pathId } = getBridgeParams();

  console.log("[SkillzEngine Bridge] getRemoteProgress parameters:", { api, token, pathId, href: window.location.href });

  if (!api || !token || !pathId) {
    console.log("[SkillzEngine Bridge] Not running inside SkillzEngine or missing parameters.");
    return null;
  }

  try {
    const fetchUrl = `${api}/api/learning/progress?pathId=${pathId}`;
    console.log("[SkillzEngine Bridge] Fetching progress from:", fetchUrl);
    const res = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (data && data.success && data.progress) {
      console.log("[SkillzEngine Bridge] Found completed chapters:", data.progress.completed_katas);
      return data.progress.completed_katas || [];
    }
  } catch (err: any) {
    remoteLog(`[SkillzEngine Bridge] Failed to fetch remote progress: ${err?.message || err}`);
    console.error("[SkillzEngine Bridge] Failed to fetch remote progress:", err);
  }
  return null;
}

export async function remoteLog(msg: any) {
  const { api } = getBridgeParams();
  const logStr = typeof msg === "string" ? msg : JSON.stringify(msg);
  if (!api) {
    console.log("[Remote Log Local]:", logStr);
    return;
  }

  try {
    await fetch(`${api}/api/learning/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientLog: logStr }),
    });
  } catch (err) {
    console.error("Failed to send remote log:", err);
  }
}

// Initialize bridge params on module load to capture them before URL cleaning
if (typeof window !== "undefined") {
  getBridgeParams();
}
