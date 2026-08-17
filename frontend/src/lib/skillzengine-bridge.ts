/**
 * Bridge SDK to connect design-patterns-katas micro-frontend with the parent SkillzEngine app.
 * Uses HTML5 postMessage to communicate completions and sync progress with the parent frame.
 */

export function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;

  const urlParams = new URLSearchParams(window.location.search);
  const val = urlParams.get(name);
  if (val) return val;

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
    return { pathId: null };
  }

  let pathId = getQueryParam("se_path");
  if (pathId) {
    sessionStorage.setItem("se_path", pathId);
  } else {
    pathId = sessionStorage.getItem("se_path");
  }

  return { pathId };
}

export function notifyCompletion(kataId: string) {
  if (typeof window === "undefined") return;

  const { pathId } = getBridgeParams();
  console.log(`[SkillzEngine Bridge] Posting KATA_COMPLETED for chapter "${kataId}" to parent window...`);

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        type: "KATA_COMPLETED",
        kataId,
        pathId: pathId || undefined,
      },
      "*"
    );
  }
}

export function requestRemoteProgress() {
  if (typeof window === "undefined") return;

  const { pathId } = getBridgeParams();

  if (window.parent && window.parent !== window) {
    console.log("[SkillzEngine Bridge] Requesting progress data via postMessage...");
    window.parent.postMessage(
      {
        type: "GET_KATA_PROGRESS",
        pathId: pathId || undefined,
      },
      "*"
    );
  }
}

export function subscribeToProgressUpdates(onProgressReceived: (completedKatas: string[]) => void) {
  if (typeof window === "undefined") return () => {};

  const handleMessage = (event: MessageEvent) => {
    let data = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {}
    }

    if (data && data.type === "KATA_PROGRESS_DATA" && Array.isArray(data.completed_katas)) {
      console.log("[SkillzEngine Bridge] Received KATA_PROGRESS_DATA via postMessage:", data.completed_katas);
      onProgressReceived(data.completed_katas);
    }
  };

  window.addEventListener("message", handleMessage);
  requestRemoteProgress();

  return () => {
    window.removeEventListener("message", handleMessage);
  };
}

export async function getRemoteProgress(): Promise<string[] | null> {
  requestRemoteProgress();
  return null;
}

export function remoteLog(msg: any) {
  const logStr = typeof msg === "string" ? msg : JSON.stringify(msg);
  console.log("[SkillzEngine Bridge Log]:", logStr);
}

if (typeof window !== "undefined") {
  getBridgeParams();
}
