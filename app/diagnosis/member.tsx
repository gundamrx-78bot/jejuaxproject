"use client";
// 회원 기능: 이메일 로그인 링크, 진단 기록 저장(동의 후, 1년 보관), 본 영상 기록, 다시 보기, 기록 삭제.
// Supabase 설정(주소·공개 키)이 없으면 이 기능 전체가 숨겨지고 진단은 그대로 동작한다.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { Report } from "@/lib/agent/report";
import { getSupabase } from "@/lib/supabase";

export type SavedDiagnosis = { id: string; created_at: string; level: string; stuck: string; report: Report };
export type SavedVideo = { video_id: string; title: string; channel: string | null; minutes: number | null; viewed_at: string };
type Answers = Record<string, unknown>;

type Member = {
  enabled: boolean;
  user: User | null;
  consent: boolean;
  currentDiagnosisId: string | null;
  setCurrentDiagnosisId: (id: string | null) => void;
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  saveDiagnosis: (answers: Answers, report: Report) => Promise<string | null>;
  trackView: (v: { id: string; title: string; channel?: string; minutes?: number | null }) => void;
  loadHistory: () => Promise<{ diagnoses: SavedDiagnosis[]; videos: SavedVideo[] }>;
  deleteAll: () => Promise<boolean>;
};

const Ctx = createContext<Member | null>(null);
export const useMember = () => useContext(Ctx);
const nowIso = () => new Date().toISOString();

// 로그인 메일 링크를 누르면 화면이 새로 열려 방금 결과가 사라진다.
// 그래서 로그인 직전 결과를 이 브라우저에 1시간만 임시 보관했다가 로그인 후 다시 연다(서버로 보내지 않음).
const PENDING_KEY = "jejuax.pendingResult";
export function stashPending(report: Report, answers: Answers) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), report, answers })); } catch { /* 저장소를 못 쓰면 무시 */ }
}
export function takePending(): { report: Report; answers: Answers } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const v = JSON.parse(raw);
    if (!v || Date.now() - Number(v.at) > 3600_000 || !v.report?.level) return null;
    return { report: v.report, answers: v.answers ?? {} };
  } catch { return null; }
}

export function MemberProvider({ children }: { children: ReactNode }) {
  const sb = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [currentDiagnosisId, setCurrentDiagnosisId] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const consent = !!user?.user_metadata?.save_consent;

  const value: Member = {
    enabled: !!sb,
    user,
    consent,
    currentDiagnosisId,
    setCurrentDiagnosisId,
    async signIn(email) {
      if (!sb) return "회원 기능이 아직 준비되지 않았어요.";
      const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + "/diagnosis", shouldCreateUser: true } });
      return error ? "로그인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." : null;
    },
    async signOut() { if (sb) await sb.auth.signOut(); setCurrentDiagnosisId(null); },
    async saveDiagnosis(answers, report) {
      if (!sb || !user) return null;
      // 저장 동의를 회원 정보에 남긴다(동의 시각 포함). 이후 본 영상도 이 동의에 따라 저장한다.
      if (!consent) await sb.auth.updateUser({ data: { save_consent: true, save_consent_at: nowIso() } });
      const { data, error } = await sb.from("diagnoses")
        .insert({ answers, level: report.level.code, stuck: report.primaryStuck.code, report })
        .select("id").single();
      if (error || !data) return null;
      setCurrentDiagnosisId(data.id);
      return data.id as string;
    },
    trackView(v) {
      if (!sb || !user || !consent) return; // 동의한 회원만 기록
      void sb.from("video_views").upsert(
        { video_id: v.id, title: v.title.slice(0, 200), channel: v.channel?.slice(0, 100) ?? null, minutes: v.minutes ?? null, diagnosis_id: currentDiagnosisId, viewed_at: nowIso() },
        { onConflict: "user_id,video_id" },
      );
    },
    async loadHistory() {
      if (!sb || !user) return { diagnoses: [], videos: [] };
      const now = nowIso();
      const [d, v] = await Promise.all([
        sb.from("diagnoses").select("id, created_at, level, stuck, report").gt("expires_at", now).order("created_at", { ascending: false }).limit(10),
        sb.from("video_views").select("video_id, title, channel, minutes, viewed_at").gt("expires_at", now).order("viewed_at", { ascending: false }).limit(20),
      ]);
      return { diagnoses: (d.data ?? []) as SavedDiagnosis[], videos: (v.data ?? []) as SavedVideo[] };
    },
    async deleteAll() {
      if (!sb || !user) return false;
      const a = await sb.from("video_views").delete().eq("user_id", user.id);
      const b = await sb.from("diagnoses").delete().eq("user_id", user.id);
      if (a.error || b.error) return false;
      await sb.auth.updateUser({ data: { save_consent: false, save_consent_at: null } });
      setCurrentDiagnosisId(null);
      return true;
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 상단 회원 줄: 로그인 상태와 로그인/로그아웃 */
export function MemberBar() {
  const m = useMember();
  const [open, setOpen] = useState(false);
  if (!m?.enabled) return null;
  if (m.user) {
    return (
      <div className="memberbar">
        <span className="meta">{m.user.email} 로그인 중{m.consent ? " · 기록 저장 켜짐" : ""}</span>
        <button className="btn ghost sm" type="button" onClick={() => m.signOut()}>로그아웃</button>
      </div>
    );
  }
  return (
    <div className="memberbar">
      <span className="meta">로그인하면 진단 결과와 본 영상을 저장해 다음에 다시 볼 수 있어요.</span>
      {!open ? <button className="btn ghost sm" type="button" onClick={() => setOpen(true)}>로그인</button> : <LoginBox />}
    </div>
  );
}

export function LoginBox({ onBeforeSend }: { onBeforeSend?: () => void } = {}) {
  const m = useMember();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  if (!m?.enabled) return null;
  if (state === "sent") return <p className="hint" role="status">{email} 로 로그인 링크를 보냈어요. 메일의 링크를 누르면 이 화면으로 돌아와 로그인돼요.</p>;
  return (
    <form className="loginbox" onSubmit={async (e) => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setState("error"); setMsg("이메일 주소를 확인해 주세요."); return; }
      setState("sending");
      onBeforeSend?.();
      const err = await m.signIn(email);
      if (err) { setState("error"); setMsg(err); } else setState("sent");
    }}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" aria-label="이메일 주소" />
      <button className="btn sm" type="submit" disabled={state === "sending"}>{state === "sending" ? "보내는 중…" : "로그인 링크 받기"}</button>
      {state === "error" && <p className="err" role="alert">{msg}</p>}
    </form>
  );
}

/** 진단 결과 아래: 저장 동의와 저장 버튼 */
export function SaveBox({ report, answers, savedAlready }: { report: Report; answers: Answers; savedAlready: boolean }) {
  const m = useMember();
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(savedAlready ? "saved" : "idle");
  if (!m?.enabled) return null;
  if (state === "saved") return <section className="card sec"><p role="status">이 진단 결과가 내 기록에 저장돼 있어요. 다음에 로그인하면 다시 볼 수 있어요.</p></section>;
  if (!m.user) {
    return (
      <section className="card sec">
        <h2>결과 저장하기</h2>
        <p className="hint">로그인하면 이 결과와 앞으로 본 영상을 저장해 다음에 다시 볼 수 있어요.</p>
        <LoginBox onBeforeSend={() => stashPending(report, answers)} />
        <p className="hint">메일의 로그인 링크를 1시간 안에 누르면, 로그인된 상태로 이 결과가 다시 열려요. 그때 저장 버튼을 눌러 주세요.</p>
      </section>
    );
  }
  return (
    <section className="card sec">
      <h2>결과 저장하기</h2>
      <label className="consent">
        <input type="checkbox" checked={agree || m.consent} disabled={m.consent} onChange={(e) => setAgree(e.target.checked)} />
        <span>진단 결과(선택한 답변과 AI가 쓴 결과 문장)와 이 사이트에서 재생한 영상 목록을 저장하는 데 동의해요. 하시는 일·막힌 상황처럼 직접 쓴 글은 저장하지 않아요. 기록은 1년 동안 보관한 뒤 지워지고, 언제든 직접 지울 수 있어요.</span>
      </label>
      <button className="btn" type="button" disabled={!(agree || m.consent) || state === "saving"} onClick={async () => {
        setState("saving");
        const id = await m.saveDiagnosis(answers, report);
        setState(id ? "saved" : "error");
      }}>{state === "saving" ? "저장하는 중…" : "내 기록에 저장"}</button>
      {state === "error" && <p className="err" role="alert">저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
    </section>
  );
}

/** 첫 화면: 저장된 진단과 본 영상 다시 보기 */
export function HistoryPanel({ onOpen, renderVideo }: { onOpen: (d: SavedDiagnosis) => void; renderVideo: (v: SavedVideo) => ReactNode }) {
  const m = useMember();
  const [data, setData] = useState<{ diagnoses: SavedDiagnosis[]; videos: SavedVideo[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const userId = m?.user?.id;
  useEffect(() => {
    if (!m?.enabled || !userId) { setData(null); return; }
    let alive = true;
    m.loadHistory().then((h) => { if (alive) setData(h); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  if (!m?.enabled || !m.user || !data) return null;
  if (!data.diagnoses.length && !data.videos.length) return null;
  const fmt = (s: string) => new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  return (
    <section className="card sec history">
      <h2>내 기록</h2>
      {data.diagnoses.length > 0 && (
        <>
          <p className="hint">지난 진단 결과를 다시 볼 수 있어요.</p>
          <ul className="histlist">
            {data.diagnoses.map((d) => (
              <li key={d.id}>
                <span>{fmt(d.created_at)} · {d.report.level.name} 단계 · {d.report.primaryStuck.name}</span>
                <button className="btn ghost sm" type="button" onClick={() => onOpen(d)}>결과 다시 보기</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.videos.length > 0 && (
        <details className="more" open>
          <summary>내가 본 영상 {data.videos.length}개</summary>
          <div className="more-body">{data.videos.map((v) => <div key={v.video_id} className="item">{renderVideo(v)}</div>)}</div>
        </details>
      )}
      {!confirm ? (
        <button className="btn ghost sm" type="button" onClick={() => setConfirm(true)}>내 기록 모두 지우기</button>
      ) : (
        <p className="confirmrow">
          <span>저장된 진단과 본 영상 기록을 모두 지울까요? 되돌릴 수 없어요.</span>{" "}
          <button className="btn sm" type="button" onClick={async () => { if (await m.deleteAll()) setData({ diagnoses: [], videos: [] }); setConfirm(false); }}>모두 지우기</button>{" "}
          <button className="btn ghost sm" type="button" onClick={() => setConfirm(false)}>취소</button>
        </p>
      )}
    </section>
  );
}
