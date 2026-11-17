import { z } from "zod";
import { COURSES, LEVEL, STUCK } from "../data";
import { applyState, summarize } from "../courses";
import { hasForeignScript } from "../intake";

const str = (n: number) => z.string().trim().min(1).max(n);

export const ReportInput = z.object({
  level: z.number().int().min(0).max(4),
  primaryStuck: z.string().refine((v) => v in STUCK && v !== "other", "unknown stuck code"),
  confidence: z.enum(["high", "medium", "low"]),
  summary: str(800),
  evidence: z.array(str(350)).min(1).max(5),
  blockers: z.array(z.object({ title: str(100), why: str(450), fix: str(450) })).min(1).max(3),
  recommendations: z.array(z.object({
    courseId: str(80), verdict: z.enum(["recommend", "conditional"]), reason: str(500), cautions: z.array(str(300)).max(4),
  })).max(3),
  roadmap: z.array(z.object({ title: str(100), detail: str(450), minutes: z.number().int().min(5).max(600).optional() })).min(2).max(4),
  firstPractice: z.object({ title: str(120), prompt: str(700).optional() }),
  dataGaps: z.array(str(300)).max(5),
});
export type ReportInput = z.infer<typeof ReportInput>;

/** 모델이 낸 보고서를 검증하고, 교육 정보는 모델 문장이 아닌 실제 데이터로 채운다. */
export function finalizeReport(r: ReportInput) {
  if (hasForeignScript(JSON.stringify(r))) throw new Error("report contains foreign script");
  const dropped: string[] = [];
  const seen = new Set<string>();
  const recommendations = r.recommendations.flatMap((rec) => {
    const c = COURSES.find((x) => x.id === rec.courseId);
    if (!c || seen.has(c.id) || applyState(c) === "closed") { dropped.push(rec.courseId); return []; } // 없는 교육·마감된 교육은 코드가 한 번 더 거른다
    seen.add(c.id);
    return [{ ...rec, course: summarize(c) }];
  });
  return {
    level: { code: String(r.level), name: LEVEL[String(r.level)].name, next: LEVEL[String(r.level)].next ?? "" },
    primaryStuck: { code: r.primaryStuck, name: STUCK[r.primaryStuck].name },
    confidence: r.confidence, summary: r.summary, evidence: r.evidence, blockers: r.blockers,
    recommendations, roadmap: r.roadmap, firstPractice: r.firstPractice, dataGaps: r.dataGaps,
    droppedCourseIds: dropped,
  };
}
export type Report = ReturnType<typeof finalizeReport>;
