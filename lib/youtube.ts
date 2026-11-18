// YouTube Data API v3 (공식 API) — 키가 있을 때만 쓴다. 영상 자체는 가져오지 않고 제목·채널·길이·링크만 쓴다.
// 비용(쿼터): search.list 1회 = 100단위, videos.list 1회 = 1단위. 기본 하루 10,000단위라 검색 약 100회 → 결과를 24시간 캐시한다.
export type Video = { id: string; title: string; channel: string; url: string; minutes: number | null; views: number | null; publishedAt: string };

const TTL = 24 * 3600 * 1000;
const cache = new Map<string, { at: number; videos: Video[] }>();

export const youtubeEnabled = () => !!(process.env.YOUTUBE_API_KEY || "").trim();

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const isoMinutes = (d: string): number | null => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d);
  if (!m) return null;
  return Math.round(Number(m[1] || 0) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60);
};

type SearchRes = { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[] };
type VideosRes = { items?: { id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }[] };

/** 오류 메시지에 요청 주소(키가 들어 있음)를 넣지 않는다. */
async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = (process.env.YOUTUBE_API_KEY || "").trim();
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key }).toString()}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`youtube ${path} ${r.status}`);
  return (await r.json()) as T;
}

export async function searchVideos(query: string, max = 3): Promise<Video[]> {
  const q = query.trim().slice(0, 60);
  const ck = q.toLowerCase();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.videos.slice(0, max);

  const s = await getJson<SearchRes>("search", {
    part: "snippet", type: "video", q, maxResults: String(Math.min(Math.max(max, 1), 5)),
    relevanceLanguage: "ko", regionCode: "KR", videoEmbeddable: "true", safeSearch: "strict",
  });
  const base = (s.items ?? []).filter((i) => i.id?.videoId && i.snippet?.title);
  const ids = base.map((i) => i.id!.videoId!);
  const d = ids.length ? await getJson<VideosRes>("videos", { part: "contentDetails,statistics", id: ids.join(",") }) : { items: [] };
  const det = new Map((d.items ?? []).map((v) => [v.id, v]));

  const videos: Video[] = base.map((i) => {
    const id = i.id!.videoId!;
    const v = det.get(id);
    return {
      id, title: decode(i.snippet!.title!), channel: decode(i.snippet!.channelTitle ?? ""),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      minutes: v?.contentDetails?.duration ? isoMinutes(v.contentDetails.duration) : null,
      views: v?.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
      publishedAt: i.snippet!.publishedAt ?? "",
    };
  });
  if (cache.size > 200) cache.clear();
  cache.set(ck, { at: Date.now(), videos });
  return videos.slice(0, max);
}
