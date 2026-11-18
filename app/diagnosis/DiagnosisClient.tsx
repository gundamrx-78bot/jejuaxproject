"use client";
import { useRef, useState } from "react";
import type { Report } from "@/lib/agent/report";
import { kakaoMapUrl, naverMapUrl } from "@/lib/maps";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

type Opt = { code: string; label: string };
type Options = { job: Opt[]; level: Opt[]; stuck: Opt[] };
type Step = { id: string; label: string; status: "start" | "done" | "error" };

// ---------------- 체크리스트 v2 문항 (docs/진단체크리스트_v1.md) ----------------
const FIRST: Opt[] = [{ code: "never", label: "써 본 적 없어요" }, { code: "lt1m", label: "1개월 미만이에요" }, { code: "m1to6", label: "1개월~6개월이에요" }, { code: "m6to12", label: "6개월~1년이에요" }, { code: "gte1y", label: "1년 이상이에요" }];
const TOOLS: Opt[] = [{ code: "chatgpt", label: "ChatGPT" }, { code: "gemini", label: "Gemini" }, { code: "claude", label: "Claude" }, { code: "copilot", label: "Copilot" }, { code: "canva_etc", label: "이미지·디자인 AI" }, { code: "coding", label: "코딩 도구(Codex 등)" }, { code: "none", label: "써 본 적 없어요" }];
const YESNO: Opt[] = [{ code: "yes", label: "예" }, { code: "no", label: "아니요" }, { code: "unsure", label: "잘 모르겠어요" }];
const SCALE: Opt[] = [{ code: "1", label: "전혀 아니다" }, { code: "2", label: "아니다" }, { code: "3", label: "그렇다" }, { code: "4", label: "매우 그렇다" }];
const TIME: Opt[] = [{ code: "30", label: "30분 이하" }, { code: "60", label: "1시간" }, { code: "120", label: "2시간" }, { code: "240", label: "4시간 이상" }];
const BUDGET: Opt[] = [{ code: "subscribed", label: "유료 AI를 구독 중이에요" }, { code: "free", label: "무료만 써요" }, { code: "if_supported", label: "교육비 지원이 있으면 가능해요" }];
const MODE: Opt[] = [{ code: "any", label: "상관없어요" }, { code: "online", label: "온라인" }, { code: "offline", label: "오프라인" }];

const B_Q = [
  "(최근 2주) 답이 마음에 안 들어 질문을 바꿔 다시 물어본 적이 있다",
  "(최근 1개월) 메일·보고서·공지 같은 내 업무 문서의 초안을 AI로 만들어 실제로 썼다",
  "(최근 1개월) AI에게 상황·대상·분량·말투를 함께 알려 준다",
  "(최근 1개월) AI가 준 숫자·사실을 확인한 뒤에 사용한다",
  "(최근 1개월) AI를 반복 업무 흐름에 넣어 정기적으로 쓴다 (템플릿 저장·GPTs·프로젝트·자동화 도구 등)",
  "(최근 3개월) AI로 내 업무용 도구(앱·스크립트·시트 자동화)를 만들어 쓴다",
];
const D_Q = [
  "AI가 낸 결과가 내가 원하는 것과 자주 다르다",
  "내 일 중에 AI에게 무엇을 시킬지 모르겠다",
  "AI 도구가 너무 많아 어떤 걸 써야 할지 모르겠다",
  "몇 번 써 보다가 다시 안 쓰게 된다",
  "AI 답이 틀릴까 봐 믿고 쓰기 어렵다",
  "같은 요청을 매번 처음부터 다시 쓴다",
  "업무 자료를 AI에 넣어도 되는지 불안하다",
  "AI에 대해 물어볼 사람이나 곳이 없다",
];

type Answers = {
  jobText: string; firstUse: string; tools: string[]; b: string[]; d: string[];
  weeklyMinutes: string; budget: string; mode: string; stuckDetail: string;
};
const initial = (): Answers => ({ jobText: "", firstUse: "", tools: [], b: Array(6).fill(""), d: Array(8).fill(""), weeklyMinutes: "", budget: "", mode: "any", stuckDetail: "" });

type Screen =
  | { id: string; kind: "single"; title: string; opts: Opt[]; get: (a: Answers) => string; set: (a: Answers, v: string) => Answers; section: string }
  | { id: string; kind: "multi" | "text" | "final"; title: string; section: string };

function buildScreens(a: Answers): Screen[] {
  const S: Screen[] = [
    { id: "job", kind: "text", section: "기본 정보", title: "하시는 일을 한 줄로 알려 주세요" },
    { id: "first", kind: "single", section: "기본 정보", title: "AI를 처음 써 본 건 언제쯤인가요?", opts: FIRST, get: (x) => x.firstUse, set: (x, v) => ({ ...x, firstUse: v }) },
    { id: "tools", kind: "multi", section: "기본 정보", title: "써 본 AI 도구를 모두 골라 주세요" },
  ];
  if (a.firstUse !== "never") {
    B_Q.forEach((q, k) => S.push({ id: `b${k}`, kind: "single", section: "활용 행동 체크", title: q, opts: YESNO, get: (x) => x.b[k], set: (x, v) => ({ ...x, b: x.b.map((o, i) => (i === k ? v : o)) }) }));
    D_Q.forEach((q, k) => S.push({ id: `d${k}`, kind: "single", section: "막힘 점검", title: q, opts: SCALE, get: (x) => x.d[k], set: (x, v) => ({ ...x, d: x.d.map((o, i) => (i === k ? v : o)) }) }));
  }
  S.push(
    { id: "time", kind: "single", section: "조건과 목표", title: "일주일에 배움에 쓸 수 있는 시간은?", opts: TIME, get: (x) => x.weeklyMinutes, set: (x, v) => ({ ...x, weeklyMinutes: v }) },
    { id: "budget", kind: "single", section: "조건과 목표", title: "유료 AI 구독과 교육비는?", opts: BUDGET, get: (x) => x.budget, set: (x, v) => ({ ...x, budget: v }) },
    { id: "final", kind: "final", section: "마지막", title: "마지막으로 선택 사항이에요" },
  );
  return S;
}

function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Opt[] }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.code} type="button" className="chip" aria-pressed={value === o.code} onClick={() => onChange(o.code)}>{o.label}</button>
      ))}
    </div>
  );
}

const APPLY: Record<string, { t: string; c: string }> = {
  open: { t: "접수 중", c: "ok" }, not_open_yet: { t: "접수 시작 전", c: "warn" }, unknown: { t: "접수 정보 없음", c: "warn" }, closed: { t: "접수 마감", c: "bad" },
};
const safeHref = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : undefined);

export default function DiagnosisClient({ options }: { options: Options }) {
  const [a, setA] = useState<Answers>(initial());
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [steps, setSteps] = useState<Step[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [source, setSource] = useState<"agent" | "rules">("agent");
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);

  const screens = buildScreens(a);
  const idx = Math.min(step, screens.length - 1);
  const cur = screens[idx];
  const reset = () => { setPhase("form"); setReport(null); setStep(0); setA(initial()); };

  const pick = (s: Extract<Screen, { kind: "single" }>, v: string) => {
    setA((p) => s.set(p, v));
    setTimeout(() => setStep((n) => n + 1), 160);
  };
  const toggleTool = (c: string) => setA((p) => {
    if (c === "none") return { ...p, tools: p.tools.includes("none") ? [] : ["none"] };
    const t = p.tools.filter((x) => x !== "none");
    return { ...p, tools: t.includes(c) ? t.filter((x) => x !== c) : [...t, c] };
  });

  async function submit() {
    setErr(""); setNotice(""); setSteps([]); setReport(null); setPhase("running");
    const ctrl = new AbortController(); abort.current = ctrl;
    const used = a.firstUse !== "never";
    const body = {
      jobText: a.jobText.trim(), firstUse: a.firstUse, tools: a.tools, paid: a.budget === "subscribed" ? "yes" : "no", mode: a.mode, stuckDetail: a.stuckDetail,
      ...(used && a.b.every(Boolean) ? { b: a.b } : {}),
      ...(used && a.d.every(Boolean) ? { d: a.d.map(Number) } : {}),
      ...(a.weeklyMinutes ? { weeklyMinutes: a.weeklyMinutes } : {}),
      ...(a.budget ? { budget: a.budget } : {}),
    };
    try {
      const res = await fetch(API_BASE + "/api/diagnosis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
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
            <h2>진단 agent가 분석 중이에요</h2>
            <ul className="steps">
              {steps.map((s) => <li key={s.id} className={s.status}><span className="dot" />{s.label}{s.status === "error" ? " (다시 시도)" : ""}</li>)}
              {!steps.length && <li className="start"><span className="dot" />답변을 읽는 중</li>}
            </ul>
            <button className="btn ghost" type="button" onClick={() => { abort.current?.abort(); setPhase("form"); }}>취소</button>
          </section>
        )}
        {phase === "done" && report && <ReportView r={report} source={source} notice={notice} steps={steps} jobText={a.jobText} onReset={reset} />}
      </>
    );
  }

  const canNext = cur.kind === "single" ? !!cur.get(a) : cur.kind === "multi" ? a.tools.length > 0 : cur.kind === "text" ? a.jobText.trim().length >= 2 : true;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (cur.kind === "final") submit(); }}>
      <div className="progress" aria-label={`${idx + 1} / ${screens.length} 단계`}>
        <div className="progress-bar"><i style={{ width: `${((idx + 1) / screens.length) * 100}%` }} /></div>
        <span className="meta">{cur.section} · {idx + 1} / {screens.length}</span>
      </div>

      <section className="card" aria-live="polite">
        <h2 className="qtitle">{cur.title}</h2>
        {cur.kind === "single" && (
          <div className="opts" role="radiogroup" aria-label={cur.title}>
            {cur.opts.map((o) => <button key={o.code} type="button" className="opt" aria-pressed={cur.get(a) === o.code} onClick={() => pick(cur, o.code)}>{o.label}</button>)}
          </div>
        )}
        {cur.kind === "text" && (
          <>
            <input type="text" maxLength={100} value={a.jobText} onChange={(e) => setA((p) => ({ ...p, jobText: e.target.value }))} placeholder="예: 카페 운영, 중학교 교사, 회계 담당, 프리랜서 디자이너" aria-label="하시는 일" autoFocus />
            <p className="hint">직업이나 업무를 편하게 적어 주세요. 이름·회사명 같은 개인정보는 적지 마세요.</p>
          </>
        )}
        {cur.kind === "multi" && (
          <div className="opts" role="group" aria-label={cur.title}>
            {TOOLS.map((o) => <button key={o.code} type="button" className="opt" aria-pressed={a.tools.includes(o.code)} onClick={() => toggleTool(o.code)}>{o.label}</button>)}
          </div>
        )}
        {cur.kind === "final" && (
          <>
            <div className="q"><span className="lbl">선호하는 교육 방식</span><Chips value={a.mode} onChange={(v) => setA((p) => ({ ...p, mode: v }))} options={MODE} /></div>
            <div className="q">
              <label htmlFor="sd">AI를 쓰다 막혔던 순간을 한 줄로 알려 주세요 <span className="hint">(선택)</span></label>
              <textarea id="sd" rows={2} maxLength={200} value={a.stuckDetail} onChange={(e) => setA((p) => ({ ...p, stuckDetail: e.target.value }))} placeholder="예: 매주 견적서를 쓰는 데 시간이 너무 걸려요" />
            </div>
            <p className="hint">입력 내용은 저장하지 않아요. 진단을 위해 AI 분석 서비스로 전송돼요. 이름·연락처는 적지 마세요.</p>
          </>
        )}
      </section>

      {err && <p className="err" role="alert">{err}</p>}
      <div className="nav-row">
        {idx > 0 && <button className="btn ghost" type="button" onClick={() => setStep(idx - 1)}>이전</button>}
        {cur.kind !== "final" && cur.kind !== "single" && <button className="btn" type="button" disabled={!canNext} onClick={() => setStep(idx + 1)}>다음</button>}
        {cur.kind === "single" && canNext && <button className="btn" type="button" onClick={() => setStep(idx + 1)}>다음</button>}
        {cur.kind === "final" && <button className="btn" type="submit">진단 시작하기</button>}
      </div>
    </form>
  );
}

function Details({ summary, children, open }: { summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{summary}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn ghost sm" type="button" onClick={() => { try { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* 복사 실패는 무시 */ } }}>
      {done ? "복사됐어요" : "질문 복사하기"}
    </button>
  );
}

// "왜 추천했나요?"를 AI에게 물어보는 버튼. 누를 때만 AI를 한 번 호출한다.
function WhyButton({ kind, id, title, channel, reason, ctx }: { kind: "video" | "course"; id: string; title: string; channel?: string; reason: string; ctx: { jobText: string; level: string; stuck: string } }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  async function ask() {
    setState("loading");
    try {
      const res = await fetch(API_BASE + "/api/diagnosis/why", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, title, channel: channel ?? "", reason, ...ctx }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.text) throw new Error("no text");
      setText(j.text); setState("done");
    } catch { setState("error"); }
  }
  return (
    <div className="whywrap" aria-live="polite">
      {state === "idle" && <button className="btn ghost sm" type="button" onClick={ask}>AI에게 왜 추천했는지 물어보기</button>}
      {state === "loading" && <span className="hint">AI가 설명을 쓰는 중이에요…</span>}
      {state === "done" && (
        <div className="whybox">
          <strong>AI의 설명</strong>
          <p>{text}</p>
          <p className="hint">AI가 쓴 설명이라 틀릴 수 있어요. {kind === "video" ? "영상을 보기 전에" : "신청하기 전에"} 직접 한 번 확인해 주세요.</p>
        </div>
      )}
      {state === "error" && (
        <div className="whybox">
          <p>지금은 AI 설명을 불러오지 못했어요. 대신 진단에 적힌 이유를 알려 드릴게요.</p>
          <p>{reason}</p>
          <button className="btn ghost sm" type="button" onClick={ask}>다시 물어보기</button>
        </div>
      )}
    </div>
  );
}

function ReportView({ r, source, notice, steps, jobText, onReset }: { r: Report; source: "agent" | "rules"; notice: string; steps: Step[]; jobText: string; onReset: () => void }) {
  const ctx = { jobText, level: r.level.code, stuck: r.primaryStuck.code };
  const conf = { high: "진단 근거가 충분해요", medium: "진단 근거가 보통이에요", low: "진단 근거가 적어서 참고용이에요" }[r.confidence];
  const lv = Number(r.level.code);
  const hasConditional = r.recommendations.some((x) => x.verdict === "conditional");
  const jumps = [
    { id: "today", label: "오늘 할 일" },
    { id: "why", label: "막힌 이유" },
    ...(r.recommendations.length ? [{ id: "courses", label: "추천 교육" }] : []),
    ...(r.videos.length ? [{ id: "videos", label: "추천 영상" }] : []),
    { id: "steps", label: "배울 순서" },
  ];
  return (
    <>
      {notice && <div className="notice" role="status">{notice}</div>}
      {source === "rules" && !notice && <div className="notice">AI 분석 없이 규칙만으로 계산한 결과예요.</div>}

      <section className="card hero" aria-labelledby="hero-title">
        <p className="eyebrow">나의 AI 활용 단계</p>
        <div className="hero-level">
          <span className="hero-num" aria-hidden>{r.level.code}</span>
          <div>
            <h2 id="hero-title">{r.level.name} 단계</h2>
            <div className="dots" role="img" aria-label={`5단계 중 ${lv + 1}단계`}>{[0, 1, 2, 3, 4].map((n) => <i key={n} className={n <= lv ? "on" : ""} />)}</div>
          </div>
        </div>
        <p className="hero-sum">{r.summary}</p>
        <ul className="facts">
          <li>가장 큰 막힘<b>{r.primaryStuck.name}</b></li>
          <li>추천 교육<b>{r.recommendations.length}개</b></li>
          <li>추천 영상<b>{r.videos.length}개</b></li>
        </ul>
        <p className="hint">{conf}</p>
        <Details summary="이렇게 진단했어요">
          <ul className="plain">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <p className="hint">
            {steps.filter((s) => s.status === "done").length > 0 ? "AI가 조사한 것: " + [...new Set(steps.filter((s) => s.status === "done").map((s) => s.label))].join(", ") + ". " : ""}
            과제 점수는 {r.taskScore == null ? "건너뛰었어요" : `${r.taskScore}/5점이에요`}.
          </p>
        </Details>
      </section>

      <nav className="jump" aria-label="결과 바로가기">
        {jumps.map((j) => <a key={j.id} href={`#${j.id}`}>{j.label}</a>)}
      </nav>

      <section id="today" className="card sec todo">
        <h2>오늘 해 볼 한 가지</h2>
        <p className="todo-title">{r.firstPractice.title}</p>
        {r.firstPractice.prompt && (
          <>
            <p className="hint">아래 문장을 복사해서 평소 쓰는 AI에 붙여 넣어 보세요.</p>
            <div className="copy">{r.firstPractice.prompt}</div>
            <CopyBtn text={r.firstPractice.prompt} />
          </>
        )}
      </section>

      <section id="why" className="card sec">
        <h2>왜 막혔을까요?</h2>
        {r.blockers.map((b, i) => (
          <div className="item" key={i}>
            <h3>{b.title}</h3>
            <p className="reason">{b.why}</p>
            <p className="fix"><b>이렇게 해 보세요</b> {b.fix}</p>
          </div>
        ))}
      </section>

      <section id="courses" className="card sec">
        <h2>추천 교육</h2>
        {r.recommendations.length === 0 ? (
          <p className="hint">지금 접수 중이면서 맞는 교육을 찾지 못했어요. 아래 배울 순서부터 시작하고, 행사 일정을 다시 확인해 보세요.</p>
        ) : (
          <p className="hint">교육 이름을 누르면 해당 기관 사이트가 새 창으로 열려요.{hasConditional ? " '조건부 추천'은 정보가 부족해서 신청 전에 확인이 필요하다는 뜻이에요." : ""}</p>
        )}
        {r.recommendations.map((rec) => {
          const a = APPLY[rec.course.applyState];
          const href = safeHref(rec.course.link);
          return (
            <article className="item course" key={rec.courseId}>
              <h3>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{rec.course.title} <span aria-hidden>↗</span></a> : rec.course.title}</h3>
              {href && rec.course.linkKind === "calendar" && <p className="hint">행사 일정(달력) 페이지로 넘어가요. 날짜에서 교육 이름을 찾아 주세요.</p>}
              <p className="badges">
                <span className={`badge ${a.c}`}>{a.t}</span>
                {rec.verdict === "recommend" ? <span className="badge ok">추천</span> : <span className="badge warn">조건부 추천</span>}
              </p>
              <p className="meta2">{[rec.course.org ?? "주최 미확인", rec.course.applyCloseAt ? `접수 마감 ${rec.course.applyCloseAt}` : "", rec.course.venue ?? "", rec.course.cost ?? ""].filter(Boolean).join(" · ")}</p>
              {rec.course.mapQuery && (
                <p className="maplinks">
                  <span className="meta">위치 검색:</span>{" "}
                  <a className="btn ghost sm" href={kakaoMapUrl(rec.course.mapQuery)} target="_blank" rel="noopener noreferrer">카카오맵</a>{" "}
                  <a className="btn ghost sm" href={naverMapUrl(rec.course.mapQuery)} target="_blank" rel="noopener noreferrer">네이버지도</a>
                </p>
              )}
              <p className="reason">{rec.reason}</p>
              {rec.cautions.length > 0 && (
                <Details summary={`신청 전에 확인할 점 ${rec.cautions.length}가지`}>
                  <ul className="plain">{rec.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </Details>
              )}
              <WhyButton kind="course" id={rec.courseId} title={rec.course.title} reason={rec.reason} ctx={ctx} />
            </article>
          );
        })}
      </section>

      {r.videos.length > 0 && (
        <section id="videos" className="card sec">
          <h2>함께 보면 좋은 영상</h2>
          <p className="hint">제목을 누르면 유튜브로 넘어가요. 우리가 만든 영상이 아니라 외부 영상이에요.</p>
          {r.videos.map((v) => (
            <article className="item" key={v.id}>
              <h3><a href={v.url} target="_blank" rel="noopener noreferrer">{v.title} <span aria-hidden>↗</span></a></h3>
              <p className="meta2">{[v.channel, v.minutes ? `약 ${v.minutes}분` : ""].filter(Boolean).join(" · ")}</p>
              <p className="reason">{v.reason}</p>
              <WhyButton kind="video" id={v.id} title={v.title} channel={v.channel} reason={v.reason} ctx={ctx} />
            </article>
          ))}
        </section>
      )}

      <section id="steps" className="card sec">
        <h2>이 순서로 배워 보세요</h2>
        <ol className="steps2">
          {r.roadmap.map((s, i) => (
            <li key={i}>
              <div>
                <strong>{s.title}</strong>{s.minutes ? <span className="meta"> · 약 {s.minutes}분</span> : null}
                <div className="reason">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {r.dataGaps.length > 0 && (
        <section className="card sec">
          <Details summary="확인하지 못한 정보 보기">
            <ul className="plain">{r.dataGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </Details>
        </section>
      )}

      <button className="btn ghost" type="button" onClick={onReset}>다시 진단하기</button>
    </>
  );
}
