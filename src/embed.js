const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value) {
  const input = String(value || "").trim();
  if (YOUTUBE_ID_PATTERN.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return validId(url.pathname.split("/").filter(Boolean)[0]);
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (url.pathname === "/watch") return validId(url.searchParams.get("v"));
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return validId(parts[1]);
    }
  } catch {
    return "";
  }
  return "";
}

export function youtubeEmbedUrl(element, origin = "") {
  const videoId = youtubeVideoId(element?.url || element?.videoId);
  if (!videoId) return "";
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    controls: element.showControls === false ? "0" : "1",
    autoplay: element.autoplay ? "1" : "0",
    mute: Number(element.volume) === 0 ? "1" : "0",
    start: String(Math.max(0, Math.floor(Number(element.startSeconds) || 0))),
  });
  if (origin) params.set("origin", origin);
  if (element.loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  return `https://www.youtube.com/embed/${videoId}?${params}`;
}

export function youtubeThumbnailUrl(element) {
  const videoId = youtubeVideoId(element?.url || element?.videoId);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

function validId(value) {
  return YOUTUBE_ID_PATTERN.test(String(value || "")) ? String(value) : "";
}
