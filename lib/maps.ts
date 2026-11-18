import type { Course } from "./data";

/**
 * 지도 검색어. 주소가 있으면 주소를(위치가 더 정확), 없으면 짧고 구체적인 장소 이름만 쓴다.
 * "기업 사업장, 가까운 교육장 …"처럼 장소가 정해지지 않은 교육·온라인 교육은 null(버튼 숨김).
 */
export function mapQuery(c: Pick<Course, "mode" | "venueName" | "venueAddress">): string | null {
  if (c.mode === "online") return null;
  const addr = c.venueAddress?.trim();
  if (addr) return addr;
  const name = c.venueName?.trim();
  if (name && name.length <= 20 && !/[,/·]|또는|협의/.test(name)) return name;
  return null;
}

// 검색 링크(길찾기 아님). 두 서비스의 웹 검색 URL 형식이며 공식 스펙 문서는 확인되지 않았다.
export const kakaoMapUrl = (q: string) => `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
export const naverMapUrl = (q: string) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
