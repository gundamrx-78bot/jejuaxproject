import { z } from "zod";
import { STUCK, JOB, LEVEL } from "./data";

const code = (m: Record<string, unknown>) => z.string().refine((v) => v in m, "허용되지 않은 값");

export const TOOLS_USED = ["chatgpt", "gemini", "claude", "copilot", "canva_etc", "coding", "none"] as const;

export const IntakeSchema = z.object({
  job: code(JOB),
  stuck: code(STUCK),
  level: code(LEVEL),
  paid: z.enum(["yes", "no"]),
  frequency: z.enum(["daily", "weekly", "monthly", "rarely"]),
  tools: z.array(z.enum(TOOLS_USED)).max(7),
  mode: z.enum(["online", "offline", "any"]),
  weeklyMinutes: z.enum(["30", "60", "120", "240"]),
  repeatTask: z.string().trim().max(200).default(""),
  goal: z.string().trim().max(200).default(""),
  stuckDetail: z.string().trim().max(200).default(""),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const maskPII = (s: string) =>
  s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[이메일]").replace(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[전화번호]");

/** 한자·키릴·가나가 섞인 출력은 거른다(기존 프로젝트 규칙) */
export const hasForeignScript = (t: string) => /[一-鿿Ѐ-ӿ぀-ヿ]/.test(t);
