import { youtubeEnabled } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 상태 확인용: 키 값은 절대 내보내지 않고, 켜져 있는지(true/false)만 알려 준다.
export function GET() {
  return Response.json(
    {
      ai: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      youtube: youtubeEnabled(),
      model: process.env.AI_MODEL || "claude-opus-5-5 (기본값)",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
