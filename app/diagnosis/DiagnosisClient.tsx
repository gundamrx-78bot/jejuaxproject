"use client";
import { useRef, useState } from "react";
import type { Report } from "@/lib/agent/report";

type Opt = { code: string; label: string };
type Options = { job: Opt[]; level: Opt[]; stuck: Opt[] };
type Step = { id: string; label: string; status: "start" | "done" | "error" };

const FREQ: Opt[] = [{ code: "daily", label: "거의 매일" }, { code: "weekly", label: "주 몇 번" }, { code: "monthly", label: "월 몇 번" }, { code: "rarely", label: "거의 안 써요" }];
const TOOLS: Opt[] = [{ code: "chatgpt", label: "ChatGPT" }, { code: "gemini", label: "Gemini" }, { code: "claude", label: "Claude" }, { code: "copilot", label: "Copilot" }, { code: "canva_etc", label: "이미지·디자인 AI" }, { code: "coding", label: "코딩 도구(Codex 등)" }, { code: "none", label: "써 본 적 없어요" }];
const MODE: Opt[] = [{ code: "any", label: "상관없어요" }, { code: "online", label: "온라인" }, { code: "offline", label: "오프라인" }];
const TIME: Opt[] = [{ code: "30", label: "30분 이하" }, { code: "60", label: "1시간" }, { code: "120", label: "2시간" }, { code: "240", label: "4시간 이상" }];
const PAID: Opt[] = [{ code: "yes", label: "네, 구독 중이에요" }, { code: "no", label: "아니요, 무료만 써요" }];

const APPLY: Record<string, { t: string; c: string }> = {
  open: { t: "접수 중", c: "ok" }, not_open_yet: { t: "접수 시작 전", c: "warn" }, unknown: { t: "접수 정보 없음", c: "warn" }, closed: { t: "접수 마감", c: "bad" },
};
const safeHref = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : undefined);

function Chips({ value, onChange, options, multi }: { value: string | string[]; onChange: (v: string) => void; options: Opt[]; multi?: boolean }) {
  const on = (c: string) => (multi ? (value as string[]).includes(c) : value === c);
  return (
    <div className="chips" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => (
        <button key={o.code} type="button" className="chip" aria-pressed={on(o.code)} onClick={() => onChange(o.code)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function DiagnosisClient({ options }: { options: Options }) {
  const [f, setF] = useState({ job: "", level: "", stuck: "", paid: "", frequency: "", tools: [] as string[], mode: "any", weeklyMinutes: "", repeatTask: "", goal: "", stuckDetail: "" });
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [steps, setSteps] = useState<Step[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [source, setSource] = useState<"agent" | "rules">("agent");
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleTool = (c: string) => setF((p) => {
    if (c === "none") return { ...p, tools: p.tools.includes("none") ? [] : ["none"] };
    const t = p.tools.filter((x) => x !== "none");
    return { ...p, tools: t.includes(c) ? t.filter((x) => x !== c) : [...t, c] };
  });
  const ready = f.job && f.level && f.stuck && f.paid && f.frequency && f.tools.length && f.weeklyMinutes;

  async function submit() {
    setErr(""); setNotice(""); setSteps([]); setReport(null); setPhase("running");
    const ctrl = new AbortController(); abort.current = ctrl;
    try {
      const res = await fetch("/api/diagnosis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message || "진단 요청에 실패했어요.");
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!chunk.startsWith("data: ")) continue;
          const ev = JSON.parse(chunk.slice(6));
          if (ev.type === "step") setSteps((s) => (s.some((x) => x.id === ev.id) ? s.map((x) => (x.id === ev.id ? { ...x, status: ev.status } : x)) : [...s, { id: ev.id, label: ev.label, status: ev.status }]));
          else if (ev.type === "report") { setReport(ev.report); setSource(ev.source); setPhase("done"); }
          else if (ev.type === "error") setNotice(ev.message);
        }
      }
      setPhase((p) => { if (p === "running") setErr("결과를 받지 못했어요. 다시 시도해 주세요."); return p === "running" ? "form" : p; });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr((e as Error).message); setPhase("form");
    }
  }

  if (phase === "running" || (phase === "done" && report)) {
    return (
      <>
        {phase === "running" && (
          <section className="card" aria-live="polite">
            <h2>진단 agent가 조사 중이에요</h2>
            <ul className="steps">
              {steps.map((s) => <li key={s.id} className={s.status}><span className="dot" />{s.label}{s.status === "error" ? " (다시 시도)" : ""}</li>)}
              {!steps.length && <li className="start"><span className="dot" />답변을 읽는 중</li>}
            </ul>
            <button className="btn ghost" type="button" onClick={() => { abort.current?.abort(); setPhase("form"); }}>취소</button>
          </section>
        )}
        {phase === "done" && report && <ReportView r={report} source={source} notice={notice} steps={steps} onReset={() => { setPhase("form"); setReport(null); }} />}
      </>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
      <section className="card">
        <div className="q"><span className="lbl">하시는 일은 무엇에 가까운가요?</span><Chips value={f.job} onChange={(v) => set("job", v)} options={options.job} /></div>
        <div className="q"><span className="lbl">지금 AI를 어느 정도 쓰고 있나요?</span><Chips value={f.level} onChange={(v) => set("level", v)} options={options.level} /></div>
        <div className="q"><span className="lbl">AI를 얼마나 자주 쓰나요?</span><Chips value={f.frequency} onChange={(v) => set("frequency", v)} options={FREQ} /></div>
        <div className="q"><span className="lbl">써 본 도구 <span className="hint">(여러 개 선택)</span></span><Chips multi value={f.tools} onChange={toggleTool} options={TOOLS} /></div>
        <div className="q"><span className="lbl">유료 AI 구독을 하고 있나요?</span><Chips value={f.paid} onChange={(v) => set("paid", v)} options={PAID} /></div>
      </section>
      <section className="card">
        <div className="q"><span className="lbl">가장 크게 막히는 지점은?</span><Chips value={f.stuck} onChange={(v) => set("stuck", v)} options={options.stuck} /></div>
        <div className="q"><label htmlFor="sd">막힌 상황을 자세히 알려 주세요 <span className="hint">(선택, 200자)</span></label><textarea id="sd" rows={2} maxLength={200} value={f.stuckDetail} onChange={(e) => set("stuckDetail", e.target.value)} /></div>
        <div className="q"><label htmlFor="rt">가장 시간을 많이 쓰는 반복 업무 <span className="hint">(선택)</span></label><input id="rt" type="text" maxLength={200} value={f.repeatTask} onChange={(e) => set("repeatTask", e.target.value)} placeholder="예: 매주 거래처별 견적서 작성" /></div>
        <div className="q"><label htmlFor="gl">AI로 이루고 싶은 결과 <span className="hint">(선택)</span></label><input id="gl" type="text" maxLength={200} value={f.goal} onChange={(e) => set("goal", e.target.value)} placeholder="예: 보고서 작성 시간을 절반으로" /></div>
        <p className="hint">이름·연락처 같은 개인정보는 적지 마세요. 입력 내용은 저장하지 않아요.</p>
      </section>
      <section className="card">
        <div className="q"><span className="lbl">선호하는 교육 방식</span><Chips value={f.mode} onChange={(v) => set("mode", v)} options={MODE} /></div>
        <div className="q"><span className="lbl">일주일에 배움에 쓸 수 있는 시간</span><Chips value={f.weeklyMinutes} onChange={(v) => set("weeklyMinutes", v)} options={TIME} /></div>
      </section>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={!ready}>진단 시작하기</button>
      {!ready && <span className="hint"> 필수 항목(직군·활용 정도·빈도·도구·구독·막힘·시간)을 선택해 주세요.</span>}
    </form>
  );
}

function ReportView({ r, source, notice, steps, onReset }: { r: Report; source: "agent" | "rules"; notice: string; steps: Step[]; onReset: () => void }) {
  const conf = { high: "근거 충분", medium: "근거 보통", low: "근거 약함" }[r.confidence];
  return (
    <>
      {notice && <div className="notice" role="status">{notice}</div>}
      {source === "rules" && !notice && <div className="notice">AI 분석 없이 규칙만으로 계산한 결과예요.</div>}
      <section className="card">
        <div className="level"><b>{r.level.code}</b><span><strong>{r.level.name} 단계</strong> · 막힘: {r.primaryStuck.name}</span><span className="badge">{conf}</span></div>
        <div className="bar" aria-hidden>{[0, 1, 2, 3, 4].map((n) => <i key={n} className={n <= Number(r.level.code) ? "on" : ""} />)}</div>
        <p>{r.summary}</p>
        <h2>진단 근거</h2>
        <ul className="plain">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        {steps.length > 0 && <p className="meta">조사한 것: {steps.filter((s) => s.status === "done").map((s) => s.label).join(" → ")}</p>}
      </section>

      <section className="card">
        <h2>막힌 지점과 해결 방향</h2>
        {r.blockers.map((b, i) => (
          <div className="q" key={i}><strong>{b.title}</strong><div className="meta">{b.why}</div><div>→ {b.fix}</div></div>
        ))}
      </section>

      <section className="card">
        <h2>추천 교육 <span className="hint">(외부 교육기관 데이터 기준)</span></h2>
        {r.recommendations.length === 0 && <p className="meta">지금 접수 중이면서 맞는 교육을 찾지 못했어요. 아래 학습 순서부터 시작하고, 행사 일정을 다시 확인해 보세요.</p>}
        {r.recommendations.map((rec) => {
          const a = APPLY[rec.course.applyState];
          const href = safeHref(rec.course.link);
          return (
            <div className="q course" key={rec.courseId}>
              <h3>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{rec.course.title}</a> : rec.course.title}</h3>
              <div className="meta"><span className={`badge ${a.c}`}>{a.t}</span> {rec.verdict === "recommend" ? <span className="badge ok">추천</span> : <span className="badge warn">조건부 추천</span>} · {rec.course.org ?? "주최 미확인"}{rec.course.applyCloseAt ? ` · 접수 마감 ${rec.course.applyCloseAt}` : ""}{rec.course.venue ? ` · ${rec.course.venue}` : ""}{rec.course.cost ? ` · ${rec.course.cost}` : ""}</div>
              <div>{rec.reason}</div>
              {rec.cautions.length > 0 && <ul className="plain meta">{rec.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>배울 순서</h2>
        <ol className="plain">{r.roadmap.map((s, i) => <li key={i}><strong>{s.title}</strong>{s.minutes ? <span className="meta"> · 약 {s.minutes}분</span> : null}<div className="meta">{s.detail}</div></li>)}</ol>
      </section>

      <section className="card">
        <h2>오늘 해 볼 첫 실습</h2>
        <strong>{r.firstPractice.title}</strong>
        {r.firstPractice.prompt && <><div className="copy">{r.firstPractice.prompt}</div><button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(r.firstPractice.prompt ?? "")}>질문 복사</button></>}
      </section>

      {r.dataGaps.length > 0 && (
        <section className="card"><h2>확인되지 않은 정보</h2><ul className="plain meta">{r.dataGaps.map((g, i) => <li key={i}>{g}</li>)}</ul></section>
      )}
      <button className="btn ghost" type="button" onClick={onReset}>다시 진단하기</button>
    </>
  );
}
