// 인스턴스 메모리 기반의 대략적인 요청 한도(서버리스에서는 인스턴스마다 따로 센다).
const hits = new Map<string, number[]>();
const daily = new Map<string, { day: string; n: number }>();

/** 한도를 넘으면 true. bucket 별로 IP당 windowMs 동안 perIp회, 하루 전체 dailyCap회까지 허용한다. */
export function limited(bucket: string, ip: string, perIp: number, windowMs: number, dailyCap: number): boolean {
  const today = new Date().toDateString();
  const d = daily.get(bucket) ?? { day: today, n: 0 };
  if (d.day !== today) { d.day = today; d.n = 0; }
  if (d.n >= dailyCap) { daily.set(bucket, d); return true; }
  const key = `${bucket}|${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= perIp) { hits.set(key, arr); daily.set(bucket, d); return true; }
  arr.push(now); hits.set(key, arr);
  d.n++; daily.set(bucket, d);
  if (hits.size > 5000) hits.clear();
  return false;
}
